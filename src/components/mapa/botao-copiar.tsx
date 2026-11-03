"use client";

import { useEffect, useState } from "react";

interface PropriedadesBotaoCopiar {
  texto: string;
  rotulo: string;
  rotuloCopiado: string;
  className?: string;
}

/** Copia para a área de transferência com confirmação visual por 3 s. */
export function BotaoCopiar({ texto, rotulo, rotuloCopiado, className = "" }: PropriedadesBotaoCopiar) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const temporizador = window.setTimeout(() => setCopiado(false), 3000);
    return () => window.clearTimeout(temporizador);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setFalhou(false);
      setCopiado(true);
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável na tela.
      setFalhou(true);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copiar()}
      className={`min-h-12 w-full rounded-xl border px-3 text-sm font-bold transition ${className}`}
    >
      {copiado ? rotuloCopiado : falhou ? "Não foi possível copiar: selecione o texto acima" : rotulo}
    </button>
  );
}
