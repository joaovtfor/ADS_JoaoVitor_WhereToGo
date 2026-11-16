"use client";

import { useCallback, useState } from "react";
import { mensagemErro } from "@/lib/cliente-api";

/**
 * Estado comum de uma tela do painel que salva coisas: mensagem de erro, aviso
 * de sucesso e "está salvando". `executar` roda a ação e cuida dos três.
 */
export function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /** Devolve `true` se a ação terminou sem erro. */
  const executar = useCallback(async (acao: () => Promise<unknown>, mensagemSucesso?: string): Promise<boolean> => {
    setEnviando(true);
    setErro(null);
    try {
      await acao();
      if (mensagemSucesso) setAviso(mensagemSucesso);
      return true;
    } catch (err) {
      setErro(mensagemErro(err));
      return false;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { erro, aviso, enviando, setErro, setAviso, executar };
}

export type Acao = ReturnType<typeof useAcao>;
