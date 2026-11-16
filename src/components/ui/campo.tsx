import type { ReactNode } from "react";
import { juntarClasses } from "./classes";

/**
 * Classes de `<input>`, `<select>` e `<textarea>`. No celular o texto fica em
 * 16 px para o iOS não dar zoom ao focar (DESIGN.md §5).
 */
export const CLASSES_CAMPO =
  "w-full min-h-11 rounded-controle border border-borda-forte bg-superficie-2 px-3 text-base text-texto placeholder:text-texto-3 transition-colors focus:border-primaria-clara focus:outline-none disabled:opacity-50 sm:text-corpo";

interface PropriedadesCampo {
  rotulo: string;
  /** Texto de apoio abaixo do campo. Some quando há erro. */
  dica?: string;
  erro?: string | null;
  className?: string;
  /** O controle em si, com `CLASSES_CAMPO`. */
  children: ReactNode;
}

/** Rótulo + controle + dica ou erro. O `<label>` envolve o controle, então não precisa de `id`. */
export function Campo({ rotulo, dica, erro, className, children }: PropriedadesCampo) {
  return (
    <label className={juntarClasses("flex flex-col gap-1.5", className)}>
      <span className="text-meta font-medium text-texto-2">{rotulo}</span>
      {children}
      {erro ? (
        <span role="alert" className="text-meta text-critico-claro">
          {erro}
        </span>
      ) : (
        dica && <span className="text-meta text-texto-3">{dica}</span>
      )}
    </label>
  );
}
