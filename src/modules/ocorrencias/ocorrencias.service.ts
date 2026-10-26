import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { comTransacao, consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { booleanoQuery, textoOpcional, z } from "@/lib/validacao";
import {
  DESCRICAO_TIPO_OCORRENCIA,
  GRAVIDADE_PADRAO,
  GRAVIDADES,
  TIPOS_OCORRENCIA,
  type Gravidade,
  type StatusInfraestrutura,
  type TipoOcorrencia,
} from "../dominio";

export const esquemaPontoPoligono = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type PontoPoligono = z.infer<typeof esquemaPontoPoligono>;

export const esquemaRegistrarOcorrencia = z
  .object({
    tipo: z.enum(TIPOS_OCORRENCIA),
    gravidade: z.enum(GRAVIDADES).optional(),
    descricao: textoOpcional(500),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    poligono: z
      .array(esquemaPontoPoligono)
      .min(3, "Demarque ao menos 3 marcadores no mapa para delimitar a área de risco (polígono).")
      .max(50, "O polígono pode conter no máximo 50 vértices.")
      .nullish(),
  })
  .refine((d) => (d.latitude == null) === (d.longitude == null), {
    message: "Informe latitude e longitude juntas (ou nenhuma, para usar o local do abrigo).",
    path: ["longitude"],
  })
  .refine((d) => d.tipo !== "OUTRO" || !!d.descricao, {
    message: "Ocorrências do tipo OUTRO exigem descrição.",
    path: ["descricao"],
  })
  .refine((d) => d.tipo !== "AREA_RISCO" || (Array.isArray(d.poligono) && d.poligono.length >= 3), {
    message: "Ocorrências do tipo AREA_RISCO exigem a demarcação de um polígono com ao menos 3 pontos no mapa.",
    path: ["poligono"],
  });

export const esquemaResolverOcorrencia = z.object({ observacao: textoOpcional(500) });

export const esquemaFiltroOcorrencias = z.object({ ativas: booleanoQuery.optional() });

const COLUNAS_OCORRENCIA = `
  o.id, o.id_abrigo AS "idAbrigo", o.tipo, o.gravidade, o.descricao, o.latitude, o.longitude,
  o.poligono_risco AS "poligono",
  o.data_registro AS "dataRegistro", o.data_resolucao AS "dataResolucao",
  o.id_usuario_registro AS "idUsuarioRegistro", ur.nome AS "usuarioRegistro", ur.nome AS "registradoPor",
  o.id_usuario_resolucao AS "idUsuarioResolucao", us.nome AS "usuarioResolucao", us.nome AS "resolvidoPor"`;

const FROM_OCORRENCIA = `
  FROM ocorrencia_infraestrutura o
  JOIN usuario ur ON ur.id = o.id_usuario_registro
  LEFT JOIN usuario us ON us.id = o.id_usuario_resolucao`;

interface Ocorrencia {
  id: number;
  idAbrigo: number;
  tipo: TipoOcorrencia;
  gravidade: Gravidade;
  descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  poligono: PontoPoligono[] | null;
  dataRegistro: Date;
  dataResolucao: Date | null;
}

const apresentar = <T extends Ocorrencia>(o: T) => ({
  ...o,
  descricaoTipo: DESCRICAO_TIPO_OCORRENCIA[o.tipo],
  ativa: o.dataResolucao === null,
});

async function statusAtual(idAbrigo: number): Promise<StatusInfraestrutura> {
  const linha = await consultarUm<{ status: StatusInfraestrutura }>(
    "SELECT status_infraestrutura AS status FROM abrigo WHERE id = $1",
    [idAbrigo],
  );
  return linha!.status;
}

/** RF05 - ocorrências do abrigo (por padrão, todas; `ativas=true` filtra as não resolvidas). */
export async function listarOcorrencias(ctx: Contexto, idAbrigo: number, filtros: z.infer<typeof esquemaFiltroOcorrencias>) {
  exigirPermissao(ctx.usuario, "ocorrencia:ver", idAbrigo);
  const abrigo = await consultarUm("SELECT id FROM abrigo WHERE id = $1", [idAbrigo]);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");

  const linhas = await consultar<Ocorrencia>(
    `SELECT ${COLUNAS_OCORRENCIA} ${FROM_OCORRENCIA}
      WHERE o.id_abrigo = $1 AND ($2::boolean IS NULL OR (o.data_resolucao IS NULL) = $2)
      ORDER BY (o.data_resolucao IS NULL) DESC, o.data_registro DESC`,
    [idAbrigo, filtros.ativas ?? null],
  );
  return linhas.map(apresentar);
}

/** RF05 - registra incidente (falta de energia, via colapsada, área de risco poligonal...). Reflete no mapa público (RF09). */
export async function registrarOcorrencia(
  ctx: Contexto,
  idAbrigo: number,
  dados: z.infer<typeof esquemaRegistrarOcorrencia>,
) {
  exigirPermissao(ctx.usuario, "ocorrencia:gerenciar", idAbrigo);
  const abrigo = await consultarUm<{ nome: string; ativo: boolean }>("SELECT nome, ativo FROM abrigo WHERE id = $1", [idAbrigo]);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  if (!abrigo.ativo) throw erros.conflito("ABRIGO_INATIVO", `O abrigo "${abrigo.nome}" está desativado.`);

  const gravidade = dados.gravidade ?? GRAVIDADE_PADRAO[dados.tipo];
  const poligonoValido = dados.poligono && dados.poligono.length >= 3 ? dados.poligono : null;
  const centroide = poligonoValido
    ? {
        lat: Number((poligonoValido.reduce((acc, p) => acc + p.lat, 0) / poligonoValido.length).toFixed(6)),
        lng: Number((poligonoValido.reduce((acc, p) => acc + p.lng, 0) / poligonoValido.length).toFixed(6)),
      }
    : null;

  const latitudeFinal = dados.latitude ?? centroide?.lat ?? null;
  const longitudeFinal = dados.longitude ?? centroide?.lng ?? null;

  const registrada = await consultarUm<{ id: number }>(
    `INSERT INTO ocorrencia_infraestrutura (
       id_abrigo, id_usuario_registro, tipo, gravidade, descricao, latitude, longitude, poligono_risco
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
    [
      idAbrigo,
      ctx.usuario.id,
      dados.tipo,
      gravidade,
      dados.descricao ?? null,
      latitudeFinal,
      longitudeFinal,
      poligonoValido ? JSON.stringify(poligonoValido) : null,
    ],
  );
  const ocorrencia = await consultarUm<Ocorrencia>(`SELECT ${COLUNAS_OCORRENCIA} ${FROM_OCORRENCIA} WHERE o.id = $1`, [
    registrada!.id,
  ]);

  auditar(ctx, {
    acao: "OCORRENCIA_REGISTRADA",
    descricao: `${DESCRICAO_TIPO_OCORRENCIA[dados.tipo]} (${gravidade}) em "${abrigo.nome}"`,
    idAbrigo,
    detalhes: { idOcorrencia: registrada!.id, ...dados, gravidade },
  });

  return { ocorrencia: apresentar(ocorrencia!), statusInfraestrutura: await statusAtual(idAbrigo) };
}

export async function resolverOcorrencia(
  ctx: Contexto,
  idAbrigo: number,
  idOcorrencia: number,
  dados: z.infer<typeof esquemaResolverOcorrencia>,
) {
  exigirPermissao(ctx.usuario, "ocorrencia:gerenciar", idAbrigo);

  const ocorrencia = await comTransacao(async (client) => {
    const atual = await consultarUm<{ id: number; tipo: TipoOcorrencia; resolvida: boolean }>(
      `SELECT id, tipo, data_resolucao IS NOT NULL AS resolvida
         FROM ocorrencia_infraestrutura WHERE id = $1 AND id_abrigo = $2 FOR UPDATE`,
      [idOcorrencia, idAbrigo],
      client,
    );
    if (!atual) throw erros.naoEncontrado("Ocorrência");
    if (atual.resolvida) throw erros.conflito("OCORRENCIA_JA_RESOLVIDA", "Esta ocorrência já foi resolvida.");

    await client.query(
      "UPDATE ocorrencia_infraestrutura SET data_resolucao = now(), id_usuario_resolucao = $2 WHERE id = $1",
      [idOcorrencia, ctx.usuario.id],
    );
    return consultarUm<Ocorrencia>(`SELECT ${COLUNAS_OCORRENCIA} ${FROM_OCORRENCIA} WHERE o.id = $1`, [idOcorrencia], client);
  });

  auditar(ctx, {
    acao: "OCORRENCIA_RESOLVIDA",
    descricao: `Ocorrência resolvida: ${DESCRICAO_TIPO_OCORRENCIA[ocorrencia!.tipo]}`,
    idAbrigo,
    detalhes: { idOcorrencia, observacao: dados.observacao ?? null },
  });

  return { ocorrencia: apresentar(ocorrencia!), statusInfraestrutura: await statusAtual(idAbrigo) };
}
