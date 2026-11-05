import { lerCorpo, responder, rota } from "@/lib/http";
import { esquemaReporteCidadao, registrarReporteCidadao } from "@/modules/publico/publico.service";

/** Reporte cidadão de incidente (via bloqueada, alagamento, deslizamento...) enviado para fila de moderação. */
export const POST = rota(async (req) => {
  const dados = await lerCorpo(req, esquemaReporteCidadao);
  return responder(await registrarReporteCidadao(dados), 201);
});
