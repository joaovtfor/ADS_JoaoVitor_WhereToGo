// =============================================================================
// Executor de migrations SQL versionadas (db/migrations/NNNN_descricao.sql).
//
// Uso:
//   node scripts/migrate.mjs           -> aplica as migrations pendentes
//   node scripts/migrate.mjs --reset   -> APAGA o schema public e reaplica tudo
//                                         (bloqueado quando NODE_ENV=production)
//
// Cada arquivo roda em uma transação própria e é registrado em
// `schema_migrations` com um checksum, para detectar edições em migrations já
// aplicadas (migrations aplicadas nunca devem ser alteradas: crie uma nova).
// =============================================================================
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const DIRETORIO_MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
// Chave arbitrária para o advisory lock que impede execuções simultâneas.
const CHAVE_LOCK = 7_220_901;

export function carregarEnvLocal() {
  try {
    process.loadEnvFile();
  } catch {
    // Sem .env: as variáveis vêm do ambiente (Docker/CI).
  }
}

async function listarArquivos() {
  const arquivos = (await readdir(DIRETORIO_MIGRATIONS)).filter((nome) => /^\d{4}_.+\.sql$/.test(nome)).sort();
  return Promise.all(
    arquivos.map(async (nome) => {
      const sql = await readFile(path.join(DIRETORIO_MIGRATIONS, nome), 'utf8');
      return { versao: nome.slice(0, 4), nome, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

/**
 * Aplica as migrations pendentes no banco indicado.
 * @param {{ connectionString: string, reset?: boolean, log?: (msg: string) => void }} opcoes
 * @returns {Promise<string[]>} nomes das migrations aplicadas nesta execução
 */
export async function executarMigracoes({ connectionString, reset = false, log = console.log }) {
  const client = new pg.Client({ connectionString, application_name: 'wheretogo-migrate' });
  await client.connect();
  const aplicadasAgora = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [CHAVE_LOCK]);

    if (reset) {
      log('[migrate] --reset: recriando o schema public...');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA public');
      await client.query('GRANT ALL ON SCHEMA public TO public');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        versao     VARCHAR(4)   PRIMARY KEY,
        nome       VARCHAR(255) NOT NULL,
        checksum   CHAR(64)     NOT NULL,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT versao, nome, checksum FROM schema_migrations');
    const jaAplicadas = new Map(rows.map((r) => [r.versao, r]));

    for (const migracao of await listarArquivos()) {
      const registrada = jaAplicadas.get(migracao.versao);
      if (registrada) {
        if (registrada.checksum !== migracao.checksum) {
          throw new Error(
            `A migration ${migracao.nome} foi alterada depois de aplicada (checksum divergente). ` +
              'Crie uma nova migration em vez de editar uma existente.',
          );
        }
        continue;
      }

      log(`[migrate] aplicando ${migracao.nome}...`);
      try {
        await client.query('BEGIN');
        await client.query(migracao.sql);
        await client.query('INSERT INTO schema_migrations (versao, nome, checksum) VALUES ($1, $2, $3)', [
          migracao.versao,
          migracao.nome,
          migracao.checksum,
        ]);
        await client.query('COMMIT');
        aplicadasAgora.push(migracao.nome);
      } catch (erro) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${migracao.nome}: ${erro.message}`, { cause: erro });
      }
    }

    log(
      aplicadasAgora.length
        ? `[migrate] ${aplicadasAgora.length} migration(s) aplicada(s).`
        : '[migrate] banco já está atualizado.',
    );
    return aplicadasAgora;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [CHAVE_LOCK]).catch(() => {});
    await client.end();
  }
}

const executadoDiretamente = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  carregarEnvLocal();
  const reset = process.argv.includes('--reset');

  if (reset && process.env.NODE_ENV === 'production') {
    console.error('[migrate] --reset não é permitido com NODE_ENV=production.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL não definida.');
    process.exit(1);
  }

  executarMigracoes({ connectionString: process.env.DATABASE_URL, reset }).catch((erro) => {
    console.error(`[migrate] ${erro.message}`);
    process.exit(1);
  });
}
