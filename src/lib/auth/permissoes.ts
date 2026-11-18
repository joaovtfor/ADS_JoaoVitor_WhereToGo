// Papéis e matriz de permissões (RBAC - RNF05).
//
// Módulo puro, sem dependência do servidor: a API usa via `rbac.ts`
// (`exigirPermissao`) e as telas do painel importam daqui para mostrar só os
// botões que o usuário pode usar. A decisão final é sempre a da API.

export const PAPEIS = ["ADMIN", "DEFESA_CIVIL", "COORDENADOR", "VOLUNTARIO"] as const;
export type Papel = (typeof PAPEIS)[number];

const TODOS = PAPEIS;

/**
 * Papéis com visão de todos os abrigos e sem vínculo com um deles.
 * DEFESA_CIVIL é o comando municipal no SCO: enxerga e coordena a rede (alertas
 * regionais, moderação, remanejamento), mas não administra a plataforma.
 */
const VISAO_GLOBAL: readonly Papel[] = ["ADMIN", "DEFESA_CIVIL"];

/**
 * Matriz de permissões. Além do papel, ações sobre dados de um abrigo exigem que
 * COORDENADOR/VOLUNTARIO pertençam a esse abrigo (ver `exigirPermissao(...,
 * idAbrigo)`); ADMIN e DEFESA_CIVIL têm visão global.
 *
 * DEFESA_CIVIL (Etapa 2 do plano de integração): vê tudo, modera e resolve
 * ocorrências de qualquer abrigo, cria ocorrências regionais, remaneja estoque
 * e acolhidos entre abrigos e consulta a auditoria. Não lança estoque nem faz
 * check-in (operação do abrigo), não edita cadastro de abrigo (chave PIX),
 * catálogo nem usuários (administração da plataforma, com o ADMIN).
 */
export const PERMISSOES = {
  // Abrigos (RF10 / RF04)
  "abrigo:ver": TODOS,
  "abrigo:criar": ["ADMIN"],
  "abrigo:editar-cadastro": ["ADMIN"], // nome, endereço, localização, PIX, ativo
  "abrigo:editar-operacao": ["ADMIN", "COORDENADOR"], // telefone, capacidade, fila de triagem
  "abrigo:dashboard": ["ADMIN", "DEFESA_CIVIL", "COORDENADOR"],

  // Estoque (RF02 / RF03)
  "estoque:ver": TODOS,
  "estoque:movimentar": ["ADMIN", "COORDENADOR", "VOLUNTARIO"],
  "estoque:ajustar": ["ADMIN", "COORDENADOR"], // AJUSTE de inventário físico
  "estoque:transferir": ["ADMIN", "DEFESA_CIVIL", "COORDENADOR"],
  "estoque:classificar": ["ADMIN", "COORDENADOR"], // status URGENTE/NORMAL/BLOQUEADO e estoque mínimo
  "estoque:historico": ["ADMIN", "DEFESA_CIVIL", "COORDENADOR"],

  // Infraestrutura (RF05 / RF09)
  "ocorrencia:ver": TODOS,
  "ocorrencia:gerenciar": ["ADMIN", "DEFESA_CIVIL", "COORDENADOR"],
  /** Ocorrência do território, sem abrigo (via interditada, área de risco...). */
  "ocorrencia:regional": ["ADMIN", "DEFESA_CIVIL"],

  // Abrigados (RF12)
  "abrigado:ver": TODOS,
  "abrigado:registrar": ["ADMIN", "COORDENADOR", "VOLUNTARIO"],
  "abrigado:editar": ["ADMIN", "COORDENADOR"],
  "abrigado:desligar": ["ADMIN", "COORDENADOR"],
  "abrigado:transferir": ["ADMIN", "DEFESA_CIVIL", "COORDENADOR"],

  // Catálogo (RF02)
  "catalogo:ver": TODOS,
  "catalogo:gerenciar": ["ADMIN"],

  // Usuários (RF11) - COORDENADOR gerencia apenas VOLUNTARIOs do próprio abrigo
  "usuario:ver": ["ADMIN", "COORDENADOR"],
  "usuario:gerenciar": ["ADMIN", "COORDENADOR"],

  // Auditoria (RF13)
  "auditoria:ver": ["ADMIN", "DEFESA_CIVIL", "COORDENADOR"],

  // Avisos oficiais do INMET: todos veem (também estão no mapa público); ADMIN e Defesa Civil forçam uma consulta.
  "aviso:ver": TODOS,
  "aviso:sincronizar": ["ADMIN", "DEFESA_CIVIL"],
} as const satisfies Record<string, readonly Papel[]>;

export type Permissao = keyof typeof PERMISSOES;

export function pode(usuario: { papel: Papel }, permissao: Permissao): boolean {
  return (PERMISSOES[permissao] as readonly Papel[]).includes(usuario.papel);
}

/** ADMIN ou DEFESA_CIVIL: enxerga todos os abrigos e não é vinculado a nenhum. */
export function ehVisaoGlobal(usuario: { papel: Papel }): boolean {
  return VISAO_GLOBAL.includes(usuario.papel);
}

/** O papel dispensa (e proíbe) vínculo com abrigo? Espelha `fn_validar_vinculo_usuario`. */
export function papelSemAbrigo(papel: Papel): boolean {
  return VISAO_GLOBAL.includes(papel);
}

/** Tela inicial de cada perfil após o login (HU01). */
export const ROTA_INICIAL_POR_PAPEL: Record<Papel, string> = {
  VOLUNTARIO: "/admin/inventario",
  COORDENADOR: "/admin/dashboard",
  // A Defesa Civil começa pela infraestrutura: alertas regionais e moderação.
  DEFESA_CIVIL: "/admin/ocorrencias",
  ADMIN: "/admin/geral",
};
