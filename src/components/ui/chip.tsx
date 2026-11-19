import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { FOCO, juntarClasses } from "./classes";
import { Icone } from "./icone";

interface PropriedadesChip extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  ativo: boolean;
  icone?: LucideIcon;
}

/**
 * Filtro liga/desliga. Selecionado é sempre azul, seja qual for o assunto do
 * filtro (vagas, pets, doações): a cor indica "ligado", não a categoria.
 */
export function Chip({ ativo, icone, className, children, type = "button", ...resto }: PropriedadesChip) {
  return (
    <button
      type={type}
      aria-pressed={ativo}
      className={juntarClasses(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-controle border px-3 text-meta font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        FOCO,
        ativo ? "border-primaria bg-primaria-suave text-primaria-clara" : "border-borda bg-superficie text-texto-2 hover:bg-superficie-2 hover:text-texto",
        className,
      )}
      {...resto}
    >
      {icone && <Icone de={icone} tamanho={16} />}
      {children}
    </button>
  );
}
