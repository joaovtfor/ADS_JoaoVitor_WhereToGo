import { afterEach, describe, expect, it } from "vitest";
import { consultar } from "@/lib/db";
import { validar } from "@/lib/http";
import { esquemaFiltroMapa } from "@/modules/publico/publico.service";
import { obterMapaPublico } from "@/modules/publico/publico.mapa";
import {
  abrirFluxoMapa,
  conexoesAbertasNoMapa,
  INTERVALO_VERIFICACAO_MS,
  lerIdUltimoEvento,
} from "@/modules/publico/publico.tempo-real";
import { capturarErro, criarAbrigo } from "./fixtures";

interface EventoLido {
  evento: string;
  id: string | null;
  dados: Record<string, unknown>;
}

/** Lê o fluxo SSE como o navegador: blocos separados por linha em branco. */
function leitorDeEventos(fluxo: ReadableStream<Uint8Array>) {
  const leitor = fluxo.getReader();
  const decodificador = new TextDecoder();
  let pendente = "";
  const fila: EventoLido[] = [];
  // Uma leitura que perdeu a corrida para o prazo continua valendo: a próxima
  // chamada a reaproveita, senão o pedaço que ela receber seria perdido.
  let leituraEmCurso: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  async function proximo(limiteMs: number): Promise<EventoLido | null> {
    const prazo = Date.now() + limiteMs;
    while (fila.length === 0) {
      const restante = prazo - Date.now();
      if (restante <= 0) return null;
      leituraEmCurso ??= leitor.read();
      const leitura = await Promise.race([
        leituraEmCurso,
        new Promise<null>((resolver) => setTimeout(() => resolver(null), restante)),
      ]);
      if (leitura === null) return null;
      leituraEmCurso = null;
      if (leitura.done) return null;
      pendente += decodificador.decode(leitura.value, { stream: true });
      let fim: number;
      while ((fim = pendente.indexOf("\n\n")) >= 0) {
        const bloco = pendente.slice(0, fim);
        pendente = pendente.slice(fim + 2);
        const campos = new Map<string, string>();
        for (const linha of bloco.split("\n")) {
          if (linha.startsWith(":")) continue;
          const separador = linha.indexOf(": ");
          if (separador > 0) campos.set(linha.slice(0, separador), linha.slice(separador + 2));
        }
        if (campos.has("data")) {
          fila.push({ evento: campos.get("event") ?? "message", id: campos.get("id") ?? null, dados: JSON.parse(campos.get("data")!) });
        }
      }
    }
    return fila.shift()!;
  }

  /** Próximo evento com este nome (ignora os outros). */
  async function esperar(nome: string, limiteMs: number): Promise<EventoLido | null> {
    const prazo = Date.now() + limiteMs;
    for (;;) {
      const evento = await proximo(Math.max(0, prazo - Date.now()));
      if (!evento || evento.evento === nome) return evento;
    }
  }

  return { proximo, esperar, fechar: () => leitor.cancel() };
}

const filtros = (query: Record<string, string> = {}) => validar(esquemaFiltroMapa, query);
const abertos: AbortController[] = [];

function abrir(opcoes: { query?: Record<string, string>; versaoMapa?: string | null; versaoCategorias?: string | null; ip?: string | null } = {}) {
  const sinal = new AbortController();
  abertos.push(sinal);
  return abrirFluxoMapa({
    filtros: filtros(opcoes.query),
    versaoMapa: opcoes.versaoMapa ?? null,
    versaoCategorias: opcoes.versaoCategorias ?? null,
    ip: opcoes.ip ?? null,
    sinal: sinal.signal,
  });
}

afterEach(() => {
  for (const sinal of abertos.splice(0)) sinal.abort();
});

describe("Mapa público em tempo real (SSE)", () => {
  it("envia o mapa e as categorias ao conectar, com a mesma versão de /api/public/mapa", async () => {
    const eventos = leitorDeEventos(await abrir());

    const mapa = await eventos.esperar("mapa", 5_000);
    const rest = await obterMapaPublico(filtros());
    expect(mapa?.dados.versao).toBe(rest.etag);
    expect(mapa?.dados).toMatchObject({ abrigos: expect.any(Array), alertas: expect.any(Array), avisos: expect.any(Array) });

    const categorias = await eventos.esperar("categorias", 5_000);
    expect(categorias?.dados).toMatchObject({ versao: expect.any(String), categorias: expect.any(Array) });
    // O id leva as duas versões: é o que o navegador devolve ao reconectar.
    expect(lerIdUltimoEvento(categorias!.id)).toEqual({ versaoMapa: rest.etag, versaoCategorias: categorias!.dados.versao });
  });

  it("não reenvia o que o navegador já tem e avisa quando um abrigo muda", async () => {
    const primeira = leitorDeEventos(await abrir());
    const mapa = await primeira.esperar("mapa", 5_000);
    const categorias = await primeira.esperar("categorias", 5_000);
    await primeira.fechar();

    // Reconexão com as versões atuais: nada a enviar.
    const eventos = leitorDeEventos(
      await abrir({ versaoMapa: String(mapa!.dados.versao), versaoCategorias: String(categorias!.dados.versao) }),
    );
    expect(await eventos.proximo(500)).toBeNull();

    // Escrita feita "em outra instância" (direto no banco, sem avisar): chega na próxima verificação.
    const abrigo = await criarAbrigo({ nome: "Abrigo do Tempo Real" });
    const novo = await eventos.esperar("mapa", INTERVALO_VERIFICACAO_MS * 3);
    expect(novo?.dados.versao).not.toBe(mapa!.dados.versao);
    expect((novo!.dados.abrigos as { id: number }[]).map((a) => a.id)).toContain(abrigo.id);

    // Mudança de lotação também.
    await consultar("UPDATE abrigo SET lotacao_atual = 7 WHERE id = $1", [abrigo.id]);
    const lotacao = await eventos.esperar("mapa", INTERVALO_VERIFICACAO_MS * 3);
    const atualizado = (lotacao!.dados.abrigos as { id: number; ocupacao: { lotacaoAtual: number } }[]).find((a) => a.id === abrigo.id);
    expect(atualizado?.ocupacao.lotacaoAtual).toBe(7);
  });

  it("com localização, calcula a distância de cada conexão", async () => {
    const abrigo = await criarAbrigo({ nome: "Abrigo Distante", latitude: -12.0, longitude: -45.0 });
    const eventos = leitorDeEventos(await abrir({ query: { lat: "-12", lng: "-45", raioKm: "5" } }));
    const mapa = await eventos.esperar("mapa", 5_000);
    const abrigos = mapa!.dados.abrigos as { id: number; distanciaKm: number | null }[];
    expect(abrigos.map((a) => a.id)).toEqual([abrigo.id]);
    expect(abrigos[0].distanciaKm).toBe(0);
  });

  it("solta a inscrição quando o navegador fecha a conexão", async () => {
    const antes = conexoesAbertasNoMapa();
    const sinal = new AbortController();
    await abrirFluxoMapa({ filtros: filtros(), versaoMapa: null, versaoCategorias: null, ip: null, sinal: sinal.signal });
    expect(conexoesAbertasNoMapa()).toBe(antes + 1);
    sinal.abort();
    expect(conexoesAbertasNoMapa()).toBe(antes);
  });

  it("limita as conexões simultâneas por IP", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 10; i++) await abrir({ ip });
    const erro = await capturarErro(abrir({ ip }));
    expect(erro.status).toBe(429);
    // Outro endereço continua entrando.
    await expect(abrir({ ip: "203.0.113.51" })).resolves.toBeInstanceOf(ReadableStream);
  });
});
