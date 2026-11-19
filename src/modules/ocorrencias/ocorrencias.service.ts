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
  TIPOS_OCORRENCIA_REGIONAL,
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

/**
 * Ocorrência regional (sem abrigo): só tipos do território e sempre com local
 * no mapa, ponto ou área (sem abrigo não há "local do abrigo" para usar).
 */
export const esquemaRegistrarOcorrenciaRegional = esquemaRegistrarOcorrencia
  .refine((d) => (TIPOS_OCORRENCIA_REGIONAL as readonly string[]).includes(d.tipo), {
    message: "Ocorrência regional só pode ser via bloqueada, área de risco, alagamento, deslizamento ou outra.",
    path: ["tipo"],
  })
  .refine((d) => (d.poligono?.length ?? 0) >= 3 || d.latitude != null, {
    message: "Ocorrência regional precisa de um local no mapa (ponto ou área).",
    path: ["latitude"],
  });

export const esquemaResolverOcorrencia = z.object({ observacao: textoOpcional(500) });

export const esquemaModerarOcorrencia = z.object({
  acao: z.enum(["APROVAR", "REJEITAR"]),
  observacao: textoOpcional(500),
});

export const esquemaFiltroOcorrencias = z.object({ ativas: booleanoQuery.optional() });

const COLUNAS_OCORRENCIA = `
  o.id, o.id_abrigo AS "idAbrigo", o.tipo, o.gravidade, o.descricao, o.latitude, o.longitude,
  fn_vertices_area_risco(o.area_risco) AS "poligono",
  o.status_validacao AS "statusValidacao",
  o.relator_nome AS "relatorNome",
  o.relator_contato AS "relatorContato",
  (o.id_usuario_registro IS NULL) AS "origemCidada",
  o.data_registro AS "dataRegistro", o.data_resolucao AS "dataResolucao",
  o.id_usuario_registro AS "idUsuarioRegistro",
  COALESCE(ur.nome, o.relator_nome, 'Reporte Cidadão') AS "usuarioRegistro",
  COALESCE(ur.nome, o.relator_nome, 'Reporte Cidadão') AS "registradoPor",
  o.id_usuario_resolucao AS "idUsuarioResolucao", us.nome AS "usuarioResolucao", us.nome AS "resolvidoPor"`;

const FROM_OCORRENCIA = `
  FROM ocorrencia_infraestrutura o
  LEFT JOIN usuario ur ON ur.id = o.id_usuario_registro
  LEFT JOIN usuario us ON us.id = o.id_usuario_resolucao`;

