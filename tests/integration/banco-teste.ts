/** Resolve a URL do banco de testes (DATABASE_URL_TEST ou DATABASE_URL com o banco `wheretogo_test`). */
export function urlBancoTeste(): string {
  try {
    process.loadEnvFile();
  } catch {
    // sem .env: usa as variáveis do ambiente (CI)
  }

  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  if (!process.env.DATABASE_URL) {
    throw new Error("Defina DATABASE_URL_TEST (ou DATABASE_URL) para rodar os testes de integração.");
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/wheretogo_test";
  return url.toString();
}
