import { calcularEtag } from "@/lib/etag";
import {
  listarAbrigosPublicosEmCache,
  listarAlertasPublicosEmCache,
  listarAvisosVigentesEmCache,
  listarCategoriasPublicasEmCache,
} from "./publico.cache";
import { esquemaFiltroMapa, type FiltroMapa } from "./publico.service";

/**
 * Tudo o que o mapa público redesenha a cada atualização, em uma resposta só:
 * abrigos, alertas (ocorrências aprovadas) e avisos oficiais do INMET. O ETag
 * permite responder 304 (sem corpo) quando nada mudou.
 */
export async function obterMapaPublico(filtros: FiltroMapa) {
  const [abrigos, alertas, avisos] = await Promise.all([
    listarAbrigosPublicosEmCache(filtros),
    listarAlertasPublicosEmCache(),
    listarAvisosVigentesEmCache(),
  ]);
  const dados = { abrigos, alertas, avisos };
  return { dados, etag: calcularEtag(dados) };
}

/**
 * Estado que a página "/" envia já no HTML: o mapa sem localização (o caso de
 * quem acabou de abrir o site) e as categorias de doação. O `etag` segue junto
 * para a primeira atualização do navegador já poder receber 304.
 */
export async function obterEstadoInicialMapa() {
  const [mapa, categorias] = await Promise.all([obterMapaPublico(esquemaFiltroMapa.parse({})), listarCategoriasPublicasEmCache()]);
  return { ...mapa.dados, categorias, etag: mapa.etag, geradoEm: new Date().toISOString() };
}

export type EstadoInicialMapa = Awaited<ReturnType<typeof obterEstadoInicialMapa>>;
