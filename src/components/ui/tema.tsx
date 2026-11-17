"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { CHAVE_TEMA, COR_BARRA, ehTema, TEMA_PADRAO, type Tema, type TemaEfetivo } from "@/lib/tema";

/**
 * Tema claro/escuro no navegador (DESIGN.md §8.2). A escolha fica no
 * `localStorage` deste aparelho; o script do `<head>` (src/lib/tema.ts) a
 * aplica antes da primeira pintura e este módulo cuida do resto: trocar,
 * acompanhar o aparelho em "Sistema" e sincronizar abas abertas.
 */

/** Avisa os componentes desta aba que o tema mudou (o evento `storage` só chega às outras abas). */
const EVENTO_TEMA = "wtg:tema";
const CONSULTA_CLARO = "(prefers-color-scheme: light)";

function lerTemaSalvo(): Tema {
  try {
    const salvo = window.localStorage.getItem(CHAVE_TEMA);
    return ehTema(salvo) ? salvo : TEMA_PADRAO;
  } catch {
    return TEMA_PADRAO; // armazenamento bloqueado (aba anônima, política do navegador)
  }
}

function aparelhoClaro(): boolean {
  return window.matchMedia(CONSULTA_CLARO).matches;
}

function resolver(tema: Tema): TemaEfetivo {
  if (tema === "sistema") return aparelhoClaro() ? "claro" : "escuro";
  return tema;
}

/**
 * Põe o tema no `<html>` e acerta a cor da barra do navegador. O layout escreve
 * uma `theme-color` por modo do aparelho (`media`): em "Sistema" cada uma volta
 * à sua cor; com escolha manual, as duas recebem a cor do tema escolhido.
 */
function aplicarTema(tema: Tema) {
  document.documentElement.setAttribute("data-tema", tema);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute("media") ?? "";
    const cor =
      tema === "sistema" && media ? COR_BARRA[media.includes("light") ? "claro" : "escuro"] : COR_BARRA[resolver(tema)];
    meta.setAttribute("content", cor);
  });
}

function assinar(aoMudar: () => void): () => void {
  const aoMudarArmazenamento = (e: StorageEvent) => {
    if (e.key === CHAVE_TEMA || e.key === null) aoMudar();
  };
  const consulta = window.matchMedia(CONSULTA_CLARO);
  window.addEventListener(EVENTO_TEMA, aoMudar);
  window.addEventListener("storage", aoMudarArmazenamento);
  consulta.addEventListener("change", aoMudar);
  return () => {
    window.removeEventListener(EVENTO_TEMA, aoMudar);
    window.removeEventListener("storage", aoMudarArmazenamento);
    consulta.removeEventListener("change", aoMudar);
  };
}

/**
 * Troca tudo de uma vez: sem isso, botões e chips com `transition-colors`
 * levariam 150 ms para mudar de cor enquanto o resto já mudou, e a tela passaria
 * por um instante meio clara, meio escura.
 */
function semTransicoes(aplicar: () => void) {
  const estilo = document.createElement("style");
  estilo.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(estilo);
  aplicar();
  void window.getComputedStyle(document.body).color; // aplica as cores novas já sem transição
  window.setTimeout(() => estilo.remove(), 1);
}

/** Grava e aplica a escolha. Todos os `useTema()` abertos (e as outras abas) acompanham. */
export function definirTema(tema: Tema) {
  try {
    window.localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem armazenamento: vale só até recarregar a página.
  }
  semTransicoes(() => aplicarTema(tema));
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

/**
 * Tema escolhido (`tema`), o que está valendo na tela (`temaEfetivo`, já
 * resolvendo "sistema") e a função para trocar. No servidor e na hidratação,
 * vale o padrão; logo depois, a escolha salva.
 */
export function useTema() {
  const tema = useSyncExternalStore(assinar, lerTemaSalvo, () => TEMA_PADRAO);
  const temaEfetivo = useSyncExternalStore(
    assinar,
    () => resolver(lerTemaSalvo()),
    (): TemaEfetivo => (TEMA_PADRAO === "claro" ? "claro" : "escuro"),
  );
  const trocar = useCallback((novo: Tema) => definirTema(novo), []);
  return { tema, temaEfetivo, definirTema: trocar };
}

/**
 * Montado uma vez no layout raiz. Reaplica o tema salvo antes da pintura (no
 * desenvolvimento, o Strict Mode do React remonta o `<html>` e apaga o atributo
 * posto pelo script), acerta a cor da barra e acompanha outras abas e a troca
 * de claro/escuro do aparelho quando a escolha é "Sistema".
 */
export function SincronizadorTema() {
  useLayoutEffect(() => {
    const reaplicar = () => aplicarTema(lerTemaSalvo());
    reaplicar();
    // Troca vinda de outra aba ou do aparelho (em "Sistema"): também de uma vez só.
    return assinar(() => semTransicoes(reaplicar));
  }, []);
  return null;
}
