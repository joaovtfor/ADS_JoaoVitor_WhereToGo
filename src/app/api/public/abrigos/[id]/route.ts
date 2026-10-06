import { lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { CACHE_PUBLICO, obterAbrigoPublico } from "@/modules/publico/publico.service";

/** RF07 - card do abrigo (lotação, PIX oficial, rotas Waze/Google Maps, necessidades, alertas). */
export const GET = rota<{ id: string }>(async (_req, contexto) => {
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await obterAbrigoPublico(id), 200, CACHE_PUBLICO);
});
