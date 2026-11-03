import { cacheLife, cacheTag } from "next/cache";
import { TAG_DADOS_PUBLICOS } from "@/lib/cache";
import {
  buscarAbrigoPublico,
  consultarLinhasAbrigosPublicos,
  listarAbrigosPublicos,
  listarAlertasPublicos,
  listarCategoriasPublicas,
  montarListaAbrigosPublicos,
  type FiltroMapa,
} from "./publico.service";

// Cache do servidor (Next "use cache", em memória) para as rotas públicas.
// Sem CDN na frente, cada visitante do mapa fazia 3 consultas a cada 30 s:
// com 1.000 pessoas, ~100 req/s agregando todos os abrigos. Agora a consulta
// roda uma vez por alteração (toda escrita na API invalida a tag) ou, sem
// alterações, no máximo a cada 30 s (perfil `mapaPublico` no next.config.ts).
//
// Só em produção: no `next dev` o cache em camadas do Next devolve uma leitura
// antiga logo depois de cada escrita, o que confundiria quem está validando
// telas. Os services continuam sem cache (usados pelos testes).
const CACHE_ATIVO = process.env.NODE_ENV === "production";

async function linhasSemLocalizacaoEmCache() {
  "use cache";
  cacheTag(TAG_DADOS_PUBLICOS);
  cacheLife("mapaPublico");
  return consultarLinhasAbrigosPublicos({});
}

async function abrigoPublicoEmCache(id: number) {
  "use cache";
  cacheTag(TAG_DADOS_PUBLICOS);
  cacheLife("mapaPublico");
  return buscarAbrigoPublico(id);
}

async function alertasPublicosEmCache() {
  "use cache";
  cacheTag(TAG_DADOS_PUBLICOS);
  cacheLife("mapaPublico");
  return listarAlertasPublicos();
}

async function categoriasPublicasEmCache() {
  "use cache";
  cacheTag(TAG_DADOS_PUBLICOS);
  cacheLife("mapaPublico");
  return listarCategoriasPublicas();
}

/**
 * Sem lat/lng (carga inicial e polling da maioria dos visitantes) usa a lista
 * em cache e aplica filtros/ordenação em memória. Com lat/lng a distância e o
 * raio vêm do PostGIS, consulta direta: cada coordenada geraria uma entrada
 * de cache diferente.
 */
export async function listarAbrigosPublicosEmCache(filtros: FiltroMapa) {
  if (!CACHE_ATIVO || filtros.lat !== undefined) return listarAbrigosPublicos(filtros);
  return montarListaAbrigosPublicos(await linhasSemLocalizacaoEmCache(), filtros);
}

/** Card do abrigo; `null` quando não existe (o 404 é gerado fora do cache). */
export function buscarAbrigoPublicoEmCache(id: number) {
  return CACHE_ATIVO ? abrigoPublicoEmCache(id) : buscarAbrigoPublico(id);
}

export function listarAlertasPublicosEmCache() {
  return CACHE_ATIVO ? alertasPublicosEmCache() : listarAlertasPublicos();
}

export function listarCategoriasPublicasEmCache() {
  return CACHE_ATIVO ? categoriasPublicasEmCache() : listarCategoriasPublicas();
}
