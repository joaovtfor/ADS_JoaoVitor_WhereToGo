import { describe, expect, it } from "vitest";
import { celulaCsv, montarCsv, sha256 } from "@/lib/csv";

describe("CSV dos relatórios (Etapa 4)", () => {
  it("escapa aspas, separador e quebras de linha", () => {
    expect(celulaCsv('Disse "oi"; tchau')).toBe('"Disse ""oi""; tchau"');
    expect(celulaCsv("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(celulaCsv("simples")).toBe("simples");
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(-5)).toBe("-5");
  });

  it("neutraliza fórmulas em texto digitado (CSV injection), sem mexer em números", () => {
    expect(celulaCsv("=HIPERLINK(\"http://x\")")).toBe("\"'=HIPERLINK(\"\"http://x\"\")\"");
    expect(celulaCsv("+55 54 9999")).toBe("'+55 54 9999");
    expect(celulaCsv("-desconto")).toBe("'-desconto");
    expect(celulaCsv("@SOMA(A1)")).toBe("'@SOMA(A1)");
    expect(celulaCsv(-20)).toBe("-20");
  });

  it("monta o arquivo com BOM, separador ';' e CRLF, e o hash bate com o conteúdo", () => {
    const csv = montarCsv([["a", 1], ["b", null]]);
    expect(csv).toBe("﻿a;1\r\nb;\r\n");
    expect(sha256(csv)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(csv)).toBe(sha256(montarCsv([["a", 1], ["b", null]])));
    expect(sha256(csv)).not.toBe(sha256(montarCsv([["a", 2], ["b", null]])));
  });
});
