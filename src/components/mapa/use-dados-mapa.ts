"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agendarSalvamentoOffline, lerEstadoOffline } from "./armazenamento-offline";
import type { AbrigoMapa, AlertaMapa, AvisoOficialMapa, CategoriaPublica } from "./tipos";

type Posicao = { lat: number; lng: number };

const INTERVALO_BASE_MS = 30_000;
const INTERVALO_MAXIMO_MS = 120_000;
/** A cada N consultas seguidas sem mudança, o intervalo dobra (até o máximo). */
const CONSULTAS_ATE_ESPACAR = 3;
const URL_MAPA = "/api/public/mapa";
const URL_EVENTOS = "/api/public/mapa/eventos";
/** Sem toque, clique, rolagem ou tecla por este tempo, o mapa sai do tempo real e volta ao polling. */
const INATIVIDADE_MS = 15 * 60_000;
/**
 * A conexão caiu e não voltou neste prazo: mostra "sem conexão". O servidor
 * troca a conexão a cada 4 min, e a reconexão leva uns 3 s: sem essa folga, o
 * aviso piscaria a cada troca.
 */
const TOLERANCIA_QUEDA_MS = 10_000;
/** Tempo real recusado pelo servidor (desligado, limite, erro): só tenta de novo depois de 1, 2, 4... até 10 min. */
const ESPERA_NOVA_TENTATIVA_MS = 60_000;
const ESPERA_MAXIMA_NOVA_TENTATIVA_MS = 10 * 60_000;
const EVENTOS_DE_USO = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** Dados que o servidor envia junto com a página (ver `src/app/page.tsx`). */
export interface DadosIniciaisMapa {
  abrigos: AbrigoMapa[];
  alertas: AlertaMapa[];
  /** Avisos oficiais do INMET (opcional: respostas de versões anteriores não têm). */
  avisos?: AvisoOficialMapa[];
  categorias: CategoriaPublica[];
  /** Versão dos abrigos e alertas, para a primeira atualização já poder vir vazia (304). */
  etag: string;
  geradoEm: string;
}

interface EstadoSalvo {
  abrigos: AbrigoMapa[];
  alertas: AlertaMapa[];
  /** Ausente em estados salvos antes dos avisos do INMET. */
  avisos?: AvisoOficialMapa[];
  categorias: CategoriaPublica[];
  salvoEm: string;
}

interface DadosMapa {
  abrigos: AbrigoMapa[];
  alertas: AlertaMapa[];
  avisos?: AvisoOficialMapa[];
}

function assinaturaAlertas(alertas: AlertaMapa[]): string {
  return JSON.stringify(alertas);
}

function assinaturaAvisos(avisos: AvisoOficialMapa[]): string {
  return JSON.stringify(avisos);
}

async function buscarDados<T>(url: string, signal: AbortSignal): Promise<T> {
  const resposta = await fetch(url, { signal });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return ((await resposta.json()) as { dados: T }).dados;
}

/**
 * Dados do mapa público: abrigos, alertas, avisos oficiais (INMET) e categorias.
 *
 * - A primeira leitura vem do servidor, no HTML da página (`inicial`): o mapa
 *   tem dados antes de qualquer requisição do navegador.
 * - As URLs de polling e SSE não levam `lat`, `lng` nem `raioKm`, mantendo a
 *   mesma chave de cache para todos os visitantes; distância e raio são aplicados
 *   localmente sem reconectar o SSE ao ligar o GPS.
 * - Tempo real (SSE, `/api/public/mapa/eventos`) enquanto a aba está visível e
 *   em uso: o servidor envia cada mudança assim que ela acontece.
 * - Fora do tempo real (aba parada, navegador sem SSE, servidor recusou), vale
 *   o polling (`/api/public/mapa`) com ETag e 304 sem corpo.
 * - O último estado bom fica no IndexedDB: sem conexão, o mapa mostra esses
 *   dados com o horário em que foram salvos.
 */
