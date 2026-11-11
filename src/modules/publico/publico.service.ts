import { consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { extrairCidade, gerarPayloadPixBrCode } from "@/lib/pix";
import { escaparIlike } from "@/lib/sql";
import { booleanoQuery, esquemaId, textoObrigatorio, textoOpcional, z } from "@/lib/validacao";
import { linksNavegacao, resumirOcupacao } from "../abrigos/ocupacao";
import {
  DESCRICAO_TIPO_OCORRENCIA,
  GRAVIDADE_PADRAO,
  GRAVIDADES,

  type Gravidade,
  type StatusInfraestrutura,
  type TipoOcorrencia,
} from "../dominio";
import type { PontoPoligono } from "../ocorrencias/ocorrencias.service";

// API pública (RNF02): sem login. Nunca expõe dados pessoais sensíveis completos
// (CPF inteiro, usuários) nem quantidades de estoque — apenas o necessário para o mapa.

/**
 * Cache HTTP para CDN de borda (Cloudflare, Vercel Edge, CloudFront) e proxies.
 * Inclui `stale-if-error=300` para que a CDN continue entregando o último mapa
 * conhecido por até 5 min caso a instância de origem sofra pico extremo.
 */
export const CACHE_PUBLICO = {
  "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30, stale-if-error=300",
  "CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=60, stale-if-error=300",
};

const separarPorVirgula = (valor: string) =>
  valor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const esquemaFiltroMapa = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    raioKm: z.coerce.number().positive().max(500).optional(),
    /** Slugs de categoria: ?necessidade=agua,cama-e-banho */
    necessidade: z
      .string()
      .transform(separarPorVirgula)
      .pipe(z.array(z.string().regex(/^[a-z0-9-]+$/, "Slug de categoria inválido.")).max(20))
      .optional(),
    /** Ids de item: ?item=3,7 */
    item: z
      .string()
      .transform(separarPorVirgula)
      .pipe(z.array(z.string().regex(/^[1-9]\d{0,9}$/, "Id de item inválido.").transform(Number)).max(20))
      .optional(),
    somenteDestaque: booleanoQuery.optional(),
    aceitaPets: booleanoQuery.optional(),
    acessivelPcd: booleanoQuery.optional(),
    formato: z.enum(["json", "geojson"]).default("json"),
  })
  .refine((d) => (d.lat === undefined) === (d.lng === undefined), {
    message: "Informe lat e lng juntos.",
    path: ["lng"],
  })
  .refine((d) => d.raioKm === undefined || d.lat !== undefined, {
    message: "raioKm exige a localização (lat/lng).",
    path: ["raioKm"],
  });

export type FiltroMapa = z.infer<typeof esquemaFiltroMapa>;

interface ItemNecessidade {
  id: number;
  nome: string;
  categoria: string;
}

export interface LinhaAbrigoPublico {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  latitude: number;
  longitude: number;
  capacidadeMaxima: number;
  lotacaoAtual: number;
  statusInfraestrutura: StatusInfraestrutura;
  aceitaPets: boolean;
  acessivelPcd: boolean;
  atualizadoEm: Date;
  chavePix: string | null;
  titularPix: string | null;
  distanciaKm: number | null;
  urgentes: ItemNecessidade[];
  bloqueados: ItemNecessidade[];
  necessidadesAtualizadasEm: Date | null;
  ocorrencias: { tipo: TipoOcorrencia; gravidade: Gravidade }[];
  emAreaDeRisco: boolean;
  rotaCruzaAreaRisco: boolean;
}

