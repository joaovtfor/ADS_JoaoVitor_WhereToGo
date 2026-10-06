import { consultarUm } from "../db";
import type { Papel, UsuarioSessao } from "./rbac";

/** Dados do usuário necessários para decidir se ele pode acessar o painel. */
export interface UsuarioAcesso extends UsuarioSessao {
  ativo: boolean;
  abrigoAtivo: boolean | null;
  senhaHash: string;
}

const SELECT_USUARIO_ACESSO = `
  SELECT u.id, u.nome, u.email, u.ativo, u.senha_hash AS "senhaHash",
         u.id_abrigo AS "idAbrigo", p.nome AS papel, a.ativo AS "abrigoAtivo"
    FROM usuario u
    JOIN papel_usuario p ON p.id = u.id_papel
    LEFT JOIN abrigo a ON a.id = u.id_abrigo`;

export function buscarUsuarioAcessoPorId(id: number): Promise<UsuarioAcesso | null> {
  return consultarUm<UsuarioAcesso>(`${SELECT_USUARIO_ACESSO} WHERE u.id = $1`, [id]);
}

export function buscarUsuarioAcessoPorEmail(email: string): Promise<UsuarioAcesso | null> {
  return consultarUm<UsuarioAcesso>(`${SELECT_USUARIO_ACESSO} WHERE u.email = $1`, [email.trim().toLowerCase()]);
}

export type MotivoBloqueio = "USUARIO_INATIVO" | "SEM_VINCULO_ABRIGO" | "ABRIGO_INATIVO";

/**
 * HU01 - RN3: acesso negado para usuário inativo ou desvinculado de um abrigo
 * (exceto ADMIN, que não pertence a abrigo).
 */
export function motivoBloqueio(usuario: Pick<UsuarioAcesso, "ativo" | "papel" | "idAbrigo" | "abrigoAtivo">): MotivoBloqueio | null {
  if (!usuario.ativo) return "USUARIO_INATIVO";
  if ((usuario.papel as Papel) === "ADMIN") return null;
  if (usuario.idAbrigo === null) return "SEM_VINCULO_ABRIGO";
  if (!usuario.abrigoAtivo) return "ABRIGO_INATIVO";
  return null;
}

export function paraSessao(usuario: UsuarioAcesso): UsuarioSessao {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    idAbrigo: usuario.idAbrigo,
  };
}
