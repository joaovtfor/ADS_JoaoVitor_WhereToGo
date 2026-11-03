"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AbrigoMapa, AlertaMapa, CategoriaPublica } from "./tipos";

type Posicao = { lat: number; lng: number };

const CHAVE_ESTADO_SALVO = "wtg:mapa:ultimo-estado";
const INTERVALO_BASE_MS = 30_000;
const INTERVALO_MAXIMO_MS = 120_000;
/** A cada N consultas seguidas sem mudança, o intervalo dobra (até o máximo). */
const CONSULTAS_ATE_ESPACAR = 3;

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
 * - Categorias são buscadas uma única vez (mudam raramente).
 * - Cada carga cancela a anterior (AbortController): uma resposta antiga nunca
 *   sobrescreve a mais nova ao trocar de filtro ou de localização.
 * - Polling a cada 30 s com a aba visível; sem mudanças, o intervalo dobra até
 *   2 min. Volta ao ritmo normal quando algo muda, a aba reaparece ou a rede volta.
 * - O último estado bom fica no navegador: sem conexão (ou enquanto a 1ª carga
 *   chega no 3G), o mapa mostra esses dados com o horário em que foram salvos.
 */
export function useDadosMapa(posicao: Posicao | null, raioKm: number | null) {
  const [abrigos, setAbrigos] = useState<AbrigoMapa[]>([]);
  const [alertas, setAlertas] = useState<AlertaMapa[]>([]);
  const [categorias, setCategorias] = useState<CategoriaPublica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Horário dos dados salvos em exibição (null = dados ao vivo). */
  const [dadosSalvosDe, setDadosSalvosDe] = useState<string | null>(null);
  /** Localização usada na lista atual (para saber quando a lista já reflete o GPS). */
  const [posicaoDosDados, setPosicaoDosDados] = useState<Posicao | null | undefined>(undefined);

  const controladorRef = useRef<AbortController | null>(null);
  const assinaturaRef = useRef("");
  const categoriasRef = useRef<CategoriaPublica[]>([]);
  const ultimaAtualizacaoRef = useRef<string | null>(null);
  const consultasSemMudancaRef = useRef(0);

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

    try {
      const [listaAbrigos, listaAlertas, listaCategorias] = await Promise.all([
        buscarDados<AbrigoMapa[]>(`/api/public/abrigos${consulta ? `?${consulta}` : ""}`, controlador.signal),
        buscarDados<AlertaMapa[]>("/api/public/alertas", controlador.signal),
        categoriasRef.current.length > 0
          ? categoriasRef.current
          : buscarDados<CategoriaPublica[]>("/api/public/categorias", controlador.signal),
      ]);

      // Só atualiza o estado (e redesenha o mapa) quando os dados mudaram.
      const assinatura = JSON.stringify([listaAbrigos, listaAlertas]);
      const mudou = assinatura !== assinaturaRef.current;
      if (mudou) {
        assinaturaRef.current = assinatura;
        setAbrigos(listaAbrigos);
        setAlertas(listaAlertas);
      }
      if (listaCategorias !== categoriasRef.current) {
        categoriasRef.current = listaCategorias;
        setCategorias(listaCategorias);
      }

      const agora = new Date().toISOString();
      ultimaAtualizacaoRef.current = agora;
      setPosicaoDosDados(posicao);
      setErro(null);
      setDadosSalvosDe(null);
      salvarEstado({ abrigos: listaAbrigos, alertas: listaAlertas, categorias: listaCategorias, salvoEm: agora });
      return mudou;
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

    const ciclo = async (primeiraVez: boolean) => {
      await Promise.resolve();
      if (cancelado) return;
      // 3G lento: mostra o último estado salvo enquanto a primeira carga não chega.
      if (primeiraVez && !ultimaAtualizacaoRef.current && assinaturaRef.current === "") {
        const salvo = lerEstadoSalvo();
        if (salvo) aplicarEstadoSalvo(salvo);
      }
      if (document.visibilityState === "visible") {
        const mudou = await carregar();
        consultasSemMudancaRef.current = mudou ? 0 : consultasSemMudancaRef.current + 1;
      }
      if (cancelado) return;
      const fator = 2 ** Math.floor(consultasSemMudancaRef.current / CONSULTAS_ATE_ESPACAR);
      temporizador = window.setTimeout(() => void ciclo(false), Math.min(INTERVALO_BASE_MS * fator, INTERVALO_MAXIMO_MS));
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
  }, [carregar, aplicarEstadoSalvo]);

  const recarregar = useCallback(() => {
    consultasSemMudancaRef.current = 0;
    void carregar();
  }, [carregar]);

  return { abrigos, alertas, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, recarregar };
}
