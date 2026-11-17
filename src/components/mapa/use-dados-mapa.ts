"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AbrigoMapa, AlertaMapa, CategoriaPublica } from "./tipos";

type Posicao = { lat: number; lng: number };

const CHAVE_ESTADO_SALVO = "wtg:mapa:ultimo-estado";
const INTERVALO_BASE_MS = 30_000;
const INTERVALO_MAXIMO_MS = 120_000;
/** A cada N consultas seguidas sem mudança, o intervalo dobra (até o máximo). */
const CONSULTAS_ATE_ESPACAR = 3;
const URL_MAPA = "/api/public/mapa";

/** Dados que o servidor envia junto com a página (ver `src/app/page.tsx`). */
export interface DadosIniciaisMapa {
  abrigos: AbrigoMapa[];
  alertas: AlertaMapa[];
  categorias: CategoriaPublica[];
  /** Versão dos abrigos e alertas, para a primeira atualização já poder vir vazia (304). */
  etag: string;
  geradoEm: string;
}

interface EstadoSalvo {
  abrigos: AbrigoMapa[];
  alertas: AlertaMapa[];
  categorias: CategoriaPublica[];
  salvoEm: string;
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

/**
 * Dados do mapa público: abrigos, alertas e categorias.
 *
 * - A primeira leitura vem do servidor, no HTML da página (`inicial`): o mapa
 *   tem dados antes de qualquer requisição do navegador.
 * - As atualizações usam um único endpoint (`/api/public/mapa`) com ETag: se
 *   nada mudou, a resposta é um 304 sem corpo e nada é redesenhado nem gravado.
 * - Cada carga cancela a anterior (AbortController): uma resposta antiga nunca
 *   sobrescreve a mais nova ao trocar de localização.
 * - Polling a cada 30 s com a aba visível; sem mudanças, o intervalo dobra até
 *   2 min. Volta ao ritmo normal quando algo muda, a aba reaparece ou a rede volta.
 * - O último estado bom fica no navegador: sem conexão, o mapa mostra esses
 *   dados com o horário em que foram salvos.
 */
export function useDadosMapa(posicao: Posicao | null, raioKm: number | null, inicial: DadosIniciaisMapa | null = null) {
  const [abrigos, setAbrigos] = useState<AbrigoMapa[]>(inicial?.abrigos ?? []);
  const [alertas, setAlertas] = useState<AlertaMapa[]>(inicial?.alertas ?? []);
  const [categorias, setCategorias] = useState<CategoriaPublica[]>(inicial?.categorias ?? []);
  const [carregando, setCarregando] = useState(inicial === null);
  const [erro, setErro] = useState<string | null>(null);
  /** Horário dos dados salvos em exibição (null = dados ao vivo). */
  const [dadosSalvosDe, setDadosSalvosDe] = useState<string | null>(null);
  /** Localização usada na lista atual (para saber quando a lista já reflete o GPS). */
  const [posicaoDosDados, setPosicaoDosDados] = useState<Posicao | null | undefined>(inicial ? null : undefined);

  const controladorRef = useRef<AbortController | null>(null);
  /** Versão que o navegador tem de cada consulta (a URL muda com a localização). */
  const versaoRef = useRef<{ url: string; etag: string } | null>(inicial ? { url: URL_MAPA, etag: inicial.etag } : null);
  const categoriasRef = useRef<CategoriaPublica[]>(inicial?.categorias ?? []);
  const ultimaAtualizacaoRef = useRef<string | null>(inicial?.geradoEm ?? null);
  const consultasSemMudancaRef = useRef(0);
  const inicialSalvoRef = useRef(false);

  const aplicarEstadoSalvo = useCallback((salvo: EstadoSalvo) => {
    setAbrigos(salvo.abrigos);
    setAlertas(salvo.alertas);
    if (categoriasRef.current.length === 0) {
      categoriasRef.current = salvo.categorias;
      setCategorias(salvo.categorias);
    }
    setDadosSalvosDe(salvo.salvoEm);
  }, []);

  /** Busca os dados; retorna `true` se algo mudou em relação à última carga. */
  const carregar = useCallback(async (): Promise<boolean> => {
    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;

    const params = new URLSearchParams();
    if (posicao) {
      params.set("lat", String(posicao.lat));
      params.set("lng", String(posicao.lng));
      if (raioKm) params.set("raioKm", String(raioKm));
    }
    const consulta = params.toString();
    const url = `${URL_MAPA}${consulta ? `?${consulta}` : ""}`;
    const versao = versaoRef.current?.url === url ? versaoRef.current : null;

    try {
      const [resposta, listaCategorias] = await Promise.all([
        fetch(url, { signal: controlador.signal, headers: versao ? { "If-None-Match": versao.etag } : undefined }),
        categoriasRef.current.length > 0 ? categoriasRef.current : buscarDados<CategoriaPublica[]>("/api/public/categorias", controlador.signal),
      ]);
      if (resposta.status !== 304 && !resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      if (listaCategorias !== categoriasRef.current) {
        categoriasRef.current = listaCategorias;
        setCategorias(listaCategorias);
      }

      const agora = new Date().toISOString();
      ultimaAtualizacaoRef.current = agora;

      // 304: o servidor confirmou que nada mudou. Nada a redesenhar nem a gravar.
      if (resposta.status === 304) {
        setPosicaoDosDados(posicao);
        setErro(null);
        setDadosSalvosDe(null);
        return false;
      }

      const { dados } = (await resposta.json()) as { dados: { abrigos: AbrigoMapa[]; alertas: AlertaMapa[] } };
      const etag = resposta.headers.get("ETag");
      versaoRef.current = etag ? { url, etag } : null;
      // Lista e localização mudam juntas, no mesmo render. Se `posicaoDosDados`
      // mudasse antes do `await` acima, a tela veria "lista pronta para o GPS"
      // ainda sem as distâncias, e o "mais próximo" sairia em ordem alfabética.
      setAbrigos(dados.abrigos);
      setAlertas(dados.alertas);
      setPosicaoDosDados(posicao);
      setErro(null);
      setDadosSalvosDe(null);
      salvarEstado({ abrigos: dados.abrigos, alertas: dados.alertas, categorias: listaCategorias, salvoEm: agora });
      return true;
    } catch {
      if (controlador.signal.aborted) return false;

      // Sem rede: mantém o que está na tela ou recorre ao último estado salvo.
      if (ultimaAtualizacaoRef.current) {
        setDadosSalvosDe(ultimaAtualizacaoRef.current);
      } else {
        const salvo = lerEstadoSalvo();
        if (salvo) aplicarEstadoSalvo(salvo);
        else setErro("Não foi possível carregar os abrigos. Verifique sua conexão e tente novamente.");
      }
      setPosicaoDosDados(posicao);
      return false;
    } finally {
      if (controladorRef.current === controlador) setCarregando(false);
    }
  }, [posicao, raioKm, aplicarEstadoSalvo]);

  useEffect(() => {
    let cancelado = false;
    let temporizador: number | undefined;

    const agendar = () => {
      const fator = 2 ** Math.floor(consultasSemMudancaRef.current / CONSULTAS_ATE_ESPACAR);
      temporizador = window.setTimeout(() => void ciclo(false), Math.min(INTERVALO_BASE_MS * fator, INTERVALO_MAXIMO_MS));
    };

    const ciclo = async (primeiraVez: boolean) => {
      await Promise.resolve();
      if (cancelado) return;

      // Os dados enviados pelo servidor com a página também valem para o modo offline.
      if (inicial && !inicialSalvoRef.current) {
        inicialSalvoRef.current = true;
        salvarEstado({ abrigos: inicial.abrigos, alertas: inicial.alertas, categorias: inicial.categorias, salvoEm: inicial.geradoEm });
      }

      // O que está na tela é o mapa sem localização e tem menos de um intervalo de
      // idade (acabou de vir no HTML ou de uma consulta): a próxima espera a vez.
      const idadeMs = ultimaAtualizacaoRef.current ? Date.now() - Date.parse(ultimaAtualizacaoRef.current) : Number.POSITIVE_INFINITY;
      if (primeiraVez && posicao === null && versaoRef.current?.url === URL_MAPA && idadeMs < INTERVALO_BASE_MS) return agendar();

      // Rede lenta: mostra o último estado salvo enquanto a primeira carga não chega.
      if (primeiraVez && !ultimaAtualizacaoRef.current) {
        const salvo = lerEstadoSalvo();
        if (salvo) aplicarEstadoSalvo(salvo);
      }
      if (document.visibilityState === "visible") {
        const mudou = await carregar();
        consultasSemMudancaRef.current = mudou ? 0 : consultasSemMudancaRef.current + 1;
      }
      if (!cancelado) agendar();
    };

    const retomar = () => {
      if (document.visibilityState !== "visible") return;
      consultasSemMudancaRef.current = 0;
      void carregar();
    };

    void ciclo(true);
    document.addEventListener("visibilitychange", retomar);
    window.addEventListener("online", retomar);
    return () => {
      cancelado = true;
      window.clearTimeout(temporizador);
      controladorRef.current?.abort();
      document.removeEventListener("visibilitychange", retomar);
      window.removeEventListener("online", retomar);
    };
  }, [carregar, aplicarEstadoSalvo, posicao, inicial]);

  const recarregar = useCallback(() => {
    consultasSemMudancaRef.current = 0;
    void carregar();
  }, [carregar]);

  return { abrigos, alertas, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, recarregar };
}
