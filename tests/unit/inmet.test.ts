import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ErroFormatoInmet, lerAvisosInmet, lerHoraDeBrasilia, normalizarSeveridade } from "@/modules/integracoes/inmet";

/**
 * Retorno real de https://apiprevmet3.inmet.gov.br/avisos/ativos (17/11/2026),
 * reduzido: listas de municípios e polígonos encurtadas, ícones removidos.
 * 6 avisos, 4 incluem Passo Fundo (4314100).
 */
const retornoReal = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "inmet-avisos-ativos.json"), "utf8")) as {
  hoje: Record<string, unknown>[];
  futuro: Record<string, unknown>[];
};
const PASSO_FUNDO = "4314100";

describe("INMET - leitura dos avisos", () => {
  it("lê o retorno real e fica só com os avisos do município", () => {
    const leitura = lerAvisosInmet(retornoReal, PASSO_FUNDO);
    expect(leitura.total).toBe(6);
    expect(leitura.descartados).toBe(0);
    expect(leitura.avisos.map((a) => a.idExterno).sort()).toEqual(["28719", "28720", "28721", "28722"]);

    const tempestade = leitura.avisos.find((a) => a.idExterno === "28720")!;
    expect(tempestade).toMatchObject({
      sequencia: 1,
      identificadorCap: "urn:oid:2.49.0.0.76.0.2026.28720.1",
      evento: "Tempestade",
      severidade: "MODERADA",
      rotuloSeveridade: "Perigo Potencial",
      cor: "#FFFE00",
      link: "https://avisos.inmet.gov.br/56434",
      encerrado: false,
    });
    expect(tempestade.riscos[0]).toMatch(/Chuva entre 20 e 30 mm\/h/);
    expect(tempestade.instrucoes.length).toBeGreaterThan(0);
  });

  it("interpreta início e fim como hora de Brasília (-03:00)", () => {
    const tempestade = lerAvisosInmet(retornoReal, PASSO_FUNDO).avisos.find((a) => a.idExterno === "28720")!;
    // "2026-11-17 09:00" em Brasília = 12:00 UTC; o CAP do mesmo aviso diz 09:00-03:00.
    expect(tempestade.inicio.toISOString()).toBe("2026-11-17T12:00:00.000Z");
    expect(tempestade.fim.toISOString()).toBe("2026-11-18T02:59:00.000Z");
    expect(lerHoraDeBrasilia("2026-11-19T00:00")?.toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(lerHoraDeBrasilia("19/11/2026 00:00")).toBeNull();
  });

  it("mapeia a severidade do INMET para a escala CAP, inclusive rótulo desconhecido", () => {
    expect(normalizarSeveridade("Perigo Potencial")).toBe("MODERADA");
    expect(normalizarSeveridade("Perigo")).toBe("SEVERA");
    expect(normalizarSeveridade("Grande Perigo")).toBe("EXTREMA");
    expect(normalizarSeveridade("  GRANDE   PERIGO ")).toBe("EXTREMA");
    expect(normalizarSeveridade("Observação")).toBe("MODERADA");
  });

  it("ignora avisos que não incluem o município (sem confundir prefixo de código)", () => {
    expect(lerAvisosInmet(retornoReal, "4300034").avisos).toHaveLength(4);
    expect(lerAvisosInmet(retornoReal, "431410").avisos).toHaveLength(0);
    expect(lerAvisosInmet(retornoReal, "5200050").avisos.map((a) => a.idExterno).sort()).toEqual(["28716", "28718"]);
  });

  it("fica com a sequência mais recente quando o mesmo aviso vem repetido", () => {
    const base = retornoReal.hoje[0]!;
    const atualizado = { ...base, id: 99999, id_sequencia: 2, codigo: "urn:oid:2.49.0.0.76.0.2026.28720.2", severidade: "Perigo" };
    const leitura = lerAvisosInmet({ hoje: [atualizado, base], futuro: [] }, PASSO_FUNDO);
    expect(leitura.avisos).toHaveLength(1);
    expect(leitura.avisos[0]).toMatchObject({ sequencia: 2, severidade: "SEVERA", link: "https://avisos.inmet.gov.br/99999" });
  });

  it("descarta só o item com formato inesperado ou período inválido", () => {
    const base = retornoReal.hoje[0]!;
    const leitura = lerAvisosInmet(
      {
        hoje: [base, { ...base, id_aviso: "x" }, { ...base, id_aviso: 1, fim: base.inicio }, { ...base, id_aviso: 2, inicio: "amanhã" }, null],
        futuro: [],
      },
      PASSO_FUNDO,
    );
    expect(leitura.avisos).toHaveLength(1);
    expect(leitura.descartados).toBe(4);
  });

  it("marca o aviso encerrado pela fonte e limpa cor e textos", () => {
    const base = retornoReal.hoje[0]!;
    const leitura = lerAvisosInmet(
      { hoje: [{ ...base, encerrado: true, aviso_cor: "amarelo", riscos: ["  chuva   forte ", "", "  "] }] },
      PASSO_FUNDO,
    );
    expect(leitura.avisos[0]).toMatchObject({ encerrado: true, cor: null, riscos: ["chuva forte"] });
  });

  it("recusa um retorno fora do formato { hoje, futuro }", () => {
    expect(() => lerAvisosInmet("<html>erro</html>", PASSO_FUNDO)).toThrow(ErroFormatoInmet);
    expect(() => lerAvisosInmet({ hoje: "nada" }, PASSO_FUNDO)).toThrow(ErroFormatoInmet);
    expect(lerAvisosInmet({}, PASSO_FUNDO)).toEqual({ avisos: [], total: 0, descartados: 0 });
  });
});
