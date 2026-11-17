import { lerQuery, limitarPorIp, responder, rota } from "@/lib/http";
import { limitadorBuscaAcolhidos } from "@/lib/limitador";
import { buscarFamiliaresAcolhidosPublico, esquemaBuscaFamiliarPublico } from "@/modules/publico/publico.service";

/**
 * Busca pública de familiares acolhidos ("Encontre um Familiar" - protegida pela LGPD).
 *
 * Sem `CACHE_PUBLICO`: a resposta traz dados de pessoas e não pode ficar em CDN
 * nem em proxy (o `rota` aplica `private, no-store`). Uma cópia em cache também
 * responderia sem passar pelo limite de consultas abaixo.
 */
export const GET = rota(async (req) => {
  limitarPorIp(req, limitadorBuscaAcolhidos, "Muitas consultas em pouco tempo.");
  const filtros = lerQuery(req, esquemaBuscaFamiliarPublico);
  return responder(await buscarFamiliaresAcolhidosPublico(filtros));
});
