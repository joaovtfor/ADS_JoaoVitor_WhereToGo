import { responder, rota } from "@/lib/http";
import { agendarSincronizacaoAvisos } from "@/modules/integracoes/avisos.agendamento";
import { listarAvisosVigentesEmCache } from "@/modules/publico/publico.cache";
import { CACHE_PUBLICO } from "@/modules/publico/publico.service";

/**
 * Avisos meteorológicos oficiais (INMET) vigentes ou previstos para o município
 * (sem login - RNF02). Fonte: Instituto Nacional de Meteorologia; cada aviso
 * traz o link para o original.
 */
export const GET = rota(async () => {
  agendarSincronizacaoAvisos();
  return responder(await listarAvisosVigentesEmCache(), 200, CACHE_PUBLICO);
});
