import { createHash } from "node:crypto";

// CSV para planilhas em português: separador ";" (o Excel pt-BR usa a vírgula
// como decimal) e BOM UTF-8 para os acentos abrirem certo.

export type CelulaCsv = string | number | null | undefined;

const SEPARADOR = ";";
const BOM = "﻿";

/**
 * Uma célula: números como estão; texto entre aspas quando precisa. Texto que
 * começa com = + - @ (ou tabulação/retorno) ganha um apóstrofo na frente: sem
 * isso, uma observação digitada como "=HIPERLINK(...)" viraria fórmula ao abrir
 * a planilha (CSV injection).
 */
export function celulaCsv(valor: CelulaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  let texto = valor;
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Monta o arquivo inteiro (com BOM e quebras CRLF, o padrão das planilhas). */
export function montarCsv(linhas: CelulaCsv[][]): string {
  return BOM + linhas.map((linha) => linha.map(celulaCsv).join(SEPARADOR)).join("\r\n") + "\r\n";
}

/** SHA-256 (hex) do conteúdo exatamente como é entregue. */
export function sha256(conteudo: string): string {
  return createHash("sha256").update(conteudo, "utf8").digest("hex");
}

/** Resposta de download com o hash no cabeçalho (o painel mostra para conferência). */
export function respostaCsv(conteudo: string, nomeArquivo: string, hash = sha256(conteudo)): Response {
  return new Response(conteudo, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo.replace(/[^\w.-]/g, "_")}"`,
      "X-Conteudo-SHA256": hash,
      "Cache-Control": "private, no-store",
    },
  });
}
