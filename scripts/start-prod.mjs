// =============================================================================
// Inicializador de Produção (Docker / Render / PaaS)
// 1. Aplica migrations SQL pendentes (db/migrations/0001..0010) com advisory lock
// 2. Se SEED_SE_VAZIO=true e não houver nenhum usuário no banco (1º deploy),
//    popula automaticamente os abrigos, estoques e contas de demonstração
// 3. Inicia o servidor standalone do Next.js (server.js)
// =============================================================================
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { executarMigracoes, obterConfigSslScript } from './migrate.mjs';
import { executarSeed } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bancoEstaVazio(connectionString) {
  const ssl = obterConfigSslScript(connectionString);
  const client = new pg.Client({
    connectionString,
    application_name: 'wheretogo-check-seed',
    ...(ssl ? { ssl } : {}),
  });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT count(*)::int AS total FROM usuario');
    return (rows[0]?.total ?? 0) === 0;
  } finally {
    await client.end();
  }
}

async function iniciar() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[start-prod] ERRO: DATABASE_URL não definida.');
    process.exit(1);
  }

  console.log('[start-prod] Verificando e aplicando migrations pendentes...');
  await executarMigracoes({ connectionString });

  const devePopularSeVazio =
    process.env.SEED_SE_VAZIO === 'true' || process.env.SEED_SE_VAZIO === '1';

  if (devePopularSeVazio) {
    const vazio = await bancoEstaVazio(connectionString);
    if (vazio) {
      console.log('[start-prod] Banco recém-criado detectado (0 usuários). Populando seed inicial...');
      await executarSeed({
        connectionString,
        senha: process.env.SEED_SENHA_PADRAO || 'WhereToGo@2026',
      });
    } else {
      console.log('[start-prod] Banco já possui dados cadastrados; seed inicial ignorado.');
    }
  }

  console.log('[start-prod] Iniciando servidor Next.js standalone...');
  const caminhoServer = path.resolve(__dirname, '..', 'server.js');
  await import(pathToFileURL(caminhoServer).href);
}

iniciar().catch((erro) => {
  console.error('[start-prod] Falha na inicialização:', erro);
  process.exit(1);
});
