import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env";

// BIGINT (ids de logs/movimentações, COUNT) e NUMERIC como number; DATE como
// string "AAAA-MM-DD" para não sofrer conversão de fuso horário.
types.setTypeParser(types.builtins.INT8, (valor) => Number(valor));
types.setTypeParser(types.builtins.NUMERIC, (valor) => Number(valor));
types.setTypeParser(types.builtins.DATE, (valor) => valor);

/** Qualquer objeto capaz de executar SQL: o pool ou um client em transação. */
export interface Executor {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, parametros?: unknown[]): Promise<QueryResult<R>>;
}

// Mantém um único pool entre recarregamentos do `next dev` (HMR).
const globalComPool = globalThis as typeof globalThis & { __wheretogoPool?: Pool };

function obterConfigSsl(connectionString: string, modoSsl: string): boolean | { rejectUnauthorized: boolean } | undefined {
  if (modoSsl === "no-verify" || modoSsl === "true" || modoSsl === "require") {
    return { rejectUnauthorized: false };
  }
  if (/(@dpg-|render\.com|neon\.tech|supabase\.co|sslmode=(require|verify-full|verify-ca|no-verify))/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function pool(): Pool {
  if (!globalComPool.__wheretogoPool) {
    const cfg = env();
    const ssl = obterConfigSsl(cfg.DATABASE_URL, cfg.DATABASE_SSL);
    const novoPool = new Pool({
      connectionString: cfg.DATABASE_URL,
      max: cfg.DB_POOL_MAX,
      // Na Vercel a função fica viva até as conexões ociosas fecharem (ver abaixo),
      // e esse tempo conta no uso do plano: lá elas fecham depois de 5 s.
      idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "wheretogo-app",
      ...(ssl ? { ssl } : {}),
    });
    novoPool.on("error", (erro) => console.error("[db] erro em conexão ociosa do pool", erro));
    // Na Vercel (Fluid compute), adia a suspensão da função até as conexões
    // ociosas fecharem, para não deixá-las abertas no pooler do Supabase.
    // Fora da Vercel não faz nada.
    attachDatabasePool(novoPool);
    globalComPool.__wheretogoPool = novoPool;
  }
  return globalComPool.__wheretogoPool;
}

export async function consultar<R extends QueryResultRow>(
  sql: string,
  parametros: unknown[] = [],
  executor: Executor = pool(),
): Promise<R[]> {
  const resultado = await executor.query<R>(sql, parametros);
  return resultado.rows;
}

export async function consultarUm<R extends QueryResultRow>(
  sql: string,
  parametros: unknown[] = [],
  executor: Executor = pool(),
): Promise<R | null> {
  const linhas = await consultar<R>(sql, parametros, executor);
  return linhas[0] ?? null;
}

/** Executa `fn` dentro de uma transação (COMMIT ao final, ROLLBACK em erro). */
export async function comTransacao<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const resultado = await fn(client);
    await client.query("COMMIT");
    return resultado;
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    client.release();
  }
}

/** Fecha o pool (usado nos testes e em scripts). */
export async function encerrarPool(): Promise<void> {
  const atual = globalComPool.__wheretogoPool;
  globalComPool.__wheretogoPool = undefined;
  await atual?.end();
}
