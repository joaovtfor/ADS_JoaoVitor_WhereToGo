import { consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { booleanoQuery, z } from "@/lib/validacao";
import { linksNavegacao, resumirOcupacao } from "../abrigos/ocupacao";
import { DESCRICAO_TIPO_OCORRENCIA, type Gravidade, type StatusInfraestrutura, type TipoOcorrencia } from "../dominio";

// API pública (RNF02): sem login. Nunca expõe dados pessoais (abrigados,
// usuários) nem quantidades de estoque — apenas o necessário para o mapa.

/**
 * Cache curto em CDN (RNF01: menos tráfego em redes degradadas) sem atrasar
 * mudanças de status de forma perceptível (RF03 - reflexo imediato).
 */
export const CACHE_PUBLICO = { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" };

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

interface LinhaAbrigoPublico {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  latitude: number;
  longitude: number;
  capacidadeMaxima: number;
  lotacaoAtual: number;
  statusInfraestrutura: StatusInfraestrutura;
  atualizadoEm: Date;
  chavePix: string | null;
  titularPix: string | null;
  distanciaKm: number | null;
  urgentes: ItemNecessidade[];
  bloqueados: ItemNecessidade[];
  necessidadesAtualizadasEm: Date | null;
  ocorrencias: { tipo: TipoOcorrencia; gravidade: Gravidade }[];
}

const SQL_ABRIGOS_PUBLICOS = `
  SELECT a.id, a.nome, a.endereco, a.telefone, a.latitude, a.longitude,
         a.capacidade_maxima AS "capacidadeMaxima", a.lotacao_atual AS "lotacaoAtual",
         a.status_infraestrutura AS "statusInfraestrutura", a.atualizado_em AS "atualizadoEm",
         a.chave_pix AS "chavePix", a.titular_pix AS "titularPix",
         CASE WHEN $1::float8 IS NULL THEN NULL
              ELSE round((ST_Distance(a.localizacao, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000)::numeric, 2)
         END AS "distanciaKm",
         COALESCE(n.urgentes, '[]') AS urgentes,
         COALESCE(n.bloqueados, '[]') AS bloqueados,
         n.atualizado_em AS "necessidadesAtualizadasEm",
         COALESCE(o.ocorrencias, '[]') AS ocorrencias
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
       WHERE oc.id_abrigo = a.id AND oc.data_resolucao IS NULL
    ) o ON TRUE
   WHERE a.ativo`;

function apresentarResumo(linha: LinhaAbrigoPublico, filtros: FiltroMapa) {
  const temFiltro = Boolean(filtros.necessidade?.length || filtros.item?.length);
  const atendeFiltro = (item: ItemNecessidade) =>
    Boolean(filtros.necessidade?.includes(item.categoria) || filtros.item?.includes(item.id));

  return {
    id: linha.id,
    nome: linha.nome,
    endereco: linha.endereco,
    telefone: linha.telefone,
    latitude: linha.latitude,
    longitude: linha.longitude,
    ocupacao: resumirOcupacao(linha.lotacaoAtual, linha.capacidadeMaxima),
    statusInfraestrutura: linha.statusInfraestrutura,
    ocorrenciasAtivas: linha.ocorrencias,
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

/**
 * RF06 / RF08 - abrigos ativos para o mapa. Com filtro de necessidade, os que
 * precisam URGENTE dos itens vêm primeiro (`destaque: true`); com lat/lng,
 * ordena por proximidade (PostGIS) e aceita raio máximo.
 */
export async function listarAbrigosPublicos(filtros: FiltroMapa): Promise<AbrigoPublico[]> {
  const linhas = await consultar<LinhaAbrigoPublico>(
    `${SQL_ABRIGOS_PUBLICOS}
       AND ($3::float8 IS NULL
            OR ST_DWithin(a.localizacao, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1000))`,
    [filtros.lat ?? null, filtros.lng ?? null, filtros.raioKm ?? null],
  );

  const abrigos = linhas
    .map((linha) => apresentarResumo(linha, filtros))
    .filter((abrigo) => !filtros.somenteDestaque || abrigo.destaque);

  return abrigos.sort(
    (a, b) =>
      Number(b.destaque ?? false) - Number(a.destaque ?? false) ||
      (a.distanciaKm ?? 0) - (b.distanciaKm ?? 0) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** RF07 - card do abrigo: lotação, contato, PIX oficial, rotas e alertas. */
export async function obterAbrigoPublico(id: number) {
  const linha = await consultarUm<LinhaAbrigoPublico>(`${SQL_ABRIGOS_PUBLICOS} AND a.id = $3`, [null, null, id]);
  if (!linha) throw erros.naoEncontrado("Abrigo");

  const ocorrencias = await consultar<{
    id: number;
    tipo: TipoOcorrencia;
    gravidade: Gravidade;
    descricao: string | null;
    latitude: number | null;
    longitude: number | null;
    dataRegistro: Date;
  }>(
    `SELECT id, tipo, gravidade, descricao, latitude, longitude, data_registro AS "dataRegistro"
       FROM ocorrencia_infraestrutura
      WHERE id_abrigo = $1 AND data_resolucao IS NULL
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
    necessidades: resumo.necessidades,
    atualizadoEm: resumo.atualizadoEm,
    pix: linha.chavePix ? { chave: linha.chavePix, titular: linha.titularPix } : null,
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

/** RF09 - alertas de risco ativos (local próprio da ocorrência ou o do abrigo). */
export async function listarAlertasPublicos() {
  const alertas = await consultar<{
    id: number;
    tipo: TipoOcorrencia;
    gravidade: Gravidade;
    descricao: string | null;
    latitude: number;
    longitude: number;
    localizacaoPropria: boolean;
    dataRegistro: Date;
    idAbrigo: number;
    abrigo: string;
  }>(
    `SELECT o.id, o.tipo, o.gravidade, o.descricao,
            COALESCE(o.latitude, a.latitude) AS latitude, COALESCE(o.longitude, a.longitude) AS longitude,
            o.latitude IS NOT NULL AS "localizacaoPropria", o.data_registro AS "dataRegistro",
            a.id AS "idAbrigo", a.nome AS abrigo
       FROM ocorrencia_infraestrutura o
       JOIN abrigo a ON a.id = o.id_abrigo AND a.ativo
      WHERE o.data_resolucao IS NULL
      ORDER BY o.gravidade DESC, o.data_registro DESC`,
  );
  return alertas.map(({ idAbrigo, abrigo, ...alerta }) => ({
    ...alerta,
    descricaoTipo: DESCRICAO_TIPO_OCORRENCIA[alerta.tipo],
    abrigo: { id: idAbrigo, nome: abrigo },
  }));
}

/** Converte uma lista com latitude/longitude em GeoJSON (consumido direto pelo Leaflet). */
export function paraGeoJson<T extends { latitude: number; longitude: number }>(itens: T[]) {
  return {
    type: "FeatureCollection" as const,
    features: itens.map(({ latitude, longitude, ...propriedades }) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
      properties: propriedades,
    })),
  };
}
