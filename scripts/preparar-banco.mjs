// =============================================================================
// Prepara o banco para a versão atual do código.
//
// Uso:
//   node scripts/preparar-banco.mjs   (ou: npm run db:preparar)
//
// 1. Aplica as migrations SQL pendentes (db/migrations/NNNN_*.sql), com advisory lock.
// 2. Se SEED_SE_VAZIO !== 'false': com o banco vazio (0 usuários), popula os
//    abrigos, estoques e contas de demonstração; com dados, só cria as contas
//    de demonstração que faltarem (perfis novos, como DEFESA_CIVIL).
//
// Roda em dois lugares, com o mesmo resultado:
// - na partida do servidor Docker (Render / Docker Compose), via start-prod.mjs;
// - no GitHub Actions, antes do deploy na Vercel. Lá não existe "partida do
//   servidor" (cada requisição pode abrir uma função nova), então o banco é
//   preparado antes de o código novo entrar no ar.
//
// No Supabase, use a URL do pooler em modo SESSÃO (porta 5432): o advisory lock
// das migrations é de sessão e não funciona no modo transação (porta 6543).
// =============================================================================
import { pathToFileURL } from 'node:url';
import { carregarEnvLocal, conectarComRetentativa, executarMigracoes } from './migrate.mjs';
import { executarSeed, garantirContasDeDemonstracao } from './seed.mjs';

async function bancoEstaVazio(connectionString) {
  const client = await conectarComRetentativa({
    connectionString,
    applicationName: 'wheretogo-check-seed',
  });
  try {
    const { rows } = await client.query('SELECT count(*)::int AS total FROM usuario');
    return (rows[0]?.total ?? 0) === 0;
  } finally {
    await client.end();
  }
}

/**
 * Aplica as migrations pendentes e, se permitido, o seed de demonstração.
 * @param {{ connectionString: string, log?: (msg: string) => void }} opcoes
 */
export async function prepararBanco({ connectionString, log = console.log }) {
  log('[preparar-banco] Verificando e aplicando migrations pendentes...');
  await executarMigracoes({ connectionString, log });

  const devePopularSeVazio = process.env.SEED_SE_VAZIO !== 'false' && process.env.SEED_SE_VAZIO !== '0';
  if (!devePopularSeVazio) return;

  const senha = process.env.SEED_SENHA_PADRAO || 'WhereToGo@2026';
  if (await bancoEstaVazio(connectionString)) {
    log('[preparar-banco] Banco recém-criado detectado (0 usuários). Populando seed inicial...');
    await executarSeed({ connectionString, senha, log });
  } else {
    log('[preparar-banco] Banco já possui dados cadastrados; seed inicial ignorado.');
    // Perfis novos (ex.: DEFESA_CIVIL) ganham a conta de demonstração sem rodar o seed inteiro.
    await garantirContasDeDemonstracao({ connectionString, senha, log });
  }
}

const executadoDiretamente = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  carregarEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error('[preparar-banco] DATABASE_URL não definida.');
    process.exit(1);
  }

  prepararBanco({ connectionString: process.env.DATABASE_URL }).catch((erro) => {
    console.error('[preparar-banco] Falha:', erro.message);
    process.exit(1);
  });
}
