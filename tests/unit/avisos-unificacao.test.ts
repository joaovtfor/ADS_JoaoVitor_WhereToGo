import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { unificarAvisos, type AvisoUnificavel } from "@/modules/integracoes/avisos.unificacao";
import { lerAvisosInmet } from "@/modules/integracoes/inmet";

const DIA = "2026-11-24";

let proximoId = 1;

/** Aviso de Tempestade em 24/11 das 00:00 às 23:59 (Brasília), salvo o que for passado. */
function aviso(campos: Partial<AvisoUnificavel> = {}): AvisoUnificavel {
  return {
    id: proximoId++,
    fonte: "INMET",
    evento: "Tempestade",
    severidade: "MODERADA",
    inicio: `${DIA}T00:00:00-03:00`,
    fim: `${DIA}T23:59:00-03:00`,
    ...campos,
  };
}

const ids = (avisos: AvisoUnificavel[]) => avisos.map((a) => a.id);

describe("Unificação dos avisos oficiais", () => {
  it("mostra só o Grande Perigo quando os três níveis valem no mesmo período (caso de 24/11/2026)", () => {
    const grandePerigo = aviso({ severidade: "EXTREMA" });
    const perigo = aviso({ severidade: "SEVERA" });
    const potencial = aviso({ severidade: "MODERADA" });

    expect(unificarAvisos([grandePerigo, perigo, potencial])).toEqual([grandePerigo]);
    // A ordem de chegada não muda o resultado.
    expect(unificarAvisos([potencial, perigo, grandePerigo])).toEqual([grandePerigo]);
  });

  it("esconde o nível menor que fica todo dentro do período do mais grave", () => {
    const perigoODiaTodo = aviso({ severidade: "SEVERA" });
    const potencialATarde = aviso({ inicio: `${DIA}T12:00:00-03:00`, fim: `${DIA}T18:00:00-03:00` });
    expect(unificarAvisos([perigoODiaTodo, potencialATarde])).toEqual([perigoODiaTodo]);
  });

  it("mantém os dois quando o nível menor vale além do mais grave", () => {
    const grandePerigoAte18 = aviso({ severidade: "EXTREMA", fim: `${DIA}T18:00:00-03:00` });
    const potencialAteAmanha = aviso({ fim: "2026-11-25T12:00:00-03:00" });
    const potencialAntes = aviso({ inicio: "2026-11-23T20:00:00-03:00", fim: `${DIA}T10:00:00-03:00` });

    expect(ids(unificarAvisos([grandePerigoAte18, potencialAteAmanha, potencialAntes]))).toEqual(
      ids([grandePerigoAte18, potencialAteAmanha, potencialAntes]),
    );
  });

  it("não esconde o mais grave atrás de um nível menor com período maior", () => {
    const grandePerigoATarde = aviso({ severidade: "EXTREMA", inicio: `${DIA}T12:00:00-03:00`, fim: `${DIA}T18:00:00-03:00` });
    const potencialODiaTodo = aviso();
    expect(ids(unificarAvisos([grandePerigoATarde, potencialODiaTodo]))).toEqual(ids([grandePerigoATarde, potencialODiaTodo]));
  });

  it("mantém eventos diferentes separados, mesmo com o mesmo período", () => {
    const tempestade = aviso({ severidade: "EXTREMA" });
    const umidade = aviso({ evento: "Baixa Umidade", severidade: "MODERADA" });
    const deOutraFonte = aviso({ fonte: "DEFESA_CIVIL", severidade: "MODERADA" });
    expect(ids(unificarAvisos([tempestade, umidade, deOutraFonte]))).toEqual(ids([tempestade, umidade, deOutraFonte]));
  });

  it("trata o mesmo evento escrito de outro jeito como o mesmo evento", () => {
    const perigo = aviso({ evento: "Chuvas Intensas", severidade: "SEVERA" });
    const potencial = aviso({ evento: "  chuvas   intensas ", severidade: "MODERADA" });
    expect(unificarAvisos([perigo, potencial])).toEqual([perigo]);
  });

  it("no mesmo nível, fica o período mais longo; com período igual, o aviso mais recente", () => {
    const diaTodo = aviso({ severidade: "SEVERA" });
    const soATarde = aviso({ severidade: "SEVERA", inicio: `${DIA}T12:00:00-03:00` });
    expect(unificarAvisos([soATarde, diaTodo])).toEqual([diaTodo]);

    const antigo = aviso({ id: 10, severidade: "SEVERA" });
    const recente = aviso({ id: 11, severidade: "SEVERA" });
    expect(unificarAvisos([antigo, recente])).toEqual([recente]);
    expect(unificarAvisos([recente, antigo])).toEqual([recente]);
  });

  it("dias seguidos do mesmo nível continuam separados", () => {
    const hoje = aviso();
    const amanha = aviso({ inicio: "2026-11-25T00:00:00-03:00", fim: "2026-11-25T23:59:00-03:00" });
    expect(ids(unificarAvisos([hoje, amanha]))).toEqual(ids([hoje, amanha]));
  });

  it("aceita datas como Date (servidor) ou texto ISO (JSON salvo no navegador)", () => {
    const perigo = aviso({ severidade: "SEVERA", inicio: new Date(`${DIA}T00:00:00-03:00`), fim: new Date(`${DIA}T23:59:00-03:00`) });
    const potencial = aviso();
    expect(unificarAvisos([perigo, potencial])).toEqual([perigo]);
    expect(unificarAvisos([])).toEqual([]);
  });

  it("no retorno real do INMET (17/11/2026), o Perigo Potencial de 18/11 fica dentro do Perigo do mesmo dia", () => {
    const retorno = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "inmet-avisos-ativos.json"), "utf8")) as unknown;
    const avisos = lerAvisosInmet(retorno, "4314100").avisos.map((lido) => ({
      id: Number(lido.idExterno),
      fonte: "INMET",
      evento: lido.evento,
      severidade: lido.severidade,
      inicio: lido.inicio,
      fim: lido.fim,
    }));
    // 28719 = Perigo 18/11 00:00-23:59; 28721 = Perigo Potencial no mesmo período.
    expect(avisos.map((a) => a.id).sort()).toEqual([28719, 28720, 28721, 28722]);
    expect(unificarAvisos(avisos).map((a) => a.id).sort()).toEqual([28719, 28720, 28722]);
  });
});
