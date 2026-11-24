import { aoInvalidarDadosPublicos } from "@/lib/cache";
import { calcularEtag } from "@/lib/etag";
import { ErroApi, erros } from "@/lib/http";
import { formatarEventoSse, formatarRetrySse, PING_SSE } from "@/lib/sse";
import { listarAvisosVigentes, type AvisoOficial } from "../integracoes/avisos.service";
import { montarRespostaMapa } from "./publico.mapa";
import {
  consultarLinhasAbrigosPublicos,
  listarAbrigosPublicos,
  listarAlertasPublicos,
  listarCategoriasPublicas,
  montarListaAbrigosPublicos,
  type AlertaPublico,
  type FiltroMapa,
  type LinhaAbrigoPublico,
} from "./publico.service";

/*
 * Mapa público em tempo real (Server-Sent Events).
 *
 * Cada instância do servidor faz UMA verificação periódica do banco,
 * compartilhada por todas as conexões abertas nela: com 1 ou 500 pessoas no
 * mapa, são as mesmas 4 consultas a cada INTERVALO_VERIFICACAO_MS, e só
 * enquanto houver alguém conectado.
 *
 * A fonte da verdade é o banco, nunca a memória de uma instância: na Vercel,
 * uma escrita feita em outra instância aparece aqui na próxima verificação.
 * Uma escrita feita nesta instância antecipa a verificação
 * (`invalidarDadosPublicos`), e a mudança chega na hora.
 *
 * As leituras não passam pelo "use cache": na Vercel esse cache fica na
 * memória de cada instância e pode estar até 30 s atrás de uma escrita feita
 * em outra.
 */

/** De quanto em quanto tempo cada instância confere o banco enquanto há conexões abertas. */
export const INTERVALO_VERIFICACAO_MS = 3_000;
/**
 * Duração de cada conexão. O plano Hobby da Vercel encerra a função aos 300 s:
 * a conexão fecha antes e o navegador reconecta em RECONEXAO_MS, informando a
 * versão que já tem (nada é reenviado se o mapa não mudou).
 */
export const DURACAO_CONEXAO_MS = 240_000;
const RECONEXAO_MS = 3_000;
/** Proxies costumam fechar conexões sem tráfego após 60 s. */
const INTERVALO_PING_MS = 20_000;
/**
 * Conexões simultâneas por IP em cada instância. Cada conexão mantém a função
 * ativa (cota da Vercel): o limite impede que um único endereço segure dezenas
 * delas. Passou do limite, o navegador recebe 429 e volta ao polling.
 */
const MAX_CONEXOES_POR_IP = 10;

type CategoriaPublica = Awaited<ReturnType<typeof listarCategoriasPublicas>>[number];

/** Uma leitura de tudo o que o mapa mostra, sem localização. */
interface Instantaneo {
  linhas: LinhaAbrigoPublico[];
  alertas: AlertaPublico[];
  avisos: AvisoOficial[];
  categorias: CategoriaPublica[];
  versaoCategorias: string;
  /** Muda quando qualquer parte muda: é o que decide se as conexões são avisadas. */
  assinatura: string;
  lidoEm: number;
}

type Ouvinte = (instantaneo: Instantaneo) => void;

interface Central {
  ouvintes: Set<Ouvinte>;
  conexoesPorIp: Map<string, number>;
  atual: Instantaneo | null;
  temporizador: ReturnType<typeof setTimeout> | null;
  emAndamento: Promise<Instantaneo | null> | null;
  /** Pedido de verificação durante uma leitura: a escrita pode ter terminado depois do SELECT. */
  repetir: boolean;
  /** Última leitura falhou (banco fora do ar). Evita repetir o log a cada verificação. */
  falhou: boolean;
}

// No globalThis para sobreviver ao recarregamento de módulos do `next dev`.
const globalComCentral = globalThis as typeof globalThis & { __wtgMapaTempoReal?: Central };

function central(): Central {
  if (!globalComCentral.__wtgMapaTempoReal) {
    const nova: Central = {
      ouvintes: new Set(),
      conexoesPorIp: new Map(),
      atual: null,
      temporizador: null,
      emAndamento: null,
      repetir: false,
      falhou: false,
    };
    // Escrita feita nesta instância: confere o banco agora, não daqui a 3 s.
    aoInvalidarDadosPublicos(() => {
      if (nova.ouvintes.size > 0) void verificar(nova);
    });
    globalComCentral.__wtgMapaTempoReal = nova;
  }
  return globalComCentral.__wtgMapaTempoReal;
}