const SQL_ABRIGOS_PUBLICOS = `
  SELECT a.id, a.nome, a.endereco, a.telefone, a.latitude, a.longitude,
         a.capacidade_maxima AS "capacidadeMaxima", a.lotacao_atual AS "lotacaoAtual",
         a.status_infraestrutura AS "statusInfraestrutura",
         a.aceita_pets AS "aceitaPets", a.acessivel_pcd AS "acessivelPcd",
         a.atualizado_em AS "atualizadoEm",
         a.chave_pix AS "chavePix", a.titular_pix AS "titularPix",
         CASE WHEN $1::float8 IS NULL THEN NULL
              ELSE round((ST_Distance(a.localizacao, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000)::numeric, 2)
         END AS "distanciaKm",
         COALESCE(n.urgentes, '[]') AS urgentes,
         COALESCE(n.bloqueados, '[]') AS bloqueados,
         n.atualizado_em AS "necessidadesAtualizadasEm",
         COALESCE(o.ocorrencias, '[]') AS ocorrencias,
         -- Abrigo dentro de alguma área de risco ativa aprovada (de qualquer abrigo), via índice GiST.
         EXISTS (
           SELECT 1 FROM ocorrencia_infraestrutura r
            WHERE r.area_risco IS NOT NULL AND r.data_resolucao IS NULL AND r.status_validacao = 'APROVADA'
              AND ST_Covers(r.area_risco, a.localizacao)
         ) AS "emAreaDeRisco",
         -- Trajeto em linha reta entre o usuário ($2, $1) e o abrigo cruza algum polígono de área de risco (PostGIS ST_Intersects).
         CASE WHEN $1::float8 IS NULL THEN FALSE
              ELSE EXISTS (
                SELECT 1 FROM ocorrencia_infraestrutura r
                 WHERE r.area_risco IS NOT NULL AND r.data_resolucao IS NULL AND r.status_validacao = 'APROVADA'
                   AND ST_Intersects(
                     r.area_risco::geometry,
                     ST_MakeLine(
                       ST_SetSRID(ST_MakePoint($2, $1), 4326),
                       ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)
                     )
                   )
              )
         END AS "rotaCruzaAreaRisco"
    FROM abrigo a
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', i.id, 'nome', i.nome_micro, 'categoria', c.slug) ORDER BY i.nome_micro)
               FILTER (WHERE s.codigo = 'URGENTE') AS urgentes,
             json_agg(json_build_object('id', i.id, 'nome', i.nome_micro, 'categoria', c.slug) ORDER BY i.nome_micro)
               FILTER (WHERE s.codigo = 'BLOQUEADO') AS bloqueados,
             max(e.atualizado_em) AS atualizado_em
        FROM estoque_abrigo e
        JOIN item i ON i.id = e.id_item AND i.ativo
        JOIN categoria_item c ON c.id = i.id_categoria
        JOIN status_necessidade s ON s.id = e.id_status_necessidade
       WHERE e.id_abrigo = a.id
    ) n ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('tipo', oc.tipo, 'gravidade', oc.gravidade) ORDER BY oc.data_registro) AS ocorrencias
        FROM ocorrencia_infraestrutura oc
       WHERE oc.id_abrigo = a.id AND oc.data_resolucao IS NULL AND oc.status_validacao = 'APROVADA'
    ) o ON TRUE
   WHERE a.ativo`;

function apresentarResumo(linha: LinhaAbrigoPublico, filtros: FiltroMapa) {
  const temFiltro = Boolean(filtros.necessidade?.length || filtros.item?.length);
  // Categoria E item quando os dois vêm (o mapa escolhe a categoria e depois o
  // item dentro dela); dentro de cada lista, qualquer valor serve.
  const atendeFiltro = (item: ItemNecessidade) =>
    (!filtros.necessidade?.length || filtros.necessidade.includes(item.categoria)) &&
    (!filtros.item?.length || filtros.item.includes(item.id));

  return {
    id: linha.id,
    nome: linha.nome,
    endereco: linha.endereco,
    telefone: linha.telefone,
    latitude: linha.latitude,
    longitude: linha.longitude,
    ocupacao: resumirOcupacao(linha.lotacaoAtual, linha.capacidadeMaxima),
    statusInfraestrutura: linha.statusInfraestrutura,
    aceitaPets: linha.aceitaPets,
    acessivelPcd: linha.acessivelPcd,
    ocorrenciasAtivas: linha.ocorrencias,
    emAreaDeRisco: linha.emAreaDeRisco,
    rotaCruzaAreaRisco: linha.rotaCruzaAreaRisco ?? false,
    necessidades: { urgentes: linha.urgentes, bloqueados: linha.bloqueados },
    // RF08: destaca quem precisa URGENTE do que o doador tem; BLOQUEADO nunca é destacado.
    destaque: temFiltro ? linha.urgentes.some(atendeFiltro) : null,
    distanciaKm: linha.distanciaKm,
    atualizadoEm:
      linha.necessidadesAtualizadasEm && linha.necessidadesAtualizadasEm > linha.atualizadoEm
        ? linha.necessidadesAtualizadasEm
        : linha.atualizadoEm,
  };
}

export type AbrigoPublico = ReturnType<typeof apresentarResumo>;

