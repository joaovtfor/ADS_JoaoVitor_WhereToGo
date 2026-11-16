"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Botao, BotaoIcone } from "./botao";
import { FOCO, juntarClasses } from "./classes";
import { Icone } from "./icone";

/** Classes de um item de menu. Use em `<button role="menuitem">` ou `<Link role="menuitem">`. */
export const CLASSES_ITEM_MENU = juntarClasses(
  "flex min-h-11 w-full items-center gap-3 px-3 text-left text-corpo text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto",
  FOCO,
);

interface PropriedadesItemMenu {
  icone: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}

export function ItemMenu({ icone, onClick, children }: PropriedadesItemMenu) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={CLASSES_ITEM_MENU}>
      <Icone de={icone} />
      {children}
    </button>
  );
}

interface PropriedadesMenu {
  /** Nome do botão que abre o menu (leitores de tela e dica). */
  rotulo: string;
  icone: LucideIcon;
  /** Texto ao lado do ícone. Sem ele, o botão é só o ícone. */
  texto?: ReactNode;
  /** Itens: `ItemMenu` ou qualquer elemento com `role="menuitem"`. */
  children: ReactNode;
}

/**
 * Menu suspenso para ações de uso ocasional (DESIGN.md §1.6). Fecha ao
 * escolher um item, ao clicar fora e com Esc.
 */
export function Menu({ rotulo, icone, texto, children }: PropriedadesMenu) {
  const [aberto, setAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("pointerdown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const alternar = () => setAberto((v) => !v);

  return (
    <div ref={menuRef} className="relative">
      {texto ? (
        <Botao variante="fantasma" icone={icone} aria-label={rotulo} aria-haspopup="menu" aria-expanded={aberto} onClick={alternar}>
          {texto}
        </Botao>
      ) : (
        <BotaoIcone icone={icone} rotulo={rotulo} aria-haspopup="menu" aria-expanded={aberto} onClick={alternar} />
      )}
      {aberto && (
        <div
          role="menu"
          aria-label={rotulo}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) setAberto(false);
          }}
          className="absolute top-full right-0 z-50 mt-1 w-64 overflow-hidden rounded-painel border border-borda-forte bg-superficie py-1"
        >
          {children}
        </div>
      )}
    </div>
  );
}
