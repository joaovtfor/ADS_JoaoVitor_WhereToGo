import { beforeEach, describe, expect, it } from "vitest";
import { consultar, consultarUm } from "@/lib/db";
import {
  FALHAS_PARA_PAUSAR,
  listarAvisosVigentes,
  obterEstadoIntegracao,
  sincronizarAvisosInmet,
} from "@/modules/integracoes/avisos.service";
import { consultarLinhasAbrigosPublicos } from "@/modules/publico/publico.service";
import { criarAbrigo } from "./fixtures";

/** "AAAA-MM-DD HH:mm" em hora de Brasília, deslocado `minutos` de agora (formato do INMET). */
function horaInmet(minutos: number): string {
  const brasilia = new Date(Date.now() + minutos * 60_000 - 3 * 60 * 60_000);
  return brasilia.toISOString().slice(0, 16).replace("T", " ");
}

let proximoId = 1;

/** Aviso no formato do JSON do INMET; por padrão em vigor e incluindo Passo Fundo. */
function avisoInmet(campos: Record<string, unknown> = {}) {
  const idAviso = (campos.id_aviso as number | undefined) ?? 500;
  const sequencia = (campos.id_sequencia as number | undefined) ?? 1;
  return {
    id: 10_000 + proximoId++,
    id_aviso: idAviso,
    id_sequencia: sequencia,
    codigo: `urn:oid:2.49.0.0.76.0.2026.${idAviso}.${sequencia}`,
    descricao: "Tempestade",
    severidade: "Perigo",
    aviso_cor: "#FF8C00",
    inicio: horaInmet(-60),
    fim: horaInmet(180),
    geocodes: "4300034,4314100,4322400",
    riscos: ["Chuva entre 30 e 60 mm/h."],
    instrucoes: ["Evite áreas alagáveis."],
    encerrado: false,
    ...campos,
  };
}

const feed = (...hoje: unknown[]) => async () => ({ hoje, futuro: [] });
const falhar = (mensagem: string) => async () => {
  throw new Error(mensagem);
};

