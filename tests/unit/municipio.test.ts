import { describe, expect, it } from "vitest";
import { resolverNomeMunicipio } from "@/lib/env";

describe("Nome do município dos avisos", () => {
  it("usa Passo Fundo quando o código é o padrão e não há nome configurado", () => {
    expect(resolverNomeMunicipio("4314100", undefined)).toBe("Passo Fundo");
  });

  it("usa o nome configurado (MUNICIPIO_NOME), qualquer que seja o código", () => {
    expect(resolverNomeMunicipio("4311809", "Marau")).toBe("Marau");
    expect(resolverNomeMunicipio("4314100", "Passo Fundo/RS")).toBe("Passo Fundo/RS");
  });

  it("fica sem nome quando o código foi trocado e o nome não: melhor sem cidade do que a cidade errada", () => {
    expect(resolverNomeMunicipio("4311809", undefined)).toBeNull();
  });
});
