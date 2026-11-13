// =============================================================================
// Inicializador de Produção (Render Node / Render Docker / Docker Compose)
// 1. Aplica migrations SQL pendentes (db/migrations/0001..0010) com advisory lock
// 2. Se o banco estiver vazio (0 usuários) e SEED_SE_VAZIO !== 'false',
//    popula automaticamente os abrigos, estoques e contas de demonstração
// 3. Prepara os estáticos do modo standalone (quando rodado via `npm run start`
//    no ambiente Node nativo do Render) e inicia o servidor Next.js
// =============================================================================
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { carregarEnvLocal, executarMigracoes, obterConfigSslScript } from './migrate.mjs';
import { executarSeed } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');

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

function resolverServerStandalone() {
  // Caso 1: Container Docker (runner), onde server.js já está na raiz (/app/server.js)
  const serverRaiz = path.join(RAIZ, 'server.js');
  if (existsSync(serverRaiz)) {
    return serverRaiz;
  }

  // Caso 2: Ambiente Node nativo (ex.: Render Web Service com `npm run build` + `npm run start`)
  const dirStandalone = path.join(RAIZ, '.next', 'standalone');
  const serverStandalone = path.join(dirStandalone, 'server.js');
  if (existsSync(serverStandalone)) {
    const origemPublic = path.join(RAIZ, 'public');
    const destinoPublic = path.join(dirStandalone, 'public');
    if (existsSync(origemPublic) && !existsSync(destinoPublic)) {
      cpSync(origemPublic, destinoPublic, { recursive: true });
    }

    const origemStatic = path.join(RAIZ, '.next', 'static');
    const destinoStatic = path.join(dirStandalone, '.next', 'static');
    if (existsSync(origemStatic) && !existsSync(destinoStatic)) {
      cpSync(origemStatic, destinoStatic, { recursive: true });
    }

    return serverStandalone;
  }

  throw new Error(
    'Arquivo server.js do build standalone não encontrado. Execute "npm run build" antes de "npm run start".',
  );
}

async function iniciar() {
  carregarEnvLocal();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[start-prod] ERRO: DATABASE_URL não definida nas variáveis de ambiente.');
    process.exit(1);
  }

  // Garante bind em todas as interfaces de rede para o proxy do Render/Docker
  if (!process.env.HOSTNAME) {
    process.env.HOSTNAME = '0.0.0.0';
  }

  console.log('[start-prod] Verificando e aplicando migrations pendentes...');
  await executarMigracoes({ connectionString });

  const devePopularSeVazio = process.env.SEED_SE_VAZIO !== 'false' && process.env.SEED_SE_VAZIO !== '0';

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

  const caminhoServer = resolverServerStandalone();
  console.log(`[start-prod] Iniciando servidor Next.js standalone (${caminhoServer})...`);
  await import(pathToFileURL(caminhoServer).href);
}

iniciar().catch((erro) => {
  console.error('[start-prod] Falha na inicialização:', erro);
  process.exit(1);
});
