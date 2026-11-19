import { exigirContexto } from "@/lib/auth/sessao";
import { respostaCsv, sha256 } from "@/lib/csv";
import { lerQuery, responder, rota } from "@/lib/http";
import { auditarGeracaoFide, esquemaFiltroFide, gerarSubsidiosFide, montarCsvFide } from "@/modules/relatorios/fide.service";

/**
 * Subsídios para o FIDE do evento: `?idEvento=&idAbrigo=&formato=json|csv`.
 * Só números agregados (LGPD). O CSV leva o SHA-256 no cabeçalho
 * `X-Conteudo-SHA256`, também gravado na auditoria.
 */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  const { formato, ...filtros } = lerQuery(req, esquemaFiltroFide);
  const relatorio = await gerarSubsidiosFide(ctx, filtros);

  if (formato === "csv") {
    const csv = montarCsvFide(relatorio);
    auditarGeracaoFide(ctx, relatorio, "csv", csv);
    const escopo = relatorio.escopo.abrigo ? `abrigo-${relatorio.escopo.abrigo.id}` : "rede";
    return respostaCsv(csv, `subsidios-fide_evento-${relatorio.evento.id}_${escopo}.csv`, sha256(csv));
  }
  auditarGeracaoFide(ctx, relatorio, "json");
  return responder(relatorio, 200, { "Cache-Control": "private, no-store" });
});
