"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Botao, BotaoIcone } from "./botao";

interface PropriedadesModal {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}

/** Janela sobre a tela para uma tarefa curta (trocar senha, confirmar). Fecha com Esc, no X ou clicando fora. */
export function Modal({ titulo, onFechar, children }: PropriedadesModal) {
  const idTitulo = useId();

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="w-full max-w-md rounded-t-painel border border-borda bg-superficie p-5 sm:rounded-painel"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={idTitulo} className="text-titulo font-semibold text-texto">
            {titulo}
          </h2>
          <BotaoIcone icone={X} rotulo="Fechar" tamanho="sm" onClick={onFechar} className="-mr-2" />
        </div>
        {children}
      </div>
    </div>
  );
}

interface PropriedadesModalConfirmacao {
  titulo: string;
  /** O que acontece ao confirmar, em uma frase. */
  children: ReactNode;
  rotuloConfirmar: string;
  salvando: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}

/** Confirmação obrigatória para ações que encerram ou desativam algo (DESIGN.md §5.5). */
export function ModalConfirmacao({ titulo, children, rotuloConfirmar, salvando, onConfirmar, onFechar }: PropriedadesModalConfirmacao) {
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <div className="space-y-4">
        <p className="text-corpo text-texto-2">{children}</p>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="perigo" disabled={salvando} onClick={onConfirmar}>
            {salvando ? "Aguarde..." : rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
