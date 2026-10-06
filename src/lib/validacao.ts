import { z } from "zod";

// Mensagens de validação em português para toda a aplicação.
z.config(z.locales.ptBR());

export { z };

/** Id numérico positivo (parâmetros de rota e de query). */
export const esquemaId = z.coerce.number().int().positive().max(2_147_483_647);

/** Parâmetro de rota `[id]`. */
export const parametrosId = z.object({ id: esquemaId });

/** Texto obrigatório, sem espaços nas pontas. */
export const textoObrigatorio = (max: number) => z.string().trim().min(1, "Campo obrigatório.").max(max);

/** Texto opcional: string vazia vira `null`. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

/** Booleano vindo de query string ("true"/"false"). */
export const booleanoQuery = z.enum(["true", "false"]).transform((v) => v === "true");

/** Data ("2026-10-06") ou data/hora ISO com fuso ("2026-10-06T12:00:00-03:00") em filtros. */
export const dataHoraQuery = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

/** Paginação padrão das listagens: ?pagina=1&tamanho=50 (máx. 200). */
export const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce.number().int().min(1).max(200).default(50),
});

export type Paginacao = z.infer<typeof esquemaPaginacao>;

export interface Pagina<T> {
  itens: T[];
  paginacao: Paginacao & { total: number; totalPaginas: number };
}

export function montarPagina<T>(itens: T[], total: number, paginacao: Paginacao): Pagina<T> {
  return {
    itens,
    paginacao: { ...paginacao, total, totalPaginas: Math.max(1, Math.ceil(total / paginacao.tamanho)) },
  };
}

export function offset(paginacao: Paginacao): number {
  return (paginacao.pagina - 1) * paginacao.tamanho;
}
