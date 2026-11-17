"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { BotaoIcone } from "./botao";
import { juntarClasses } from "./classes";

/**
 * Toast: retorno curto de uma ação (DESIGN.md §5.5). Entra com fade e um leve
 * deslize, fica alguns segundos em tela e sai com fade. As animações ficam em
 * `globals.css` (`.wtg-toast`) e usam só `opacity` e `transform`.
 *
 * Três formas de uso:
 * - `ProvedorToast` + `useToast()` + `RegiaoToasts`: qualquer componente dentro
 *   do provedor chama `mostrar("Salvo")`; a região decide onde a pilha aparece.
 * - `useFilaToasts()` + `PilhaToasts`: a mesma fila, para quem monta a própria tela.
 * - `ToastFlutuante`: versão controlada (`erro` / `aviso`) usada pelo painel.
 */

export type TipoToast = "sucesso" | "info" | "aviso" | "erro";

/** A bolinha segue a regra de cores: verde/âmbar/vermelho = estado, azul = seleção. */
const COR_PONTO: Record<TipoToast, string> = {
  sucesso: "bg-ok",
  info: "bg-primaria-clara",
  aviso: "bg-atencao",
  erro: "bg-critico",
};

/** Tempo em tela de cada tipo, em ms. `null`: fica até a pessoa fechar. */
const DURACAO_PADRAO: Record<TipoToast, number | null> = {
  sucesso: 3500,
  info: 4500,
  aviso: 6000,
  erro: null,
};

/** Duração da animação de saída em `globals.css`, com folga. */
const SAIDA_MS = 250;
const LIMITE_EM_TELA = 3;

export interface OpcoesToast {
  tipo?: TipoToast;
  /** Tempo em tela, em ms. `null` mantém o toast até ser fechado. */
  duracaoMs?: number | null;
  /** Toasts com o mesmo `id` se substituem em vez de empilhar (ex.: "selecao"). */
  id?: string;
}

export interface Toast {
  id: string;
  texto: string;
  tipo: TipoToast;
  duracaoMs: number | null;
  /** Muda a cada `mostrar` com o mesmo id: reinicia o tempo em tela. */
  versao: number;
  /** Em animação de saída; sai da lista ao terminar. */
  saindo: boolean;
}

export interface AcoesToast {
  /** Mostra um toast e devolve o id dele. */
  mostrar: (texto: string, opcoes?: OpcoesToast) => string;
  /** Começa a saída do toast (com animação). */
  fechar: (id: string) => void;
}

/** Fila de toasts em tela. */
export function useFilaToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const contadorRef = useRef(0);

  const mostrar = useCallback((texto: string, opcoes: OpcoesToast = {}) => {
    const tipo = opcoes.tipo ?? "sucesso";
    const id = opcoes.id ?? `toast-${++contadorRef.current}`;
    const duracaoMs = opcoes.duracaoMs === undefined ? DURACAO_PADRAO[tipo] : opcoes.duracaoMs;

    setToasts((atual) => {
      const existente = atual.find((t) => t.id === id);
      const novo: Toast = { id, texto, tipo, duracaoMs, versao: (existente?.versao ?? 0) + 1, saindo: false };
      if (existente) return atual.map((t) => (t.id === id ? novo : t));
      return [...atual, novo].slice(-LIMITE_EM_TELA);
    });
    return id;
  }, []);

  const fechar = useCallback((id: string) => {
    setToasts((atual) => (atual.some((t) => t.id === id && !t.saindo) ? atual.map((t) => (t.id === id ? { ...t, saindo: true } : t)) : atual));
  }, []);

  /** Tira da lista ao fim da saída. Se o toast voltou a ser mostrado no meio dela, fica. */
  const remover = useCallback((id: string) => {
    setToasts((atual) => atual.filter((t) => !(t.id === id && t.saindo)));
  }, []);

  return { toasts, mostrar, fechar, remover };
}

interface PropriedadesItemToast {
  toast: Toast;
  onFechar: (id: string) => void;
  onRemover: (id: string) => void;
}

function ItemToast({ toast, onFechar, onRemover }: PropriedadesItemToast) {
  // Com o ponteiro ou o foco em cima, o tempo para: dá para ler sem pressa.
  const [pausado, setPausado] = useState(false);
  const { id, versao, saindo, duracaoMs } = toast;

  useEffect(() => {
    if (saindo || pausado || duracaoMs === null) return;
    const temporizador = window.setTimeout(() => onFechar(id), duracaoMs);
    return () => window.clearTimeout(temporizador);
  }, [id, versao, saindo, pausado, duracaoMs, onFechar]);

  // Garantia: aba em segundo plano pode não disparar o fim da animação.
  useEffect(() => {
    if (!saindo) return;
    const temporizador = window.setTimeout(() => onRemover(id), SAIDA_MS + 100);
    return () => window.clearTimeout(temporizador);
  }, [id, saindo, onRemover]);

  return (
    <div
      role={toast.tipo === "erro" ? "alert" : undefined}
      data-saindo={saindo || undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "wtg-toast-saida") onRemover(id);
      }}
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className="wtg-toast pointer-events-auto flex max-w-full items-start gap-2.5 rounded-controle border border-borda-forte bg-superficie py-1 pr-1 pl-3"
    >
      <span aria-hidden className={juntarClasses("mt-[13px] size-2 shrink-0 rounded-full", COR_PONTO[toast.tipo])} />
      <p className="min-w-0 flex-1 py-1.5 text-corpo text-texto">{toast.texto}</p>
      <BotaoIcone icone={X} rotulo="Fechar aviso" tamanho="sm" onClick={() => onFechar(id)} />
    </div>
  );
}

