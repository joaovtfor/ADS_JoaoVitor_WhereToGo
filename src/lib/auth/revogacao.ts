/**
 * Tokens encerrados por logout (`jti` -> expiração em ms). Em memória, como o
 * limitador de tentativas: suficiente para uma instância única (Docker/MVP);
 * com várias réplicas, o estado iria para um armazenamento compartilhado.
 *
 * Revogações que precisam valer para todas as sessões do usuário (troca de
 * senha) usam `usuario.versao_sessao` no banco.
 */

// Mantém o mesmo mapa entre recarregamentos do `next dev` (HMR).
const globalComRevogados = globalThis as typeof globalThis & { __wheretogoTokensRevogados?: Map<string, number> };

function revogados(): Map<string, number> {
  globalComRevogados.__wheretogoTokensRevogados ??= new Map();
  return globalComRevogados.__wheretogoTokensRevogados;
}

export function revogarToken(jti: string, expiraEm: Date, agora = Date.now()): void {
  const mapa = revogados();
  if (mapa.size >= 5000) {
    for (const [id, expira] of mapa) {
      if (expira <= agora) mapa.delete(id);
    }
  }
  mapa.set(jti, expiraEm.getTime());
}

export function tokenRevogado(jti: string, agora = Date.now()): boolean {
  const expira = revogados().get(jti);
  return expira !== undefined && expira > agora;
}
