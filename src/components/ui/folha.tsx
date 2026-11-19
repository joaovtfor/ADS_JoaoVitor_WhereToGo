"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { ChevronLeft, X } from "lucide-react";
import { BotaoIcone } from "./botao";
import { juntarClasses } from "./classes";

export type NivelFolha = "compacto" | "medio" | "expandido";

const ALTURA: Record<NivelFolha, string> = {
  compacto: "h-[34%]",
  medio: "h-[62%]",
  expandido: "h-full max-sm:rounded-none max-sm:border-t-0",
};

/**
 * Lugar da folha no desktop: um painel só, à esquerda, com 400 px. Embaixo
 * sobra espaço para a barra de resumo do mapa, que tem a mesma largura.
 */
const LATERAL = "sm:top-3 sm:bottom-20 sm:left-3 sm:right-auto sm:w-[400px]";

const TRANSICAO = "transform 200ms ease-out";

function ehCelular(): boolean {
  return !window.matchMedia("(min-width: 640px)").matches;
}

function semAnimacao(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Para onde a folha vai ao soltar o dedo, conforme o quanto foi arrastada. */
function decidirDestino(nivel: NivelFolha, dy: number): NivelFolha | "fechar" {
  if (dy < -35) return dy < -120 || nivel === "medio" ? "expandido" : "medio";
  if (dy > 35) {
    if (nivel === "expandido") return dy > 160 ? "compacto" : "medio";
    if (nivel === "medio") return dy > 150 ? "fechar" : "compacto";
    return "fechar";
  }
  return nivel;
}

/**
 * Lugar da folha numa pilha de telas (ex.: lista e, por cima, a ficha de um
 * abrigo). Quem monta a pilha passa isto adiante sem olhar o conteúdo.
 */
export interface NavegacaoFolha {
  /**
   * Há outra tela por cima: a folha continua montada (guarda rolagem, campos e
   * resultados para quando a pessoa voltar), mas fica invisível e inerte.
   */
  oculta?: boolean;
  /** Botão de voltar à tela de baixo, à esquerda do título. */
  voltar?: { rotulo: string; onVoltar: () => void };
}

interface PropriedadesFolha extends NavegacaoFolha {
  /** Nome do painel para leitores de tela. */
  rotulo: string;
  /** Conteúdo do cabeçalho (título e resumo). No celular é a área de arraste. */
  titulo: ReactNode;
  rotuloFechar: string;
  onFechar: () => void;
  nivelInicial?: NivelFolha;
  /** Faixa fixa no fim do painel (ações, navegação). */
  rodape?: ReactNode;
  children: ReactNode;
}

/**
 * Painel deslizante: folha inferior arrastável no celular e painel lateral à
 * esquerda a partir de `sm`. O arraste move a folha só com `transform`, direto
 * no elemento, sem passar pelo estado do React: o conteúdo não é renderizado de
 * novo a cada quadro e a altura só muda uma vez, ao soltar (DESIGN.md §6).
 */
export function Folha({ rotulo, titulo, rotuloFechar, onFechar, nivelInicial = "medio", rodape, oculta = false, voltar, children }: PropriedadesFolha) {
  const [nivel, setNivel] = useState<NivelFolha>(nivelInicial);
  const folhaRef = useRef<HTMLElement | null>(null);
  const arrasteRef = useRef<{ inicioY: number; dy: number; quadro: number } | null>(null);
  const moveuRef = useRef(false);
  /** Posição do topo da folha logo antes de trocar de nível, para animar a partir dela. */
  const topoAnteriorRef = useRef<number | null>(null);

  function voltarAoLugar() {
    const folha = folhaRef.current;
    if (!folha) return;
    folha.style.transition = semAnimacao() ? "none" : TRANSICAO;
    folha.style.transform = "";
  }

  function mudarNivel(proximo: NivelFolha) {
    if (proximo === nivel) return voltarAoLugar();
    topoAnteriorRef.current = folhaRef.current?.getBoundingClientRect().top ?? null;
    setNivel(proximo);
  }

  // Depois que a nova altura entra, parte de onde a folha estava e desliza até o lugar.
  useLayoutEffect(() => {
    const folha = folhaRef.current;
    const topoAnterior = topoAnteriorRef.current;
    topoAnteriorRef.current = null;
    if (!folha || topoAnterior === null) return;

    folha.style.transition = "none";
    folha.style.transform = "";
    const diferenca = topoAnterior - folha.getBoundingClientRect().top;
    if (diferenca === 0 || semAnimacao()) return;

    folha.style.transform = `translateY(${diferenca}px)`;
    folha.getBoundingClientRect(); // obriga o navegador a registrar o ponto de partida
    folha.style.transition = TRANSICAO;
    folha.style.transform = "";
  }, [nivel]);

  // Ao virar a tela da vez (abriu, ou a de cima saiu), recebe o foco se ele se
  // perdeu: o botão tocado sumiu junto com a tela anterior ou ficou inerte.
  // Quem estava num chip ou na busca continua onde estava.
  useEffect(() => {
    if (oculta) return;
    const ativo = document.activeElement;
    if (!ativo || ativo === document.body || ativo.closest("[inert]")) folhaRef.current?.focus({ preventScroll: true });
  }, [oculta]);

  function iniciarArraste(e: TouchEvent<HTMLElement>) {
    if (e.touches.length !== 1 || !ehCelular()) return;
    arrasteRef.current = { inicioY: e.touches[0].clientY, dy: 0, quadro: 0 };
    moveuRef.current = false;
    if (folhaRef.current) folhaRef.current.style.transition = "none";
  }

  function moverArraste(e: TouchEvent<HTMLElement>) {
    const arraste = arrasteRef.current;
    const folha = folhaRef.current;
    if (!arraste || !folha || e.touches.length !== 1) return;

    // Não sobe além do topo da área do mapa.
    arraste.dy = Math.max(-folha.offsetTop, e.touches[0].clientY - arraste.inicioY);
    if (Math.abs(arraste.dy) > 6) moveuRef.current = true;
    if (arraste.quadro) return;
    arraste.quadro = requestAnimationFrame(() => {
      arraste.quadro = 0;
      folha.style.transform = `translateY(${arraste.dy}px)`;
    });
  }

  function finalizarArraste() {
    const arraste = arrasteRef.current;
    arrasteRef.current = null;
    if (!arraste) return;
    if (arraste.quadro) cancelAnimationFrame(arraste.quadro);

    const destino = decidirDestino(nivel, arraste.dy);
    if (destino === "fechar") onFechar();
    else mudarNivel(destino);
  }

  function alternarExpansao() {
    if (moveuRef.current) return; // foi um arraste, não um toque
    mudarNivel(nivel === "expandido" ? "medio" : "expandido");
  }

  function aoTeclarNaAlca(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    mudarNivel(nivel === "expandido" ? "medio" : "expandido");
  }

  return (
    <aside
      ref={folhaRef}
      role="dialog"
      aria-label={rotulo}
      tabIndex={-1}
      inert={oculta}
      className={juntarClasses(
        "absolute inset-x-0 bottom-0 z-[450] flex flex-col rounded-t-painel border-t border-borda bg-superficie outline-none",
        // Ao puxar para cima, esta extensão cobre o vão que abriria embaixo da folha.
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[60vh] after:bg-superficie after:content-['']",
        "sm:h-auto sm:rounded-painel sm:border sm:after:hidden",
        ALTURA[nivel],
        LATERAL,
        oculta ? "pointer-events-none invisible" : "pointer-events-auto",
      )}
    >
      <div
        onTouchStart={iniciarArraste}
        onTouchMove={moverArraste}
        onTouchEnd={finalizarArraste}
        onTouchCancel={finalizarArraste}
        className="shrink-0 touch-none border-b border-borda px-4 pb-3 select-none sm:pt-3"
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={nivel === "expandido" ? "Reduzir painel para ver o mapa" : "Expandir painel para tela cheia"}
          onClick={alternarExpansao}
          onKeyDown={aoTeclarNaAlca}
          className="mx-auto flex h-6 w-20 cursor-grab items-center justify-center sm:hidden"
        >
          <span className="h-1 w-9 rounded-full bg-borda-forte" />
        </div>
        <div className="flex items-start gap-2">
          {voltar && <BotaoIcone icone={ChevronLeft} rotulo={voltar.rotulo} tamanho="sm" onClick={voltar.onVoltar} className="-ml-2" />}
          <div className="min-w-0 flex-1">{titulo}</div>
          <BotaoIcone icone={X} rotulo={rotuloFechar} tamanho="sm" onClick={onFechar} className="-mr-2" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [scrollbar-color:var(--wtg-borda-forte)_transparent] [scrollbar-width:thin]">
        {children}
      </div>

      {rodape && <div className="shrink-0 border-t border-borda px-4 py-2">{rodape}</div>}
    </aside>
  );
}