/** Linhas do mapa (com distância e raio via PostGIS quando há lat/lng). */
export function consultarLinhasAbrigosPublicos(
  filtros: Pick<FiltroMapa, "lat" | "lng" | "raioKm">,
): Promise<LinhaAbrigoPublico[]> {
  return consultar<LinhaAbrigoPublico>(
    `${SQL_ABRIGOS_PUBLICOS}
       AND ($3::float8 IS NULL
            OR ST_DWithin(a.localizacao, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1000))`,
    [filtros.lat ?? null, filtros.lng ?? null, filtros.raioKm ?? null],
  );
}

/**
 * RF06 / RF08 - abrigos ativos para o mapa. Com filtro de necessidade, os que
 * precisam URGENTE dos itens vêm primeiro (`destaque: true`); com lat/lng,
 * ordena por proximidade (PostGIS) e aceita raio máximo.
 */
export async function listarAbrigosPublicos(filtros: FiltroMapa): Promise<AbrigoPublico[]> {
  return montarListaAbrigosPublicos(await consultarLinhasAbrigosPublicos(filtros), filtros);
}

/** Filtros de necessidade, perfil (pets/PCD), destaque e ordenação (em memória, sobre as linhas do banco). */
export function montarListaAbrigosPublicos(linhas: LinhaAbrigoPublico[], filtros: FiltroMapa): AbrigoPublico[] {
  const abrigos = linhas
    .map((linha) => apresentarResumo(linha, filtros))
    .filter(
      (abrigo) =>
        (!filtros.somenteDestaque || abrigo.destaque) &&
        (filtros.aceitaPets === undefined || abrigo.aceitaPets === filtros.aceitaPets) &&
        (filtros.acessivelPcd === undefined || abrigo.acessivelPcd === filtros.acessivelPcd),
    );

  return abrigos.sort(
    (a, b) =>
      Number(b.destaque ?? false) - Number(a.destaque ?? false) ||
      (a.distanciaKm ?? 0) - (b.distanciaKm ?? 0) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** RF07 - card do abrigo: lotação, contato, PIX oficial, rotas e alertas. */
export async function obterAbrigoPublico(id: number) {
  const abrigo = await buscarAbrigoPublico(id);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  return abrigo;
}

/** Card do abrigo ou `null` (abrigo inexistente ou desativado). */
export async function buscarAbrigoPublico(id: number) {
  const linha = await consultarUm<LinhaAbrigoPublico>(`${SQL_ABRIGOS_PUBLICOS} AND a.id = $3`, [null, null, id]);
  if (!linha) return null;

  const ocorrencias = await consultar<{
    id: number;
    tipo: TipoOcorrencia;
    gravidade: Gravidade;
    descricao: string | null;
    latitude: number | null;
    longitude: number | null;
    poligono: PontoPoligono[] | null;
    dataRegistro: Date;
  }>(
    `SELECT id, tipo, gravidade, descricao, latitude, longitude, fn_vertices_area_risco(area_risco) AS poligono,
            data_registro AS "dataRegistro"
       FROM ocorrencia_infraestrutura
      WHERE id_abrigo = $1 AND data_resolucao IS NULL AND status_validacao = 'APROVADA'
      ORDER BY gravidade DESC, data_registro`,
    [id],
  );

  const resumo = apresentarResumo(linha, { formato: "json" });
  return {
    id: resumo.id,
    nome: resumo.nome,
    endereco: resumo.endereco,
    telefone: resumo.telefone,
    latitude: resumo.latitude,
    longitude: resumo.longitude,
    ocupacao: resumo.ocupacao,
    statusInfraestrutura: resumo.statusInfraestrutura,
    aceitaPets: resumo.aceitaPets,
    acessivelPcd: resumo.acessivelPcd,
    necessidades: resumo.necessidades,
    emAreaDeRisco: resumo.emAreaDeRisco,
    atualizadoEm: resumo.atualizadoEm,
    // BR Code ("copia e cola") montado no servidor a partir da chave oficial e
    // da cidade do endereço; o QR é desenhado no navegador a partir dele.
    pix: linha.chavePix
      ? {
          chave: linha.chavePix,
          titular: linha.titularPix,
          brCode: gerarPayloadPixBrCode(linha.chavePix, linha.titularPix, extrairCidade(linha.endereco)),
        }
      : null,
    rotas: linksNavegacao(linha.latitude, linha.longitude),
    ocorrenciasAtivas: ocorrencias.map((o) => ({ ...o, descricaoTipo: DESCRICAO_TIPO_OCORRENCIA[o.tipo] })),
  };
}

/** RF08 - menu de filtros: categorias com itens ativos. */
export function listarCategoriasPublicas() {
  return consultar(
    `SELECT c.id, c.nome_macro AS nome, c.slug,
            json_agg(json_build_object('id', i.id, 'nome', i.nome_micro, 'unidadeMedida', i.unidade_medida)
                     ORDER BY i.nome_micro) AS itens
       FROM categoria_item c
       JOIN item i ON i.id_categoria = c.id AND i.ativo
      GROUP BY c.id
      ORDER BY c.nome_macro`,
  );
}

/** RF09 - alertas de risco ativos aprovados (local próprio da ocorrência, polígono de área de risco ou o do abrigo). */
export async function listarAlertasPublicos() {
  const alertas = await consultar<{
    id: number;
    tipo: TipoOcorrencia;
    gravidade: Gravidade;
    descricao: string | null;
    latitude: number;
    longitude: number;
    poligono: PontoPoligono[] | null;
    localizacaoPropria: boolean;
    dataRegistro: Date;
    idAbrigo: number;
    abrigo: string;
  }>(
    `SELECT o.id, o.tipo, o.gravidade, o.descricao,
            COALESCE(o.latitude, a.latitude) AS latitude, COALESCE(o.longitude, a.longitude) AS longitude,
            fn_vertices_area_risco(o.area_risco) AS poligono,
            (o.latitude IS NOT NULL OR o.area_risco IS NOT NULL) AS "localizacaoPropria",
            o.data_registro AS "dataRegistro",
            a.id AS "idAbrigo", a.nome AS abrigo
       FROM ocorrencia_infraestrutura o
       JOIN abrigo a ON a.id = o.id_abrigo AND a.ativo
      WHERE o.data_resolucao IS NULL AND o.status_validacao = 'APROVADA'
      ORDER BY o.gravidade DESC, o.data_registro DESC`,
  );
  return alertas.map(({ idAbrigo, abrigo, ...alerta }) => ({
    ...alerta,
    descricaoTipo: DESCRICAO_TIPO_OCORRENCIA[alerta.tipo],
    abrigo: { id: idAbrigo, nome: abrigo },
  }));
}

// -----------------------------------------------------------------------------
// Busca Pública de Familiares Acolhidos ("Encontre um Familiar" - LGPD-safe)
// -----------------------------------------------------------------------------

export const esquemaBuscaFamiliarPublico = z.object({
  busca: z.string().trim().min(3, "Digite ao menos 3 caracteres do nome ou CPF.").max(100),
});

function abreviarNomeFamiliar(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(" ");
  const preposicoes = new Set(["de", "da", "do", "das", "dos", "e"]);
  return partes
    .map((p, idx) => {
      if (idx === 0 || idx === partes.length - 1) return p;
      if (preposicoes.has(p.toLowerCase())) return p.toLowerCase();
      return `${p[0]!.toUpperCase()}.`;
    })
    .join(" ");
}

function mascararCpf(cpf: string | null): string | null {
  if (!cpf || cpf.length !== 11) return null;
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/**
 * Consulta pública de pessoas acolhidas com status PRESENTE em abrigos ativos.
 * Protege dados pessoais (LGPD): abrevia nomes do meio e mascara o CPF.
 */
export async function buscarFamiliaresAcolhidosPublico(
  filtros: z.infer<typeof esquemaBuscaFamiliarPublico>,
) {
  const termo = filtros.busca.trim();
  const somenteDigitos = termo.replace(/\D/g, "");
  const termoNome = escaparIlike(termo);

  const linhas = await consultar<{
    id: number;
    nomeCompleto: string;
    cpf: string | null;
    dataEntrada: Date;
    idAbrigo: number;
    abrigoNome: string;
    abrigoEndereco: string;
    abrigoTelefone: string | null;
  }>(
    `SELECT ab.id, ab.nome_completo AS "nomeCompleto", ab.cpf, ab.data_entrada AS "dataEntrada",
            a.id AS "idAbrigo", a.nome AS "abrigoNome", a.endereco AS "abrigoEndereco", a.telefone AS "abrigoTelefone"
       FROM abrigado ab
       JOIN abrigo a ON a.id = ab.id_abrigo_atual AND a.ativo
      WHERE ab.status_acolhimento = 'PRESENTE'
        AND (
          ab.nome_completo ILIKE '%' || $1 || '%'
          OR ($2::text IS NOT NULL AND ab.cpf = $2)
        )
      ORDER BY ab.data_entrada DESC, ab.nome_completo ASC
      LIMIT 15`,
    [termoNome, somenteDigitos.length === 11 ? somenteDigitos : null],
  );

  return linhas.map((l) => ({
    id: l.id,
    nomeExibicao: abreviarNomeFamiliar(l.nomeCompleto),
    cpfMascarado: mascararCpf(l.cpf),
    dataEntrada: l.dataEntrada,
    abrigo: {
      id: l.idAbrigo,
      nome: l.abrigoNome,
      endereco: l.abrigoEndereco,
      telefone: l.abrigoTelefone,
    },
  }));
}

// -----------------------------------------------------------------------------
// Reporte Cidadão de Incidentes com Fila de Moderação (Crowdsourcing)
// -----------------------------------------------------------------------------

const TIPOS_REPORTE_CIDADAO = ["VIA_BLOQUEADA", "ALAGAMENTO", "DESLIZAMENTO", "RISCO_ESTRUTURAL", "OUTRO"] as const;

export const esquemaReporteCidadao = z.object({
  idAbrigo: esquemaId.optional(),
  tipo: z.enum(TIPOS_REPORTE_CIDADAO),
  gravidade: z.enum(GRAVIDADES).optional(),
  descricao: textoObrigatorio(400),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  relatorNome: textoOpcional(100),
  relatorContato: textoOpcional(40),
});

/**
 * Permite que qualquer cidadão reporte um bloqueio de via, alagamento ou risco no mapa.
 * O reporte entra com `status_validacao = 'PENDENTE'` no abrigo indicado (ou no abrigo
 * ativo mais próximo via PostGIS) para aprovação em 1 clique pela coordenação.
 */
export async function registrarReporteCidadao(dados: z.infer<typeof esquemaReporteCidadao>) {
  const abrigoAlvo = dados.idAbrigo
    ? await consultarUm<{ id: number; nome: string }>(
        "SELECT id, nome FROM abrigo WHERE id = $1 AND ativo",
        [dados.idAbrigo],
      )
    : await consultarUm<{ id: number; nome: string }>(
        `SELECT id, nome
           FROM abrigo
          WHERE ativo
          ORDER BY localizacao <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          LIMIT 1`,
        [dados.latitude, dados.longitude],
      );

  if (!abrigoAlvo) {
    throw erros.naoEncontrado("Abrigo ativo na região");
  }

  const gravidade = dados.gravidade ?? GRAVIDADE_PADRAO[dados.tipo];

  const inserido = await consultarUm<{ id: number; dataRegistro: Date }>(
    `INSERT INTO ocorrencia_infraestrutura (
       id_abrigo, id_usuario_registro, tipo, gravidade, descricao,
       latitude, longitude, status_validacao, relator_nome, relator_contato
     )
     VALUES ($1, NULL, $2, $3, $4, $5, $6, 'PENDENTE', $7, $8)
     RETURNING id, data_registro AS "dataRegistro"`,
    [
      abrigoAlvo.id,
      dados.tipo,
      gravidade,
      dados.descricao,
      dados.latitude,
      dados.longitude,
      dados.relatorNome ?? null,
      dados.relatorContato ?? null,
    ],
  );

  return {
    id: inserido!.id,
    tipo: dados.tipo,
    gravidade,
    statusValidacao: "PENDENTE" as const,
    dataRegistro: inserido!.dataRegistro,
    abrigo: abrigoAlvo,
  };
}

/** Converte uma lista com latitude/longitude (e polígono opcional) em GeoJSON (consumido direto pelo Leaflet). */
export function paraGeoJson<T extends { latitude: number; longitude: number; poligono?: PontoPoligono[] | null }>(
  itens: T[],
) {
  return {
    type: "FeatureCollection" as const,
    features: itens.map(({ latitude, longitude, poligono, ...propriedades }) => {
      if (Array.isArray(poligono) && poligono.length >= 3) {
        const anelLinear = [...poligono, poligono[0]].map((p) => [p.lng, p.lat] as [number, number]);
        return {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [anelLinear] },
          properties: { ...propriedades, centroide: { latitude, longitude }, poligono },
        };
      }
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
        properties: propriedades,
      };
    }),
  };
}
