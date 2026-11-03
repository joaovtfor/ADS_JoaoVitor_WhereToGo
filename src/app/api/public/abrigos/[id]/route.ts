import { erros, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { buscarAbrigoPublicoEmCache } from "@/modules/publico/publico.cache";
import { CACHE_PUBLICO } from "@/modules/publico/publico.service";

/** RF07 - card do abrigo (lotação, PIX oficial, rotas Waze/Google Maps, necessidades, alertas). */
export const GET = rota<{ id: string }>(async (_req, contexto) => {
  const { id } = await lerParametros(contexto, parametrosId);
  const abrigo = await buscarAbrigoPublicoEmCache(id);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  return responder(abrigo, 200, CACHE_PUBLICO);
});
