import { consultar, consultarUm } from "../db";

/**
 * Tokens encerrados por logout, na tabela `token_revogado` (migration 0014).
 * Ficam no banco, e não na memória do processo, porque na Vercel cada
 * requisição pode cair numa instância diferente: um logout guardado na memória
 * de uma delas não valeria nas outras.
 *
 * Revogações que precisam valer para todas as sessões do usuário (troca de
 * senha) usam `usuario.versao_sessao`.
 */

/** Registra o logout e, no mesmo comando, apaga as revogações de tokens já expirados. */
export async function revogarToken(jti: string, expiraEm: Date): Promise<void> {
  await consultar(
    `WITH expirados AS (DELETE FROM token_revogado WHERE expira_em <= now())
     INSERT INTO token_revogado (jti, expira_em) VALUES ($1, $2)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, expiraEm],
  );
}

/** O token foi encerrado por logout e ainda não expirou? */
export async function tokenRevogado(jti: string): Promise<boolean> {
  const linha = await consultarUm<{ revogado: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM token_revogado WHERE jti = $1 AND expira_em > now()) AS revogado",
    [jti],
  );
  return linha?.revogado ?? false;
}