export function useDadosMapa(posicao: Posicao | null, raioKm: number | null, inicial: DadosIniciaisMapa | null = null, pausado = false) {
  void raioKm;

  const [abrigos, setAbrigos] = useState<AbrigoMapa[]>(inicial?.abrigos ?? []);
  const [alertas, setAlertas] = useState<AlertaMapa[]>(inicial?.alertas ?? []);
  const [avisos, setAvisos] = useState<AvisoOficialMapa[]>(inicial?.avisos ?? []);
  const [categorias, setCategorias] = useState<CategoriaPublica[]>(inicial?.categorias ?? []);
  const [carregando, setCarregando] = useState(inicial === null);
  const [erro, setErro] = useState<string | null>(null);
  /** Horário dos dados salvos em exibição (null = dados ao vivo). */
  const [dadosSalvosDe, setDadosSalvosDe] = useState<string | null>(null);
  /** Versão (ETag) dos dados em exibição: muda a cada alteração no mapa. */
  const [versao, setVersao] = useState<string | null>(inicial?.etag ?? null);

  const controladorRef = useRef<AbortController | null>(null);
  /** Versão que o navegador tem da URL base compartilhada do mapa. */
  const versaoRef = useRef<{ url: string; etag: string } | null>(inicial ? { url: URL_MAPA, etag: inicial.etag } : null);
  const categoriasRef = useRef<CategoriaPublica[]>(inicial?.categorias ?? []);
  /** Versão das categorias recebida pelo tempo real (o HTML não traz uma). */
  const versaoCategoriasRef = useRef<string | null>(null);
  const assinaturaAlertasRef = useRef<string>(assinaturaAlertas(inicial?.alertas ?? []));
  const assinaturaAvisosRef = useRef<string>(assinaturaAvisos(inicial?.avisos ?? []));
  const ultimaAtualizacaoRef = useRef<string | null>(inicial?.geradoEm ?? null);
  const consultasSemMudancaRef = useRef(0);
  const inicialSalvoRef = useRef(false);
  const cancelarSalvamentoRef = useRef<(() => void) | null>(null);
  /** Último toque, clique, rolagem ou tecla (zero até o efeito começar). */
  const ultimoUsoRef = useRef(0);
  const recusasTempoRealRef = useRef(0);
  const tempoRealBloqueadoAteRef = useRef(0);

  const agendarSnapshot = useCallback((estado: EstadoSalvo) => {
    cancelarSalvamentoRef.current?.();
    cancelarSalvamentoRef.current = agendarSalvamentoOffline(estado);
  }, []);

  const aplicarEstadoSalvo = useCallback((salvo: EstadoSalvo) => {
    setAbrigos(salvo.abrigos);
    const novaAssinaturaAlertas = assinaturaAlertas(salvo.alertas);
    if (novaAssinaturaAlertas !== assinaturaAlertasRef.current) {
      assinaturaAlertasRef.current = novaAssinaturaAlertas;
      setAlertas(salvo.alertas);
    }
    const novosAvisos = salvo.avisos ?? [];
    const novaAssinaturaAvisos = assinaturaAvisos(novosAvisos);
    if (novaAssinaturaAvisos !== assinaturaAvisosRef.current) {
      assinaturaAvisosRef.current = novaAssinaturaAvisos;
      setAvisos(novosAvisos);
    }
    if (categoriasRef.current.length === 0) {
      categoriasRef.current = salvo.categorias;
      setCategorias(salvo.categorias);
    }
    setDadosSalvosDe(salvo.salvoEm);
  }, []);

  /** Sem rede: mantém o que está na tela ou recorre ao último estado salvo. */
  const marcarSemConexao = useCallback(async () => {
    if (ultimaAtualizacaoRef.current) {
      setDadosSalvosDe(ultimaAtualizacaoRef.current);
      return;
    }
    const salvo = await lerEstadoOffline<EstadoSalvo>();
    if (ultimaAtualizacaoRef.current) return;
    if (salvo) aplicarEstadoSalvo(salvo);
    else setErro("Não foi possível carregar os abrigos. Verifique sua conexão e tente novamente.");
  }, [aplicarEstadoSalvo]);

  /** Mostra uma versão nova do mapa, vinda do polling ou do tempo real, e a guarda para o modo offline. */
  const aplicarMapa = useCallback(
    (dados: DadosMapa, etag: string | null, chave: string) => {
      const novosAvisos = dados.avisos ?? [];
      const agora = new Date().toISOString();
      ultimaAtualizacaoRef.current = agora;
      versaoRef.current = etag ? { url: chave, etag } : null;
      setAbrigos(dados.abrigos);

      const novaAssinaturaAlertas = assinaturaAlertas(dados.alertas);
      if (novaAssinaturaAlertas !== assinaturaAlertasRef.current) {
        assinaturaAlertasRef.current = novaAssinaturaAlertas;
        setAlertas(dados.alertas);
      }

      const novaAssinaturaAvisos = assinaturaAvisos(novosAvisos);
      if (novaAssinaturaAvisos !== assinaturaAvisosRef.current) {
        assinaturaAvisosRef.current = novaAssinaturaAvisos;
        setAvisos(novosAvisos);
      }

      setVersao(etag);
      setErro(null);
      setDadosSalvosDe(null);
      setCarregando(false);
      agendarSnapshot({ abrigos: dados.abrigos, alertas: dados.alertas, avisos: novosAvisos, categorias: categoriasRef.current, salvoEm: agora });
    },
    [agendarSnapshot],
  );

  /** Busca os dados pelo polling; retorna `true` se algo mudou em relação à última carga. */
  const carregar = useCallback(async (): Promise<boolean> => {
    if (pausado) return false;
    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;

    const versaoAtual = versaoRef.current?.url === URL_MAPA ? versaoRef.current : null;

    try {
      const [resposta, listaCategorias] = await Promise.all([
        fetch(URL_MAPA, { signal: controlador.signal, headers: versaoAtual ? { "If-None-Match": versaoAtual.etag } : undefined }),
        categoriasRef.current.length > 0 ? categoriasRef.current : buscarDados<CategoriaPublica[]>("/api/public/categorias", controlador.signal),
      ]);
      if (resposta.status !== 304 && !resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      if (listaCategorias !== categoriasRef.current) {
        categoriasRef.current = listaCategorias;
        setCategorias(listaCategorias);
      }

      // 304: o servidor confirmou que nada mudou. Nada a redesenhar nem a gravar.
      if (resposta.status === 304) {
        ultimaAtualizacaoRef.current = new Date().toISOString();
        setErro(null);
        setDadosSalvosDe(null);
        return false;
      }

      const { dados } = (await resposta.json()) as { dados: DadosMapa };
      aplicarMapa(dados, resposta.headers.get("ETag"), URL_MAPA);
      return true;
    } catch {
      if (controlador.signal.aborted) return false;
      await marcarSemConexao();
      return false;
    } finally {
      if (controladorRef.current === controlador) setCarregando(false);
    }
  }, [aplicarMapa, marcarSemConexao, pausado]);

  useEffect(() => {
    if (pausado) {
      controladorRef.current?.abort();
      cancelarSalvamentoRef.current?.();
      cancelarSalvamentoRef.current = null;
      return;
    }

    let cancelado = false;
    let temporizadorPolling: number | undefined;
    let temporizadorQueda: number | undefined;
    let fonte: EventSource | null = null;
    const chave = URL_MAPA;

    // --- Polling (aba parada, navegador sem SSE ou servidor recusou o tempo real) ---

    const pararPolling = () => {
      window.clearTimeout(temporizadorPolling);
      temporizadorPolling = undefined;
    };

    const agendarPolling = () => {
      pararPolling();
      const fator = 2 ** Math.floor(consultasSemMudancaRef.current / CONSULTAS_ATE_ESPACAR);
      temporizadorPolling = window.setTimeout(() => void consultar(), Math.min(INTERVALO_BASE_MS * fator, INTERVALO_MAXIMO_MS));
    };

    const consultar = async () => {
      if (cancelado || fonte) return;
      if (document.visibilityState === "visible") {
        const mudou = await carregar();
        consultasSemMudancaRef.current = mudou ? 0 : consultasSemMudancaRef.current + 1;
      }
      if (!cancelado && !fonte) agendarPolling();
    };

    // --- Tempo real (SSE) ---

    const podeUsarTempoReal = () =>
      typeof EventSource !== "undefined" &&
      document.visibilityState === "visible" &&
      Date.now() - ultimoUsoRef.current < INATIVIDADE_MS &&
      Date.now() >= tempoRealBloqueadoAteRef.current;

    const fecharTempoReal = () => {
      window.clearTimeout(temporizadorQueda);
      fonte?.close();
      fonte = null;
    };

    const abrirTempoReal = () => {
      if (cancelado || fonte) return;
      pararPolling();
      const params = new URLSearchParams();
      if (versaoRef.current?.url === chave) params.set("versao", versaoRef.current.etag);
      if (versaoCategoriasRef.current) params.set("versaoCategorias", versaoCategoriasRef.current);
      const consulta = params.toString();
      const nova = new EventSource(consulta ? `${URL_EVENTOS}?${consulta}` : URL_EVENTOS);
      fonte = nova;
      let conectada = false;

      nova.onopen = () => {
        conectada = true;
        window.clearTimeout(temporizadorQueda);
        recusasTempoRealRef.current = 0;
        consultasSemMudancaRef.current = 0;
        ultimaAtualizacaoRef.current = new Date().toISOString();
        setErro(null);
        setDadosSalvosDe(null);
      };

      nova.addEventListener("mapa", (evento) => {
        const { versao: etag, ...dados } = JSON.parse((evento as MessageEvent<string>).data) as DadosMapa & { versao: string };
        aplicarMapa(dados, etag, chave);
      });

      nova.addEventListener("categorias", (evento) => {
        const { versao: versaoCategorias, categorias: lista } = JSON.parse((evento as MessageEvent<string>).data) as {
          versao: string;
          categorias: CategoriaPublica[];
        };
        versaoCategoriasRef.current = versaoCategorias;
        categoriasRef.current = lista;
        setCategorias(lista);
        void (async () => {
          const salvo = await lerEstadoOffline<EstadoSalvo>();
          if (cancelado || !salvo) return;
          agendarSnapshot({ ...salvo, categorias: lista });
        })();
      });

      nova.onerror = () => {
        if (nova.readyState === EventSource.CLOSED) {
          // Recusado (tempo real desligado, limite de conexões, banco fora do ar):
          // volta ao polling e só tenta de novo depois de esperar.
          fecharTempoReal();
          tempoRealBloqueadoAteRef.current =
            Date.now() + Math.min(ESPERA_NOVA_TENTATIVA_MS * 2 ** recusasTempoRealRef.current, ESPERA_MAXIMA_NOVA_TENTATIVA_MS);
          recusasTempoRealRef.current += 1;
          void consultar();
          return;
        }
        // Reconectando (troca de conexão a cada 4 min ou rede oscilando): o
        // navegador tenta sozinho. Até cair, os dados estavam ao vivo.
        if (conectada) ultimaAtualizacaoRef.current = new Date().toISOString();
        conectada = false;
        window.clearTimeout(temporizadorQueda);
        temporizadorQueda = window.setTimeout(() => {
          if (!cancelado) void marcarSemConexao();
        }, TOLERANCIA_QUEDA_MS);
      };
    };

    // --- Uso da tela: o tempo real só fica aberto enquanto alguém usa o mapa ---

    const aoUsar = () => {
      ultimoUsoRef.current = Date.now();
      if (!fonte && podeUsarTempoReal()) abrirTempoReal();
    };

    const verificarInatividade = window.setInterval(() => {
      if (fonte && Date.now() - ultimoUsoRef.current >= INATIVIDADE_MS) {
        fecharTempoReal();
        agendarPolling();
      }
    }, 60_000);

    const aoMudarVisibilidade = () => {
      if (document.visibilityState !== "visible") {
        // Aba oculta: nenhuma conexão aberta nem consulta.
        fecharTempoReal();
        pararPolling();
        return;
      }
      ultimoUsoRef.current = Date.now();
      consultasSemMudancaRef.current = 0;
      if (podeUsarTempoReal()) abrirTempoReal();
      else {
        pararPolling();
        void consultar();
      }
    };

    const aoVoltarRede = () => {
      if (document.visibilityState !== "visible") return;
      fecharTempoReal();
      aoMudarVisibilidade();
    };

    const iniciar = async () => {
      await Promise.resolve();
      if (cancelado) return;
      ultimoUsoRef.current = Date.now();

      // Os dados enviados pelo servidor com a página também valem para o modo offline.
      if (inicial && !inicialSalvoRef.current) {
        inicialSalvoRef.current = true;
        agendarSnapshot({
          abrigos: inicial.abrigos,
          alertas: inicial.alertas,
          avisos: inicial.avisos ?? [],
          categorias: inicial.categorias,
          salvoEm: inicial.geradoEm,
        });
      }

      // Rede lenta: mostra o último estado salvo enquanto a primeira carga não chega.
      if (!ultimaAtualizacaoRef.current) {
        const salvo = await lerEstadoOffline<EstadoSalvo>();
        if (cancelado) return;
        if (salvo && !ultimaAtualizacaoRef.current) aplicarEstadoSalvo(salvo);
      }

      if (podeUsarTempoReal()) return abrirTempoReal();

      // O que está na tela tem menos de um intervalo de idade (acabou de vir no
      // HTML ou de uma consulta): a próxima atualização espera a vez.
      const idadeMs = ultimaAtualizacaoRef.current ? Date.now() - Date.parse(ultimaAtualizacaoRef.current) : Number.POSITIVE_INFINITY;
      if (versaoRef.current?.url === URL_MAPA && idadeMs < INTERVALO_BASE_MS) return agendarPolling();
      void consultar();
    };

    void iniciar();
    for (const evento of EVENTOS_DE_USO) window.addEventListener(evento, aoUsar, { passive: true, capture: true });
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("online", aoVoltarRede);
    return () => {
      cancelado = true;
      cancelarSalvamentoRef.current?.();
      cancelarSalvamentoRef.current = null;
      pararPolling();
      fecharTempoReal();
      window.clearInterval(verificarInatividade);
      controladorRef.current?.abort();
      for (const evento of EVENTOS_DE_USO) window.removeEventListener(evento, aoUsar, { capture: true });
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("online", aoVoltarRede);
    };
  }, [agendarSnapshot, aplicarEstadoSalvo, aplicarMapa, carregar, inicial, marcarSemConexao, pausado]);

  const recarregar = useCallback(() => {
    consultasSemMudancaRef.current = 0;
    void carregar();
  }, [carregar]);

  /** Localização refletida localmente assim que há dados prontos (distância calculada no cliente). */
  const posicaoDosDados = !carregando || dadosSalvosDe !== null ? posicao : undefined;

  return { abrigos, alertas, avisos, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, versao, recarregar };
}