describe("Avisos oficiais do INMET (sincronização e leitura)", () => {
  beforeEach(async () => {
    await consultar("DELETE FROM aviso_oficial");
    await consultar(
      `UPDATE integracao_estado
          SET ultima_tentativa = NULL, ultimo_sucesso = NULL, falhas_consecutivas = 0, pausada_ate = NULL, ultimo_erro = NULL,
              em_andamento_ate = NULL`,
    );
  });

  it("grava os avisos do município e não repete a gravação quando nada mudou", async () => {
    const tempestade = avisoInmet({ id_aviso: 501 });
    const deOutroEstado = avisoInmet({ id_aviso: 502, geocodes: "5200050,3100104" });

    const primeira = await sincronizarAvisosInmet({ baixar: feed(tempestade, deOutroEstado) });
    expect(primeira).toEqual({ situacao: "ok", recebidos: 2, doMunicipio: 1, descartados: 0, alterados: 1 });

    const avisos = await listarAvisosVigentes();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ fonte: "INMET", evento: "Tempestade", severidade: "SEVERA", rotuloSeveridade: "Perigo" });
    expect(avisos[0]!.link).toBe(`https://avisos.inmet.gov.br/${tempestade.id}`);

    // Dentro do intervalo mínimo, nem consulta a fonte.
    expect(await sincronizarAvisosInmet({ baixar: falhar("não deveria consultar") })).toEqual({ situacao: "recente" });

    // Forçada, consulta; o mesmo conteúdo não conta como alteração (o cache público não é invalidado à toa).
    const repetida = await sincronizarAvisosInmet({ forcar: true, baixar: feed(tempestade, deOutroEstado) });
    expect(repetida).toMatchObject({ situacao: "ok", alterados: 0 });
  });

  it("atualiza por sequência nova e ignora uma sequência mais antiga", async () => {
    await sincronizarAvisosInmet({ baixar: feed(avisoInmet({ id_aviso: 510, id_sequencia: 1, severidade: "Perigo Potencial" })) });

    const agravado = await sincronizarAvisosInmet({
      forcar: true,
      baixar: feed(avisoInmet({ id_aviso: 510, id_sequencia: 2, severidade: "Grande Perigo" })),
    });
    expect(agravado).toMatchObject({ situacao: "ok", alterados: 1 });
    expect((await listarAvisosVigentes())[0]).toMatchObject({ severidade: "EXTREMA", rotuloSeveridade: "Grande Perigo" });

    const atrasado = await sincronizarAvisosInmet({
      forcar: true,
      baixar: feed(avisoInmet({ id_aviso: 510, id_sequencia: 1, severidade: "Perigo Potencial" })),
    });
    expect(atrasado).toMatchObject({ situacao: "ok", alterados: 0 });
    const linha = await consultarUm<{ sequencia: number }>("SELECT sequencia FROM aviso_oficial WHERE id_externo = '510'");
    expect(linha?.sequencia).toBe(2);
  });

  it("encerra o aviso que a fonte deixou de listar ou marcou como encerrado", async () => {
    const continua = avisoInmet({ id_aviso: 520 });
    const cancelado = avisoInmet({ id_aviso: 521 });
    await sincronizarAvisosInmet({ baixar: feed(continua, cancelado, avisoInmet({ id_aviso: 522 })) });
    expect(await listarAvisosVigentes()).toHaveLength(3);

    // 520 igual, 521 marcado como encerrado, 522 sumiu do retorno.
    const resultado = await sincronizarAvisosInmet({ forcar: true, baixar: feed(continua, { ...cancelado, encerrado: true }) });
    expect(resultado).toMatchObject({ situacao: "ok", alterados: 2 });

    const restantes = await listarAvisosVigentes();
    expect(restantes).toHaveLength(1);
    const encerrados = await consultar<{ idExterno: string }>(
      `SELECT id_externo AS "idExterno" FROM aviso_oficial WHERE encerrado_em IS NOT NULL ORDER BY id_externo`,
    );
    expect(encerrados.map((a) => a.idExterno)).toEqual(["521", "522"]);
  });

  it("lista vigentes antes dos previstos, os mais graves primeiro, e esconde os vencidos", async () => {
    await sincronizarAvisosInmet({
      baixar: feed(
        avisoInmet({ id_aviso: 530, severidade: "Perigo Potencial", descricao: "Chuvas Intensas" }),
        avisoInmet({ id_aviso: 531, severidade: "Grande Perigo", descricao: "Vendaval" }),
        avisoInmet({ id_aviso: 532, severidade: "Grande Perigo", descricao: "Granizo", inicio: horaInmet(600), fim: horaInmet(900) }),
        avisoInmet({ id_aviso: 533, descricao: "Já passou", inicio: horaInmet(-300), fim: horaInmet(-10) }),
      ),
    });
    expect((await listarAvisosVigentes()).map((a) => a.evento)).toEqual(["Vendaval", "Chuvas Intensas", "Granizo"]);
  });

  it("registra falhas e pausa a fonte depois de falhas seguidas (circuit breaker)", async () => {
    for (let tentativa = 1; tentativa <= FALHAS_PARA_PAUSAR; tentativa++) {
      const resultado = await sincronizarAvisosInmet({ forcar: true, baixar: falhar("fetch failed") });
      expect(resultado).toMatchObject({ situacao: "falha", erro: "fetch failed", falhasConsecutivas: tentativa });
    }

    const estado = await obterEstadoIntegracao();
    expect(estado).toMatchObject({ ativa: true, municipio: "4314100", falhasConsecutivas: FALHAS_PARA_PAUSAR, ultimoErro: "fetch failed" });
    expect(estado.pausadaAte!.getTime()).toBeGreaterThan(Date.now());

    // Pausada: a sincronização automática não consulta a fonte.
    await consultar("UPDATE integracao_estado SET ultima_tentativa = now() - interval '1 hour'");
    expect(await sincronizarAvisosInmet({ baixar: falhar("não deveria consultar") })).toEqual({ situacao: "pausada" });

    // "Consultar agora" ignora a pausa; o sucesso zera o breaker.
    expect(await sincronizarAvisosInmet({ forcar: true, baixar: feed(avisoInmet()) })).toMatchObject({ situacao: "ok" });
    expect(await obterEstadoIntegracao()).toMatchObject({ falhasConsecutivas: 0, pausadaAte: null, ultimoErro: null });
  });

  it("conta retorno fora do formato como falha, sem apagar os avisos já salvos", async () => {
    await sincronizarAvisosInmet({ baixar: feed(avisoInmet({ id_aviso: 540 })) });
    const resultado = await sincronizarAvisosInmet({ forcar: true, baixar: async () => "<html>Manutenção</html>" });
    expect(resultado).toMatchObject({ situacao: "falha", falhasConsecutivas: 1 });
    expect(await listarAvisosVigentes()).toHaveLength(1);
  });

  it("não deixa duas sincronizações rodarem ao mesmo tempo", async () => {
    let liberar!: () => void;
    const lenta = sincronizarAvisosInmet({
      forcar: true,
      baixar: () => new Promise((resolver) => (liberar = () => resolver({ hoje: [], futuro: [] }))),
    });
    // Espera a primeira reservar a sincronização e começar o download.
    await expect.poll(() => typeof liberar, { timeout: 5_000 }).toBe("function");

    expect(await sincronizarAvisosInmet({ forcar: true, baixar: feed() })).toEqual({ situacao: "em-andamento" });
    liberar();
    expect(await lenta).toMatchObject({ situacao: "ok" });
    // Ao terminar, a reserva é liberada: a próxima sincronização roda.
    expect(await sincronizarAvisosInmet({ forcar: true, baixar: feed() })).toMatchObject({ situacao: "ok" });
  });

  it("uma reserva vencida (instância que caiu no meio) não trava a fonte", async () => {
    await consultar("UPDATE integracao_estado SET em_andamento_ate = now() - interval '1 second'");

    expect(await sincronizarAvisosInmet({ baixar: feed(avisoInmet()) })).toMatchObject({ situacao: "ok", alterados: 1 });
    expect(await consultarUm("SELECT em_andamento_ate FROM integracao_estado")).toEqual({ em_andamento_ate: null });
  });

  it("aviso regional não marca abrigo como em área de risco nem muda o status de infraestrutura", async () => {
    const abrigo = await criarAbrigo({ latitude: -28.2626, longitude: -52.4067 });
    await sincronizarAvisosInmet({ baixar: feed(avisoInmet({ id_aviso: 550, severidade: "Grande Perigo" })) });

    const linha = (await consultarLinhasAbrigosPublicos({})).find((a) => a.id === abrigo.id)!;
    expect(linha.emAreaDeRisco).toBe(false);
    expect(linha.statusInfraestrutura).toBe("NORMAL");
  });
});
