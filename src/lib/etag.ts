import { createHash } from "node:crypto";

/**
 * ETag fraco calculado a partir do conteúdo: o mesmo JSON gera sempre o mesmo
 * valor, em qualquer instância do servidor e depois de um reinício.
 */
export function calcularEtag(dados: unknown): string {
  return `W/"${createHash("sha1").update(JSON.stringify(dados)).digest("base64url")}"`;
}

/**
 * O cliente já tem esta versão? Compara com o cabeçalho `If-None-Match`, que
 * pode trazer vários valores, o prefixo `W/` ou `*`.
 */
export function etagConfere(seNaoCorresponder: string | null, etag: string): boolean {
  if (!seNaoCorresponder) return false;
  const semPrefixo = (valor: string) => valor.trim().replace(/^W\//, "");
  const alvo = semPrefixo(etag);
  return seNaoCorresponder.split(",").some((valor) => valor.trim() === "*" || semPrefixo(valor) === alvo);
}
