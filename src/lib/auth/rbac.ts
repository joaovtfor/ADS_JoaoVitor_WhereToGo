import { erros } from "../http";
import { ehVisaoGlobal, pode, type Papel, type Permissao } from "./permissoes";

// A matriz de permissões fica em `permissoes.ts` (módulo puro, usado também
// pelas telas). Aqui ficam o contexto da requisição e a checagem que lança 403.
export {
  ehVisaoGlobal,
  PAPEIS,
  papelSemAbrigo,
  pode,
  PERMISSOES,
  ROTA_INICIAL_POR_PAPEL,
  type Papel,
  type Permissao,
} from "./permissoes";

/** Usuário autenticado, revalidado no banco a cada requisição. */
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  /** Nulo apenas para ADMIN e DEFESA_CIVIL (visão global). */
  idAbrigo: number | null;
}

/** Usuário autenticado + metadados da requisição (para auditoria). */
export interface Contexto {
  usuario: UsuarioSessao;
  ip: string | null;
}

export function podeAcessarAbrigo(usuario: Pick<UsuarioSessao, "papel" | "idAbrigo">, idAbrigo: number): boolean {
  return ehVisaoGlobal(usuario) || usuario.idAbrigo === idAbrigo;
}

/**
 * Lança 403 se o usuário não tiver a permissão. Com `idAbrigo`, exige também
 * que o recurso pertença ao abrigo do usuário (exceto ADMIN e DEFESA_CIVIL).
 */
export function exigirPermissao(usuario: UsuarioSessao, permissao: Permissao, idAbrigo?: number): void {
  if (!pode(usuario, permissao)) throw erros.semPermissao();
  if (idAbrigo !== undefined && !podeAcessarAbrigo(usuario, idAbrigo)) {
    throw erros.semPermissao("Você só pode acessar dados do seu próprio abrigo.");
  }
}
