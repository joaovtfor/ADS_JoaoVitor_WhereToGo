import { lerQuery, responder, rota } from "@/lib/http";
import {
  buscarFamiliaresAcolhidosPublico,
  CACHE_PUBLICO,
  esquemaBuscaFamiliarPublico,
} from "@/modules/publico/publico.service";

/** Busca pública de familiares acolhidos ("Encontre um Familiar" - protegida pela LGPD). */
export const GET = rota(async (req) => {
  const filtros = lerQuery(req, esquemaBuscaFamiliarPublico);
  return responder(await buscarFamiliaresAcolhidosPublico(filtros), 200, CACHE_PUBLICO);
});
