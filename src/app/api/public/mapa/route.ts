import { etagConfere } from "@/lib/etag";
import { lerQuery, responder, rota } from "@/lib/http";
import { agendarSincronizacaoAvisos } from "@/modules/integracoes/avisos.agendamento";
import { obterMapaPublico } from "@/modules/publico/publico.mapa";
import { CACHE_PUBLICO, esquemaFiltroMapa } from "@/modules/publico/publico.service";

/**
 * Abrigos, alertas e avisos oficiais do mapa público em uma única resposta
 * (sem login - RNF02). É o que a página consulta a cada 30 s: com
 * `If-None-Match`, devolve 304 sem corpo quando nada mudou. Query: lat, lng,
 * raioKm (os mesmos de /abrigos). Também é o gatilho da consulta ao INMET,
 * feita depois da resposta quando a última tem mais de INTERVALO_AVISOS_MIN.
 */
export const GET = rota(async (req) => {
  const filtros = lerQuery(req, esquemaFiltroMapa);
  agendarSincronizacaoAvisos();
  const { dados, etag } = await obterMapaPublico(filtros);
  const headers = { ...CACHE_PUBLICO, ETag: etag };

  if (etagConfere(req.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return responder(dados, 200, headers);
});
