"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { Tema } from "@/lib/tema";
import { FOCO, juntarClasses } from "./classes";
import { Icone } from "./icone";
import { useTema } from "./tema";

const OPCOES: { tema: Tema; rotulo: string; icone: LucideIcon }[] = [
  { tema: "sistema", rotulo: "Sistema", icone: Monitor },
  { tema: "claro", rotulo: "Claro", icone: Sun },
  { tema: "escuro", rotulo: "Escuro", icone: Moon },
];

/**
 * Escolha de tema para o fim de um `Menu` (DESIGN.md §8.1): três opções lado a
 * lado, a atual em azul, como um `Chip` ligado. São `menuitemradio`: escolher
 * não fecha o menu, e a pessoa vê a troca na hora e pode voltar atrás.
 */
export function SeletorTema() {
  const { tema, definirTema } = useTema();

  return (
    <div role="group" aria-labelledby="seletor-tema-titulo" className="border-t border-borda px-3 pt-2 pb-3">
      <p id="seletor-tema-titulo" className="pb-2 text-meta text-texto-3">
        Aparência
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {OPCOES.map(({ tema: opcao, rotulo, icone }) => {
          const atual = tema === opcao;
          return (
            <button
              key={opcao}
              type="button"
              role="menuitemradio"
              aria-checked={atual}
              onClick={() => definirTema(opcao)}
              className={juntarClasses(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-controle border px-1 text-meta transition-colors",
                FOCO,
                atual
                  ? "border-primaria bg-primaria/15 text-primaria-clara"
                  : "border-borda text-texto-2 hover:bg-superficie-2 hover:text-texto",
              )}
            >
              <Icone de={icone} tamanho={16} />
              {rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