interface PropriedadesPilhaToasts {
  toasts: Toast[];
  onFechar: (id: string) => void;
  onRemover: (id: string) => void;
  /** De onde os toasts deslizam: do alto (`topo`) ou de baixo (`base`). */
  origem?: "topo" | "base";
  /** Posição da pilha na tela (layout). */
  className?: string;
}

/**
 * A pilha em si. Fica sempre no DOM, mesmo vazia: leitores de tela só anunciam
 * o que entra em uma região `aria-live` que já existia.
 */
export function PilhaToasts({ toasts, onFechar, onRemover, origem = "base", className }: PropriedadesPilhaToasts) {
  return (
    <div
      aria-live="polite"
      className={juntarClasses("pointer-events-none flex flex-col gap-2", origem === "topo" && "wtg-toasts--topo", className)}
    >
      {toasts.map((toast) => (
        <ItemToast key={toast.id} toast={toast} onFechar={onFechar} onRemover={onRemover} />
      ))}
    </div>
  );
}

// Dois contextos: quem só dispara toasts não renderiza de novo quando a pilha muda.
const ContextoAcoesToast = createContext<AcoesToast | null>(null);
const ContextoFilaToast = createContext<ReturnType<typeof useFilaToasts> | null>(null);

/** Disponibiliza `useToast()` para a árvore abaixo. A pilha aparece onde estiver `RegiaoToasts`. */
export function ProvedorToast({ children }: { children: ReactNode }) {
  const fila = useFilaToasts();
  const { mostrar, fechar } = fila;
  const acoes = useMemo<AcoesToast>(() => ({ mostrar, fechar }), [mostrar, fechar]);

  return (
    <ContextoAcoesToast.Provider value={acoes}>
      <ContextoFilaToast.Provider value={fila}>{children}</ContextoFilaToast.Provider>
    </ContextoAcoesToast.Provider>
  );
}

/** `mostrar("Item salvo")`, `mostrar("Falhou", { tipo: "erro" })`. Precisa de um `ProvedorToast` acima. */
export function useToast(): AcoesToast {
  const acoes = useContext(ContextoAcoesToast);
  if (!acoes) throw new Error("useToast() precisa estar dentro de <ProvedorToast>.");
  return acoes;
}

/** Onde a pilha do `ProvedorToast` aparece. */
export function RegiaoToasts({ origem, className }: Pick<PropriedadesPilhaToasts, "origem" | "className">) {
  const fila = useContext(ContextoFilaToast);
  if (!fila) throw new Error("<RegiaoToasts> precisa estar dentro de <ProvedorToast>.");
  return <PilhaToasts toasts={fila.toasts} onFechar={fila.fechar} onRemover={fila.remover} origem={origem} className={className} />;
}

interface PropriedadesToastFlutuante {
  erro: string | null;
  aviso: string | null;
  aoFecharErro: () => void;
  aoFecharAviso: () => void;
}

/**
 * Versão controlada, no canto inferior da tela, para as telas do painel: o
 * aviso de sucesso sai sozinho em 3,5 s; o erro fica até ser fechado. Quando o
 * toast termina de sair, avisa a tela para limpar o próprio estado.
 */
export function ToastFlutuante({ erro, aviso, aoFecharErro, aoFecharAviso }: PropriedadesToastFlutuante) {
  const { toasts, mostrar, fechar, remover } = useFilaToasts();

  useEffect(() => {
    if (aviso) mostrar(aviso, { id: "aviso", tipo: "sucesso" });
    else fechar("aviso");
  }, [aviso, mostrar, fechar]);

  useEffect(() => {
    if (erro) mostrar(erro, { id: "erro", tipo: "erro" });
    else fechar("erro");
  }, [erro, mostrar, fechar]);

  const aoRemover = useCallback(
    (id: string) => {
      remover(id);
      if (id === "aviso") aoFecharAviso();
      if (id === "erro") aoFecharErro();
    },
    [remover, aoFecharAviso, aoFecharErro],
  );

  return (
    <PilhaToasts
      toasts={toasts}
      onFechar={fechar}
      onRemover={aoRemover}
      className="fixed right-4 bottom-20 left-4 z-50 sm:left-auto sm:w-full sm:max-w-sm lg:bottom-6"
    />
  );
}
