import { lerCorpo, limitarPorIp, responder, rota } from "@/lib/http";
import { limitadorReportePublico } from "@/lib/limitador";
import { esquemaReporteCidadao, registrarReporteCidadao } from "@/modules/publico/publico.service";

/** Reporte cidadão de incidente (via bloqueada, alagamento, deslizamento...) enviado para fila de moderação. */
export const POST = rota(async (req) => {
  // Antes de ler o corpo: quem passou do limite não consome leitura nem banco.
  limitarPorIp(req, limitadorReportePublico, "Muitos reportes enviados em pouco tempo.");
  const dados = await lerCorpo(req, esquemaReporteCidadao);
  return responder(await registrarReporteCidadao(dados), 201);
});
