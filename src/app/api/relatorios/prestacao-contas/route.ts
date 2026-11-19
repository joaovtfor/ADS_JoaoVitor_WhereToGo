import { exigirContexto } from "@/lib/auth/sessao";
import { respostaCsv } from "@/lib/csv";
import { lerQuery, rota } from "@/lib/http";
import { esquemaPrestacaoContas, gerarPrestacaoContas } from "@/modules/relatorios/prestacao-contas.service";

/**
 * Prestação de contas em CSV: `?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&idAbrigo=`.
 * O SHA-256 do arquivo vai no cabeçalho `X-Conteudo-SHA256` e fica gravado na
 * auditoria (`PRESTACAO_CONTAS_EXPORTADA`).
 */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  const { csv, sha256, nomeArquivo } = await gerarPrestacaoContas(ctx, lerQuery(req, esquemaPrestacaoContas));
  return respostaCsv(csv, nomeArquivo, sha256);
});
