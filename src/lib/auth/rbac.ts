import { erros } from "../http";

export const PAPEIS = ["ADMIN", "COORDENADOR", "VOLUNTARIO"] as const;
export type Papel = (typeof PAPEIS)[number];

/** Usuário autenticado, revalidado no banco a cada requisição. */
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  /** Nulo apenas para ADMIN. */
  idAbrigo: number | null;
}

/** Usuário autenticado + metadados da requisição (para auditoria). */
export interface Contexto {
  usuario: UsuarioSessao;
  ip: string | null;
}

const TODOS = PAPEIS;

/**
 * Matriz de permissões (RBAC - RNF05). Além do papel, ações sobre dados de um
 * abrigo exigem que COORDENADOR/VOLUNTARIO pertençam a esse abrigo
 * (ver `exigirPermissao(..., idAbrigo)`); o ADMIN tem visão global.
 */
export const PERMISSOES = {
  // Abrigos (RF10 / RF04)
  "abrigo:ver": TODOS,
  "abrigo:criar": ["ADMIN"],
  "abrigo:editar-cadastro": ["ADMIN"], // nome, endereço, localização, PIX, ativo
  "abrigo:editar-operacao": ["ADMIN", "COORDENADOR"], // telefone, capacidade
  "abrigo:dashboard": ["ADMIN", "COORDENADOR"],

  // Estoque (RF02 / RF03)
  "estoque:ver": TODOS,
  "estoque:movimentar": TODOS,
  "estoque:ajustar": ["ADMIN", "COORDENADOR"], // AJUSTE de inventário físico
  "estoque:transferir": ["ADMIN", "COORDENADOR"],
  "estoque:classificar": ["ADMIN", "COORDENADOR"], // status URGENTE/NORMAL/BLOQUEADO e estoque mínimo
  "estoque:historico": ["ADMIN", "COORDENADOR"],

  // Infraestrutura (RF05)
  "ocorrencia:ver": TODOS,
  "ocorrencia:gerenciar": ["ADMIN", "COORDENADOR"],

  // Abrigados (RF12)
  "abrigado:ver": TODOS,
  "abrigado:registrar": TODOS,
  "abrigado:editar": ["ADMIN", "COORDENADOR"],
  "abrigado:desligar": ["ADMIN", "COORDENADOR"],
  "abrigado:transferir": ["ADMIN", "COORDENADOR"],

  // Catálogo (RF02)
  "catalogo:ver": TODOS,
  "catalogo:gerenciar": ["ADMIN"],

  // Usuários (RF11) - COORDENADOR gerencia apenas VOLUNTARIOs do próprio abrigo
  "usuario:ver": ["ADMIN", "COORDENADOR"],
  "usuario:gerenciar": ["ADMIN", "COORDENADOR"],

  // Auditoria (RF13)
  "auditoria:ver": ["ADMIN", "COORDENADOR"],
} as const satisfies Record<string, readonly Papel[]>;

export type Permissao = keyof typeof PERMISSOES;

export function pode(usuario: Pick<UsuarioSessao, "papel">, permissao: Permissao): boolean {
  return (PERMISSOES[permissao] as readonly Papel[]).includes(usuario.papel);
}

export function podeAcessarAbrigo(usuario: Pick<UsuarioSessao, "papel" | "idAbrigo">, idAbrigo: number): boolean {
  return usuario.papel === "ADMIN" || usuario.idAbrigo === idAbrigo;
}

/**
 * Lança 403 se o usuário não tiver a permissão. Com `idAbrigo`, exige também
 * que o recurso pertença ao abrigo do usuário (exceto ADMIN).
 */
export function exigirPermissao(usuario: UsuarioSessao, permissao: Permissao, idAbrigo?: number): void {
  if (!pode(usuario, permissao)) throw erros.semPermissao();
  if (idAbrigo !== undefined && !podeAcessarAbrigo(usuario, idAbrigo)) {
    throw erros.semPermissao("Você só pode acessar dados do seu próprio abrigo.");
  }
}

/** Tela inicial de cada perfil após o login (HU01). */
export const ROTA_INICIAL_POR_PAPEL: Record<Papel, string> = {
  VOLUNTARIO: "/admin/inventario",
  COORDENADOR: "/admin/dashboard",
  ADMIN: "/admin/geral",
};
