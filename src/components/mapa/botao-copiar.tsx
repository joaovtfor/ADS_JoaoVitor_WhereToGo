"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Botao } from "@/components/ui/botao";

interface PropriedadesBotaoCopiar {
  texto: string;
  rotulo: string;
  rotuloCopiado: string;
  /** Só para layout (largura, margem). */
  className?: string;
}

/** Copia para a área de transferência com confirmação visual por 3 s. */
export function BotaoCopiar({ texto, rotulo, rotuloCopiado, className }: PropriedadesBotaoCopiar) {
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
    <Botao tamanho="sm" icone={copiado ? Check : Copy} onClick={() => void copiar()} className={className}>
      {copiado ? rotuloCopiado : falhou ? "Não deu para copiar: selecione o texto" : rotulo}
    </Botao>
  );
}
