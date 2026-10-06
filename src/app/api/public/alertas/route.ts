import { lerQuery, responder, rota } from "@/lib/http";
import { z } from "@/lib/validacao";
import { CACHE_PUBLICO, listarAlertasPublicos, paraGeoJson } from "@/modules/publico/publico.service";

const esquemaFormato = z.object({ formato: z.enum(["json", "geojson"]).default("json") });

/** RF09 - alertas de risco ativos (vias bloqueadas, falta de energia...) para o mapa público. */
export const GET = rota(async (req) => {
  const { formato } = lerQuery(req, esquemaFormato);
  const alertas = await listarAlertasPublicos();

  if (formato === "geojson") {
    return Response.json(paraGeoJson(alertas), {
      headers: { ...CACHE_PUBLICO, "Content-Type": "application/geo+json" },
    });
  }
  return responder(alertas, 200, CACHE_PUBLICO);
});
