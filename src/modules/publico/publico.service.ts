import { consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { extrairCidade, gerarPayloadPixBrCode } from "@/lib/pix";
import { booleanoQuery, z } from "@/lib/validacao";
import { linksNavegacao, resumirOcupacao } from "../abrigos/ocupacao";
import { DESCRICAO_TIPO_OCORRENCIA, type Gravidade, type StatusInfraestrutura, type TipoOcorrencia } from "../dominio";
import type { PontoPoligono } from "../ocorrencias/ocorrencias.service";

// API pública (RNF02): sem login. Nunca expõe dados pessoais (abrigados,
// usuários) nem quantidades de estoque — apenas o necessário para o mapa.

/**
 * Cache HTTP para uma eventual CDN/proxy. O cache que vale no deploy atual
 * (Docker + Apache, sem CDN) é o do servidor: ver `publico.cache.ts`.
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
  atualizadoEm: Date;
  chavePix: string | null;
  titularPix: string | null;
  distanciaKm: number | null;
  urgentes: ItemNecessidade[];
  bloqueados: ItemNecessidade[];
  necessidadesAtualizadasEm: Date | null;
  ocorrencias: { tipo: TipoOcorrencia; gravidade: Gravidade }[];
  emAreaDeRisco: boolean;
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
         COALESCE(o.ocorrencias, '[]') AS ocorrencias,
         -- Abrigo dentro de alguma área de risco ativa (de qualquer abrigo), via índice GiST.
         EXISTS (
           SELECT 1 FROM ocorrencia_infraestrutura r
            WHERE r.area_risco IS NOT NULL AND r.data_resolucao IS NULL
              AND ST_Covers(r.area_risco, a.localizacao)
         ) AS "emAreaDeRisco"
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
    ocorrenciasAtivas: linha.ocorrencias,
    emAreaDeRisco: linha.emAreaDeRisco,
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

/** Filtros de necessidade, destaque e ordenação (em memória, sobre as linhas do banco). */
export function montarListaAbrigosPublicos(linhas: LinhaAbrigoPublico[], filtros: FiltroMapa): AbrigoPublico[] {
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

/** RF09 - alertas de risco ativos (local próprio da ocorrência, polígono de área de risco ou o do abrigo). */
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
      WHERE o.data_resolucao IS NULL
      ORDER BY o.gravidade DESC, o.data_registro DESC`,
  );
  return alertas.map(({ idAbrigo, abrigo, ...alerta }) => ({
    ...alerta,
    descricaoTipo: DESCRICAO_TIPO_OCORRENCIA[alerta.tipo],
    abrigo: { id: idAbrigo, nome: abrigo },
  }));
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
