import { lerQuery, responder, rota } from "@/lib/http";
import { CACHE_PUBLICO, esquemaFiltroMapa, listarAbrigosPublicos, paraGeoJson } from "@/modules/publico/publico.service";

/**
 * RF06 / RF08 - abrigos ativos para o mapa público (sem login - RNF02).
 * Query: lat, lng, raioKm, necessidade (slugs), item (ids), somenteDestaque, formato=json|geojson
 */
export const GET = rota(async (req) => {
  const filtros = lerQuery(req, esquemaFiltroMapa);
  const abrigos = await listarAbrigosPublicos(filtros);

  if (filtros.formato === "geojson") {
    return Response.json(paraGeoJson(abrigos), {
      headers: { ...CACHE_PUBLICO, "Content-Type": "application/geo+json" },
    });
  }
  return responder(abrigos, 200, CACHE_PUBLICO);
});
