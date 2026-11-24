import { calcularEtag } from "@/lib/etag";
import type { AvisoOficial } from "../integracoes/avisos.service";
import {
  listarAbrigosPublicosEmCache,
  listarAlertasPublicosEmCache,
  listarAvisosVigentesEmCache,
  listarCategoriasPublicasEmCache,
} from "./publico.cache";
import { esquemaFiltroMapa, type AbrigoPublico, type AlertaPublico, type FiltroMapa } from "./publico.service";

/**
 * Resposta do mapa (abrigos, alertas e avisos) com o ETag do conteúdo. A mesma
 * função monta a resposta de `/api/public/mapa` e os eventos do tempo real:
 * os mesmos dados geram a mesma versão nos dois caminhos, e o navegador pode
 * trocar de um para o outro sem baixar o mapa de novo.
 */
export function montarRespostaMapa(abrigos: AbrigoPublico[], alertas: AlertaPublico[], avisos: AvisoOficial[]) {
  const dados = { abrigos, alertas, avisos };
  return { dados, etag: calcularEtag(dados) };
}

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
  return montarRespostaMapa(abrigos, alertas, avisos);
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
