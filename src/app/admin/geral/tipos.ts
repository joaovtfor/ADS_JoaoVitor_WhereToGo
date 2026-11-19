// Tipos da tela de Gestão (abrigos, equipe, catálogo e auditoria).

import type { PapelUsuario } from "../contexto-admin";

export interface Paginacao {
  pagina: number;
  tamanho: number;
  total: number;
  totalPaginas: number;
}

export interface UsuarioLista {
  id: number;
  nome: string;
  email: string;
  papel: PapelUsuario;
  idAbrigo: number | null;
  abrigo: string | null;
  ativo: boolean;
  possuiGoogle?: boolean;
  /** Auto-cadastro via Google nunca aprovado. Inativo e não pendente = desativado pela gestão. */
  pendenteAprovacao: boolean;
  criadoEm: string;
}

export interface PaginaUsuarios {
  itens: UsuarioLista[];
  paginacao: Paginacao;
}

export interface CategoriaCatalogo {
  id: number;
  nome: string;
  slug: string;
  itensAtivos: number;
  totalItens: number;
}

export interface ItemCatalogo {
  id: number;
  nome: string;
  unidadeMedida: string;
  ativo: boolean;
  idCategoria: number;
  categoria: string;
  categoriaSlug: string;
}

export interface LogAuditoria {
  id: number;
  dataHora: string;
  acao: string;
  descricao: string;
  detalhes: Record<string, unknown> | null;
  enderecoIp: string | null;
  usuario: { id: number; nome: string } | null;
  abrigo: { id: number; nome: string } | null;
}

export interface PaginaAuditoria {
  itens: LogAuditoria[];
  paginacao: Paginacao;
}

export type AbaGestao = "abrigos" | "usuarios" | "catalogo" | "auditoria" | "relatorios";

export const TAMANHO_PAGINA_USUARIOS = 50;
