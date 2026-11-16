/** Junta classes condicionais, ignorando valores vazios. */
export function juntarClasses(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(" ");
}

/** Anel de foco de teclado único do sistema (DESIGN.md §2.1: azul = ação, seleção e foco). */
export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria-clara";
