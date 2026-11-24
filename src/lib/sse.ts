/**
 * Server-Sent Events (SSE): o servidor mantém a resposta aberta e escreve uma
 * mensagem a cada mudança; o navegador as recebe pelo `EventSource`, que
 * reconecta sozinho se a conexão cair.
 */

/** Cabeçalhos de uma resposta SSE. */
export const CABECALHOS_SSE = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-store: nenhuma CDN ou proxy guarda o fluxo. no-transform: impede a
  // compressão (gzip do `next start`, proxies), que seguraria os eventos num buffer.
  "Cache-Control": "no-cache, no-store, no-transform",
  // Nginx e proxies parecidos: entrega cada evento na hora, sem buffer.
  "X-Accel-Buffering": "no",
} as const;

/** Quebras de linha encerrariam o campo antes da hora: o `id` não pode tê-las. */
const QUEBRA_DE_LINHA = /[\r\n\0]/;

/**
 * Uma mensagem SSE. `dados` vai como JSON numa linha só (o `JSON.stringify`
 * escapa as quebras de linha dos textos). `id` é o que o navegador devolve no
 * cabeçalho `Last-Event-ID` ao reconectar.
 */
export function formatarEventoSse({ evento, id, dados }: { evento: string; id?: string; dados: unknown }): string {
  if (QUEBRA_DE_LINHA.test(evento) || (id !== undefined && QUEBRA_DE_LINHA.test(id))) {
    throw new Error("Evento SSE com quebra de linha no nome ou no id.");
  }
  const linhas = [`event: ${evento}`];
  if (id !== undefined) linhas.push(`id: ${id}`);
  linhas.push(`data: ${JSON.stringify(dados)}`);
  return `${linhas.join("\n")}\n\n`;
}

/** Tempo que o navegador espera antes de reconectar, em ms. */
export function formatarRetrySse(ms: number): string {
  return `retry: ${Math.max(0, Math.round(ms))}\n\n`;
}

/** Comentário: mantém a conexão ativa em proxies que fecham conexões ociosas. O navegador o ignora. */
export const PING_SSE = ": ping\n\n";