interface Ocorrencia {
  id: number;
  /** Nulo em ocorrência regional (do território, sem abrigo). */
  idAbrigo: number | null;
  tipo: TipoOcorrencia;
  gravidade: Gravidade;
  descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  poligono: PontoPoligono[] | null;
  statusValidacao: "PENDENTE" | "APROVADA" | "REJEITADA";
  relatorNome: string | null;
  relatorContato: string | null;
  origemCidada: boolean;
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

/** Raio e janela de tempo da corroboração comunitária (Etapa 3 do plano de integração). */
export const RAIO_CORROBORACAO_M = 300;
export const JANELA_CORROBORACAO_H = 2;

/**
 * Corroboração de um reporte pendente: quantas outras ocorrências do mesmo tipo
 * estão a até RAIO_CORROBORACAO_M dele, em qualquer abrigo (ou regionais).
 * - `relatosProximos`: outros reportes PENDENTES feitos até JANELA_CORROBORACAO_H
 *   antes ou depois deste (relatos independentes do mesmo problema);
 * - `confirmadosProximos`: alertas já APROVADOS e ainda ativos no local.
 * Só para reportes pendentes com local: é o que ajuda a moderação a priorizar.
 */
const CORROBORACAO = `
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE v.status_validacao = 'PENDENTE')::int AS pendentes,
           count(*) FILTER (WHERE v.status_validacao = 'APROVADA')::int AS aprovados
      FROM ocorrencia_infraestrutura v
     WHERE o.status_validacao = 'PENDENTE' AND o.data_resolucao IS NULL AND o.latitude IS NOT NULL
       AND v.id <> o.id AND v.tipo = o.tipo AND v.data_resolucao IS NULL AND v.latitude IS NOT NULL
       AND (
         v.status_validacao = 'APROVADA'
         OR (v.status_validacao = 'PENDENTE'
             AND v.data_registro BETWEEN o.data_registro - make_interval(hours => ${JANELA_CORROBORACAO_H})
                                     AND o.data_registro + make_interval(hours => ${JANELA_CORROBORACAO_H}))
       )
       AND ST_DWithin(
         ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
         ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
         ${RAIO_CORROBORACAO_M}
       )
  ) corroboracao ON TRUE`;

/**
 * RF05 - ocorrências do abrigo (por padrão, todas; `ativas=true` filtra as não
 * resolvidas). Reportes pendentes vêm primeiro e, entre eles, os mais
 * corroborados por outros relatos ou por alertas já publicados no local.
 */
export async function listarOcorrencias(ctx: Contexto, idAbrigo: number, filtros: z.infer<typeof esquemaFiltroOcorrencias>) {
  exigirPermissao(ctx.usuario, "ocorrencia:ver", idAbrigo);
  const abrigo = await consultarUm("SELECT id FROM abrigo WHERE id = $1", [idAbrigo]);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");

  const linhas = await consultar<Ocorrencia & { relatosProximos: number; confirmadosProximos: number }>(
    `SELECT ${COLUNAS_OCORRENCIA},
            COALESCE(corroboracao.pendentes, 0) AS "relatosProximos",
            COALESCE(corroboracao.aprovados, 0) AS "confirmadosProximos"
       ${FROM_OCORRENCIA}
       ${CORROBORACAO}
      WHERE o.id_abrigo = $1 AND ($2::boolean IS NULL OR (o.data_resolucao IS NULL) = $2)
      ORDER BY (o.data_resolucao IS NULL) DESC, (o.status_validacao = 'PENDENTE') DESC,
               COALESCE(corroboracao.pendentes, 0) + COALESCE(corroboracao.aprovados, 0) DESC,
               o.data_registro DESC`,
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

  // Com polígono, o banco monta a geometria PostGIS, rejeita bordas que se
  // cruzam e posiciona o rótulo dentro da área (ST_PointOnSurface).
  const registrada = await consultarUm<{ id: number }>(
    `INSERT INTO ocorrencia_infraestrutura (
       id_abrigo, id_usuario_registro, tipo, gravidade, descricao, latitude, longitude, area_risco
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, fn_area_risco_de_vertices($8::jsonb)) RETURNING id`,
    [
      idAbrigo,
      ctx.usuario.id,
      dados.tipo,
      gravidade,
      dados.descricao ?? null,
      poligonoValido ? null : (dados.latitude ?? null),
      poligonoValido ? null : (dados.longitude ?? null),
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

/**
 * Encerra uma ocorrência do abrigo (`idAbrigo`) ou regional (`idAbrigo` nulo).
 * O filtro pelo abrigo impede encerrar, pela rota de um abrigo, a ocorrência de
 * outro (ou uma regional).
 */
async function encerrarOcorrencia(
  ctx: Contexto,
  idAbrigo: number | null,
  idOcorrencia: number,
  dados: z.infer<typeof esquemaResolverOcorrencia>,
) {
  const ocorrencia = await comTransacao(async (client) => {
    const atual = await consultarUm<{ id: number; tipo: TipoOcorrencia; resolvida: boolean }>(
      `SELECT id, tipo, data_resolucao IS NOT NULL AS resolvida
         FROM ocorrencia_infraestrutura
        WHERE id = $1 AND id_abrigo IS NOT DISTINCT FROM $2 FOR UPDATE`,
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
    descricao: `Ocorrência ${idAbrigo === null ? "regional " : ""}resolvida: ${DESCRICAO_TIPO_OCORRENCIA[ocorrencia!.tipo]}`,
    idAbrigo,
    detalhes: { idOcorrencia, regional: idAbrigo === null, observacao: dados.observacao ?? null },
  });
  return apresentar(ocorrencia!);
}

export async function resolverOcorrencia(
  ctx: Contexto,
  idAbrigo: number,
  idOcorrencia: number,
  dados: z.infer<typeof esquemaResolverOcorrencia>,
) {
  exigirPermissao(ctx.usuario, "ocorrencia:gerenciar", idAbrigo);
  const ocorrencia = await encerrarOcorrencia(ctx, idAbrigo, idOcorrencia, dados);
  return { ocorrencia, statusInfraestrutura: await statusAtual(idAbrigo) };
}

// -----------------------------------------------------------------------------
// Ocorrências regionais (sem abrigo) - Etapa 2 do plano de integração
// -----------------------------------------------------------------------------

/**
 * Ocorrências do território (via interditada, área de risco...), registradas
 * pela Defesa Civil ou pelo ADMIN. Qualquer pessoa da equipe pode consultar:
 * afetam o acesso a todos os abrigos.
 */
export async function listarOcorrenciasRegionais(ctx: Contexto, filtros: z.infer<typeof esquemaFiltroOcorrencias>) {
  exigirPermissao(ctx.usuario, "ocorrencia:ver");
  const linhas = await consultar<Ocorrencia>(
    `SELECT ${COLUNAS_OCORRENCIA} ${FROM_OCORRENCIA}
      WHERE o.id_abrigo IS NULL AND ($1::boolean IS NULL OR (o.data_resolucao IS NULL) = $1)
      ORDER BY (o.data_resolucao IS NULL) DESC, o.data_registro DESC`,
    [filtros.ativas ?? null],
  );
  return linhas.map(apresentar);
}

/**
 * Registra uma ocorrência regional. Já entra aprovada e vai para o mapa
 * público. Uma área de risco regional marca os abrigos que ficam dentro dela
 * (`emAreaDeRisco`), sem mudar o status de infraestrutura deles: o status fala
 * da edificação de cada abrigo.
 */
export async function registrarOcorrenciaRegional(ctx: Contexto, dados: z.infer<typeof esquemaRegistrarOcorrenciaRegional>) {
  exigirPermissao(ctx.usuario, "ocorrencia:regional");

  const gravidade = dados.gravidade ?? GRAVIDADE_PADRAO[dados.tipo];
  const poligonoValido = dados.poligono && dados.poligono.length >= 3 ? dados.poligono : null;

  const registrada = await consultarUm<{ id: number }>(
    `INSERT INTO ocorrencia_infraestrutura (
       id_abrigo, id_usuario_registro, tipo, gravidade, descricao, latitude, longitude, area_risco
     )
     VALUES (NULL, $1, $2, $3, $4, $5, $6, fn_area_risco_de_vertices($7::jsonb)) RETURNING id`,
    [
      ctx.usuario.id,
      dados.tipo,
      gravidade,
      dados.descricao ?? null,
      poligonoValido ? null : (dados.latitude ?? null),
      poligonoValido ? null : (dados.longitude ?? null),
      poligonoValido ? JSON.stringify(poligonoValido) : null,
    ],
  );
  const ocorrencia = await consultarUm<Ocorrencia>(`SELECT ${COLUNAS_OCORRENCIA} ${FROM_OCORRENCIA} WHERE o.id = $1`, [
    registrada!.id,
  ]);

  auditar(ctx, {
    acao: "OCORRENCIA_REGISTRADA",
    descricao: `${DESCRICAO_TIPO_OCORRENCIA[dados.tipo]} (${gravidade}), ocorrência regional`,
    idAbrigo: null,
    detalhes: { idOcorrencia: registrada!.id, regional: true, ...dados, gravidade },
  });

  return { ocorrencia: apresentar(ocorrencia!) };
}

export async function resolverOcorrenciaRegional(ctx: Contexto, idOcorrencia: number, dados: z.infer<typeof esquemaResolverOcorrencia>) {
  exigirPermissao(ctx.usuario, "ocorrencia:regional");
  return { ocorrencia: await encerrarOcorrencia(ctx, null, idOcorrencia, dados) };
}

/**
 * Moderação de reporte cidadão (crowdsourcing inspirado em Ushahidi/Waze):
 * - APROVAR: promove para APROVADA e publica no mapa público (RF09).
 * - REJEITAR: marca como REJEITADA e encerra o reporte sem afetar o abrigo.
 */
export async function moderarOcorrencia(
  ctx: Contexto,
  idAbrigo: number,
  idOcorrencia: number,
  dados: z.infer<typeof esquemaModerarOcorrencia>,
) {
  exigirPermissao(ctx.usuario, "ocorrencia:gerenciar", idAbrigo);

  const ocorrencia = await comTransacao(async (client) => {
    const atual = await consultarUm<{
      id: number;
      tipo: TipoOcorrencia;
      statusValidacao: "PENDENTE" | "APROVADA" | "REJEITADA";
      resolvida: boolean;
    }>(
      `SELECT id, tipo, status_validacao AS "statusValidacao", data_resolucao IS NOT NULL AS resolvida
         FROM ocorrencia_infraestrutura WHERE id = $1 AND id_abrigo = $2 FOR UPDATE`,
      [idOcorrencia, idAbrigo],
      client,
    );
    if (!atual) throw erros.naoEncontrado("Ocorrência");
    if (atual.resolvida) throw erros.conflito("OCORRENCIA_JA_RESOLVIDA", "Esta ocorrência já foi encerrada.");
    if (atual.statusValidacao !== "PENDENTE") {
      throw erros.conflito("OCORRENCIA_JA_MODERADA", "Este reporte já foi moderado anteriormente.");
    }

    if (dados.acao === "APROVAR") {
      await client.query(
        `UPDATE ocorrencia_infraestrutura
            SET status_validacao = 'APROVADA',
                id_usuario_registro = COALESCE(id_usuario_registro, $2)
          WHERE id = $1`,
        [idOcorrencia, ctx.usuario.id],
      );
    } else {
      await client.query(
        `UPDATE ocorrencia_infraestrutura
            SET status_validacao = 'REJEITADA',
                data_resolucao = now(),
                id_usuario_resolucao = $2
          WHERE id = $1`,
        [idOcorrencia, ctx.usuario.id],
      );
    }

    return consultarUm<Ocorrencia>(`SELECT ${COLUNAS_OCORRENCIA} ${FROM_OCORRENCIA} WHERE o.id = $1`, [idOcorrencia], client);
  });

  auditar(ctx, {
    acao: dados.acao === "APROVAR" ? "REPORTE_CIDADAO_APROVADO" : "REPORTE_CIDADAO_REJEITADO",
    descricao: `Reporte cidadão (${DESCRICAO_TIPO_OCORRENCIA[ocorrencia!.tipo]}) ${dados.acao === "APROVAR" ? "aprovado" : "descartado"}`,
    idAbrigo,
    detalhes: { idOcorrencia, acao: dados.acao, observacao: dados.observacao ?? null },
  });

  return { ocorrencia: apresentar(ocorrencia!), statusInfraestrutura: await statusAtual(idAbrigo) };
}