async function lerInstantaneo(): Promise<Instantaneo> {
  const [linhas, alertas, avisos, categorias] = await Promise.all([
    consultarLinhasAbrigosPublicos({}),
    listarAlertasPublicos(),
    listarAvisosVigentes(),
    listarCategoriasPublicas(),
  ]);
  return {
    linhas,
    alertas,
    avisos,
    categorias,
    versaoCategorias: calcularEtag(categorias),
    assinatura: calcularEtag({ linhas, alertas, avisos, categorias }),
    lidoEm: Date.now(),
  };
}

function agendar(c: Central): void {
  if (c.temporizador) clearTimeout(c.temporizador);
  c.temporizador = null;
  if (c.ouvintes.size === 0) return;
  c.temporizador = setTimeout(() => {
    c.temporizador = null;
    void verificar(c);
  }, INTERVALO_VERIFICACAO_MS);
}

/** Lê o banco e avisa as conexões se algo mudou. Resolve com a leitura atual, ou `null` se o banco falhou. */
function verificar(c: Central): Promise<Instantaneo | null> {
  if (c.emAndamento) {
    c.repetir = true;
    return c.emAndamento;
  }
  const execucao = (async () => {
    try {
      do {
        c.repetir = false;
        const novo = await lerInstantaneo();
        const mudou = novo.assinatura !== c.atual?.assinatura;
        c.atual = novo;
        c.falhou = false;
        if (mudou) {
          for (const ouvinte of c.ouvintes) ouvinte(novo);
        }
      } while (c.repetir);
    } catch (erro) {
      if (!c.falhou) console.error("[mapa-tempo-real] falha ao ler o banco; nova tentativa na próxima verificação", erro);
      c.falhou = true;
    } finally {
      c.emAndamento = null;
      agendar(c);
    }
    return c.falhou ? null : c.atual;
  })();
  c.emAndamento = execucao;
  return execucao;
}

/**
 * Passa a receber as mudanças do mapa. Devolve uma leitura recente (feita agora
 * ou há menos de um intervalo) e a função que cancela a inscrição.
 */
async function inscrever(c: Central, ouvinte: Ouvinte): Promise<{ atual: Instantaneo; cancelar: () => void }> {
  c.ouvintes.add(ouvinte);
  const cancelar = () => {
    c.ouvintes.delete(ouvinte);
    if (c.ouvintes.size === 0 && c.temporizador) {
      clearTimeout(c.temporizador);
      c.temporizador = null;
    }
  };

  const recente = c.atual && !c.falhou && Date.now() - c.atual.lidoEm < INTERVALO_VERIFICACAO_MS ? c.atual : null;
  const atual = recente ?? (await verificar(c));
  if (!atual) {
    cancelar();
    throw new ErroApi(503, "MAPA_INDISPONIVEL", "Não foi possível ler os dados do mapa agora.");
  }
  if (!c.temporizador && !c.emAndamento) agendar(c);
  return { atual, cancelar };
}

function reservarConexao(c: Central, ip: string | null): () => void {
  if (!ip) return () => undefined;
  const abertas = c.conexoesPorIp.get(ip) ?? 0;
  if (abertas >= MAX_CONEXOES_POR_IP) {
    throw erros.muitasTentativas("Muitas conexões abertas com o mapa a partir deste endereço.");
  }
  c.conexoesPorIp.set(ip, abertas + 1);
  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    const restantes = (c.conexoesPorIp.get(ip) ?? 1) - 1;
    if (restantes > 0) c.conexoesPorIp.set(ip, restantes);
    else c.conexoesPorIp.delete(ip);
  };
}

/** O `id` de cada evento leva as duas versões, separadas por espaço: o navegador o devolve ao reconectar. */
export function lerIdUltimoEvento(valor: string | null): { versaoMapa: string | null; versaoCategorias: string | null } {
  const [versaoMapa, versaoCategorias] = (valor ?? "").slice(0, 200).split(" ");
  return { versaoMapa: versaoMapa || null, versaoCategorias: versaoCategorias || null };
}

export interface OpcoesFluxoMapa {
  filtros: FiltroMapa;
  /** Versão do mapa que o navegador já tem: nada é enviado enquanto for a mesma. */
  versaoMapa: string | null;
  versaoCategorias: string | null;
  ip: string | null;
  /** Abortado quando o navegador fecha a conexão. */
  sinal: AbortSignal;
}

