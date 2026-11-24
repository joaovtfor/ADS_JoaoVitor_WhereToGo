"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AbrigoMapa, AlertaMapa, AvisoOficialMapa, CategoriaPublica } from "./tipos";

type Posicao = { lat: number; lng: number };

const CHAVE_ESTADO_SALVO = "wtg:mapa:ultimo-estado";
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

function lerEstadoSalvo(): EstadoSalvo | null {
  try {
    const texto = localStorage.getItem(CHAVE_ESTADO_SALVO);
    return texto ? (JSON.parse(texto) as EstadoSalvo) : null;
  } catch {
    return null;
  }
}

function salvarEstado(estado: EstadoSalvo) {
  try {
    localStorage.setItem(CHAVE_ESTADO_SALVO, JSON.stringify(estado));
  } catch {
    // Armazenamento cheio ou bloqueado (aba anônima): segue sem modo offline.
  }
}

async function buscarDados<T>(url: string, signal: AbortSignal): Promise<T> {
  const resposta = await fetch(url, { signal });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return ((await resposta.json()) as { dados: T }).dados;
}

/** Parâmetros da consulta (localização e raio): os mesmos no polling e no tempo real. */
function montarConsulta(posicao: Posicao | null, raioKm: number | null): string {
  const params = new URLSearchParams();
  if (posicao) {
    params.set("lat", String(posicao.lat));
    params.set("lng", String(posicao.lng));
    if (raioKm) params.set("raioKm", String(raioKm));
  }
  return params.toString();
}

/**
 * Dados do mapa público: abrigos, alertas, avisos oficiais (INMET) e categorias.
 *
 * - A primeira leitura vem do servidor, no HTML da página (`inicial`): o mapa
 *   tem dados antes de qualquer requisição do navegador.
 * - Tempo real (SSE, `/api/public/mapa/eventos`) enquanto a aba está visível e
 *   em uso: o servidor envia cada mudança assim que ela acontece. Cada conexão
 *   mantém uma função ativa no servidor (cota da Vercel), então ela fecha com a
 *   aba oculta ou sem uso por 15 min, e volta no próximo toque.
 * - Fora do tempo real (aba parada, navegador sem SSE, servidor recusou), vale
 *   o polling: um único endpoint (`/api/public/mapa`) com ETag, a cada 30 s
 *   com a aba visível; sem mudanças, o intervalo dobra até 2 min. Se nada
 *   mudou, a resposta é um 304 sem corpo e nada é redesenhado nem gravado.
 * - Os dois caminhos usam a mesma versão (ETag): trocar de um para o outro não
 *   baixa o mapa de novo.
 * - Cada carga cancela a anterior (AbortController): uma resposta antiga nunca
 *   sobrescreve a mais nova ao trocar de localização.
 * - O último estado bom fica no navegador: sem conexão, o mapa mostra esses
 *   dados com o horário em que foram salvos.
 */
