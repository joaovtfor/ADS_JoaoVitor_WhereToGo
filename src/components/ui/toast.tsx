"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { BotaoIcone } from "./botao";

interface PropriedadesToast {
  erro: string | null;
  aviso: string | null;
  aoFecharErro: () => void;
  aoFecharAviso: () => void;
}

/**
 * Retorno de uma ação, flutuando no canto da tela para não empurrar o conteúdo
 * (DESIGN.md §5.5). A confirmação some sozinha em 3,5 s; o erro fica até ser fechado.
 */
export function ToastFlutuante({ erro, aviso, aoFecharErro, aoFecharAviso }: PropriedadesToast) {
  useEffect(() => {
    if (!aviso) return;
    const temporizador = window.setTimeout(aoFecharAviso, 3500);
    return () => window.clearTimeout(temporizador);
  }, [aviso, aoFecharAviso]);

  if (!erro && !aviso) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-20 left-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm lg:bottom-6"
    >
      {erro && (
        <div role="alert" className="pointer-events-auto flex items-start gap-2.5 rounded-controle border border-borda-forte bg-superficie py-2 pr-1 pl-3">
          <span aria-hidden className="mt-2.5 size-2 shrink-0 rounded-full bg-critico" />
          <p className="min-w-0 flex-1 py-1.5 text-corpo text-texto">{erro}</p>
          <BotaoIcone icone={X} rotulo="Fechar erro" tamanho="sm" onClick={aoFecharErro} />
        </div>
      )}
      {aviso && (
        <div role="status" className="pointer-events-auto flex items-start gap-2.5 rounded-controle border border-borda-forte bg-superficie py-2 pr-1 pl-3">
          <span aria-hidden className="mt-2.5 size-2 shrink-0 rounded-full bg-ok" />
          <p className="min-w-0 flex-1 py-1.5 text-corpo text-texto">{aviso}</p>
          <BotaoIcone icone={X} rotulo="Fechar aviso" tamanho="sm" onClick={aoFecharAviso} />
        </div>
      )}
    </div>
  );
}