/**
 * Abre o fluxo SSE de uma conexão. Eventos:
 * - `mapa`: `{ versao, abrigos, alertas, avisos }`, o mesmo conteúdo de
 *   `/api/public/mapa` com os mesmos filtros (lat/lng/raioKm);
 * - `categorias`: `{ versao, categorias }`, o de `/api/public/categorias`.
 *
 * Cada um só é enviado quando difere do que o navegador tem. Lança antes de
 * abrir o fluxo (banco fora do ar, limite de conexões), para a rota responder
 * com o erro e o navegador voltar ao polling.
 */
export async function abrirFluxoMapa(opcoes: OpcoesFluxoMapa): Promise<ReadableStream<Uint8Array>> {
  const c = central();
  const liberarConexao = reservarConexao(c, opcoes.ip);
  const codificador = new TextEncoder();
  const { filtros } = opcoes;

  let controlador: ReadableStreamDefaultController<Uint8Array> | null = null;
  let encerrado = false;
  let versaoMapa = opcoes.versaoMapa;
  let versaoCategorias = opcoes.versaoCategorias;
  let fila: Promise<void> = Promise.resolve();
  let cancelarInscricao: (() => void) | null = null;
  const temporizadores: { ping?: ReturnType<typeof setInterval>; limite?: ReturnType<typeof setTimeout> } = {};

  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    clearInterval(temporizadores.ping);
    clearTimeout(temporizadores.limite);
    cancelarInscricao?.();
    liberarConexao();
    opcoes.sinal.removeEventListener("abort", encerrar);
    try {
      controlador?.close();
    } catch {
      // O navegador já fechou o fluxo.
    }
  };

  const enviar = (texto: string) => {
    if (encerrado || !controlador) return;
    try {
      controlador.enqueue(codificador.encode(texto));
    } catch {
      encerrar();
    }
  };

  const idEvento = () => `${versaoMapa ?? ""} ${versaoCategorias ?? ""}`;

  const processar = async (instantaneo: Instantaneo) => {
    if (encerrado) return;
    // Sem localização, a lista sai da leitura compartilhada; com localização,
    // a distância e o raio vêm do PostGIS (uma consulta por conexão, só quando algo mudou).
    const abrigos =
      filtros.lat === undefined ? montarListaAbrigosPublicos(instantaneo.linhas, filtros) : await listarAbrigosPublicos(filtros);
    if (encerrado) return;

    const mapa = montarRespostaMapa(abrigos, instantaneo.alertas, instantaneo.avisos);
    if (mapa.etag !== versaoMapa) {
      versaoMapa = mapa.etag;
      enviar(formatarEventoSse({ evento: "mapa", id: idEvento(), dados: { versao: mapa.etag, ...mapa.dados } }));
    }
    if (instantaneo.versaoCategorias !== versaoCategorias) {
      versaoCategorias = instantaneo.versaoCategorias;
      enviar(
        formatarEventoSse({
          evento: "categorias",
          id: idEvento(),
          dados: { versao: instantaneo.versaoCategorias, categorias: instantaneo.categorias },
        }),
      );
    }
  };

  // Em fila: uma mudança só é enviada depois da anterior, na ordem em que chegaram.
  const atualizar: Ouvinte = (instantaneo) => {
    fila = fila
      .then(() => processar(instantaneo))
      .catch((erro) => console.error("[mapa-tempo-real] falha ao montar o evento; tenta de novo na próxima mudança", erro));
  };

  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      controlador = controle;
    },
    cancel() {
      encerrar();
    },
  });

  opcoes.sinal.addEventListener("abort", encerrar, { once: true });
  try {
    const inscricao = await inscrever(c, atualizar);
    cancelarInscricao = inscricao.cancelar;
    if (encerrado || opcoes.sinal.aborted) {
      encerrar();
      inscricao.cancelar();
      return fluxo;
    }
    enviar(formatarRetrySse(RECONEXAO_MS));
    atualizar(inscricao.atual);
  } catch (erro) {
    encerrar();
    throw erro;
  }

  temporizadores.ping = setInterval(() => enviar(PING_SSE), INTERVALO_PING_MS);
  temporizadores.limite = setTimeout(encerrar, DURACAO_CONEXAO_MS);
  return fluxo;
}

/** Conexões abertas nesta instância (testes e diagnóstico). */
export function conexoesAbertasNoMapa(): number {
  return central().ouvintes.size;
}