export function useDadosMapa(posicao: Posicao | null, raioKm: number | null, inicial: DadosIniciaisMapa | null = null) {
  const [abrigos, setAbrigos] = useState<AbrigoMapa[]>(inicial?.abrigos ?? []);
  const [alertas, setAlertas] = useState<AlertaMapa[]>(inicial?.alertas ?? []);
  const [avisos, setAvisos] = useState<AvisoOficialMapa[]>(inicial?.avisos ?? []);
  const [categorias, setCategorias] = useState<CategoriaPublica[]>(inicial?.categorias ?? []);
  const [carregando, setCarregando] = useState(inicial === null);
  const [erro, setErro] = useState<string | null>(null);
  /** Horário dos dados salvos em exibição (null = dados ao vivo). */
  const [dadosSalvosDe, setDadosSalvosDe] = useState<string | null>(null);
  /** Localização usada na lista atual (para saber quando a lista já reflete o GPS). */
  const [posicaoDosDados, setPosicaoDosDados] = useState<Posicao | null | undefined>(inicial ? null : undefined);
  /** Versão (ETag) dos dados em exibição: muda a cada alteração no mapa. */
  const [versao, setVersao] = useState<string | null>(inicial?.etag ?? null);

  const controladorRef = useRef<AbortController | null>(null);
  /** Versão que o navegador tem de cada consulta (a URL muda com a localização). */
  const versaoRef = useRef<{ url: string; etag: string } | null>(inicial ? { url: URL_MAPA, etag: inicial.etag } : null);
  const categoriasRef = useRef<CategoriaPublica[]>(inicial?.categorias ?? []);
  /** Versão das categorias recebida pelo tempo real (o HTML não traz uma). */
  const versaoCategoriasRef = useRef<string | null>(null);
  const ultimaAtualizacaoRef = useRef<string | null>(inicial?.geradoEm ?? null);
  const consultasSemMudancaRef = useRef(0);
  const inicialSalvoRef = useRef(false);
  /** Último toque, clique, rolagem ou tecla (zero até o efeito começar). */
  const ultimoUsoRef = useRef(0);
  const recusasTempoRealRef = useRef(0);
  const tempoRealBloqueadoAteRef = useRef(0);

  const aplicarEstadoSalvo = useCallback((salvo: EstadoSalvo) => {
    setAbrigos(salvo.abrigos);
    setAlertas(salvo.alertas);
    setAvisos(salvo.avisos ?? []);
    if (categoriasRef.current.length === 0) {
      categoriasRef.current = salvo.categorias;
      setCategorias(salvo.categorias);
    }
    setDadosSalvosDe(salvo.salvoEm);
  }, []);

  /** Sem rede: mantém o que está na tela ou recorre ao último estado salvo. */
  const marcarSemConexao = useCallback(() => {
    if (ultimaAtualizacaoRef.current) {
      setDadosSalvosDe(ultimaAtualizacaoRef.current);
      return;
    }
    const salvo = lerEstadoSalvo();
    if (salvo) aplicarEstadoSalvo(salvo);
    else setErro("Não foi possível carregar os abrigos. Verifique sua conexão e tente novamente.");
  }, [aplicarEstadoSalvo]);

  /** Mostra uma versão nova do mapa, vinda do polling ou do tempo real, e a guarda para o modo offline. */
  const aplicarMapa = useCallback((dados: DadosMapa, etag: string | null, chave: string, posicaoDaConsulta: Posicao | null) => {
    const novosAvisos = dados.avisos ?? [];
    const agora = new Date().toISOString();
    ultimaAtualizacaoRef.current = agora;
    versaoRef.current = etag ? { url: chave, etag } : null;
    // Lista e localização mudam juntas, no mesmo render. Se `posicaoDosDados`
    // mudasse antes, a tela veria "lista pronta para o GPS" ainda sem as
    // distâncias, e o "mais próximo" sairia em ordem alfabética.
    setAbrigos(dados.abrigos);
    setAlertas(dados.alertas);
    setAvisos(novosAvisos);
    setVersao(etag);
    setPosicaoDosDados(posicaoDaConsulta);
    setErro(null);
    setDadosSalvosDe(null);
    setCarregando(false);
    salvarEstado({ abrigos: dados.abrigos, alertas: dados.alertas, avisos: novosAvisos, categorias: categoriasRef.current, salvoEm: agora });
  }, []);

  /** Busca os dados pelo polling; retorna `true` se algo mudou em relação à última carga. */
  const carregar = useCallback(async (): Promise<boolean> => {
    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;

    const consulta = montarConsulta(posicao, raioKm);
    const url = `${URL_MAPA}${consulta ? `?${consulta}` : ""}`;
    const versaoAtual = versaoRef.current?.url === url ? versaoRef.current : null;

    try {
      const [resposta, listaCategorias] = await Promise.all([
        fetch(url, { signal: controlador.signal, headers: versaoAtual ? { "If-None-Match": versaoAtual.etag } : undefined }),
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
        setPosicaoDosDados(posicao);
        setErro(null);
        setDadosSalvosDe(null);
        return false;
      }

      const { dados } = (await resposta.json()) as { dados: DadosMapa };
      aplicarMapa(dados, resposta.headers.get("ETag"), url, posicao);
      return true;
    } catch {
      if (controlador.signal.aborted) return false;
      marcarSemConexao();
      setPosicaoDosDados(posicao);
      return false;
    } finally {
      if (controladorRef.current === controlador) setCarregando(false);
    }
  }, [posicao, raioKm, aplicarMapa, marcarSemConexao]);

  useEffect(() => {
    let cancelado = false;
    let temporizadorPolling: number | undefined;
    let temporizadorQueda: number | undefined;
    let fonte: EventSource | null = null;
    const consulta = montarConsulta(posicao, raioKm);
    /** Chave da versão: a URL do polling, para os dois caminhos compartilharem o ETag. */
    const chave = `${URL_MAPA}${consulta ? `?${consulta}` : ""}`;

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
      const params = new URLSearchParams(consulta);
      if (versaoRef.current?.url === chave) params.set("versao", versaoRef.current.etag);
      if (versaoCategoriasRef.current) params.set("versaoCategorias", versaoCategoriasRef.current);
      const nova = new EventSource(`${URL_EVENTOS}?${params}`);
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
        // Mesma consulta da versão em tela: o servidor não reenvia nada, e a lista já é desta localização.
        if (versaoRef.current?.url === chave) setPosicaoDosDados(posicao);
      };

      nova.addEventListener("mapa", (evento) => {
        const { versao: etag, ...dados } = JSON.parse((evento as MessageEvent<string>).data) as DadosMapa & { versao: string };
        aplicarMapa(dados, etag, chave, posicao);
      });

      nova.addEventListener("categorias", (evento) => {
        const { versao: versaoCategorias, categorias: lista } = JSON.parse((evento as MessageEvent<string>).data) as {
          versao: string;
          categorias: CategoriaPublica[];
        };
        versaoCategoriasRef.current = versaoCategorias;
        categoriasRef.current = lista;
        setCategorias(lista);
        const salvo = lerEstadoSalvo();
        if (salvo) salvarEstado({ ...salvo, categorias: lista });
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
        temporizadorQueda = window.setTimeout(marcarSemConexao, TOLERANCIA_QUEDA_MS);
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
        salvarEstado({
          abrigos: inicial.abrigos,
          alertas: inicial.alertas,
          avisos: inicial.avisos ?? [],
          categorias: inicial.categorias,
          salvoEm: inicial.geradoEm,
        });
      }

      // Rede lenta: mostra o último estado salvo enquanto a primeira carga não chega.
      if (!ultimaAtualizacaoRef.current) {
        const salvo = lerEstadoSalvo();
        if (salvo) aplicarEstadoSalvo(salvo);
      }

      if (podeUsarTempoReal()) return abrirTempoReal();

      // O que está na tela é o mapa sem localização e tem menos de um intervalo de
      // idade (acabou de vir no HTML ou de uma consulta): a próxima espera a vez.
      const idadeMs = ultimaAtualizacaoRef.current ? Date.now() - Date.parse(ultimaAtualizacaoRef.current) : Number.POSITIVE_INFINITY;
      if (posicao === null && versaoRef.current?.url === URL_MAPA && idadeMs < INTERVALO_BASE_MS) return agendarPolling();
      void consultar();
    };

    void iniciar();
    for (const evento of EVENTOS_DE_USO) window.addEventListener(evento, aoUsar, { passive: true, capture: true });
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("online", aoVoltarRede);
    return () => {
      cancelado = true;
      pararPolling();
      fecharTempoReal();
      window.clearInterval(verificarInatividade);
      controladorRef.current?.abort();
      for (const evento of EVENTOS_DE_USO) window.removeEventListener(evento, aoUsar, { capture: true });
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("online", aoVoltarRede);
    };
  }, [carregar, aplicarEstadoSalvo, aplicarMapa, marcarSemConexao, posicao, raioKm, inicial]);

  const recarregar = useCallback(() => {
    consultasSemMudancaRef.current = 0;
    void carregar();
  }, [carregar]);

  return { abrigos, alertas, avisos, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, versao, recarregar };
}
