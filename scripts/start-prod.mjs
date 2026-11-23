// =============================================================================
// Inicializador de Produção (Render Node / Render Docker / Docker Compose)
// 1. Prepara o banco: migrations pendentes e seed de demonstração quando o
//    banco está vazio (scripts/preparar-banco.mjs, o mesmo passo que o GitHub
//    Actions executa antes do deploy na Vercel)
// 2. Prepara os estáticos do modo standalone (quando rodado via `npm run start`
//    no ambiente Node nativo do Render) e inicia o servidor Next.js
// =============================================================================
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarEnvLocal } from './migrate.mjs';
import { prepararBanco } from './preparar-banco.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');

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

  // IMPORTANTE: Em containers Linux/Kubernetes (como o Render), o sistema define
  // automaticamente HOSTNAME=<nome-do-pod> (ex.: srv-xxx-hibernate-xxx). Se não
  // sobrescrevermos para '0.0.0.0', o Next.js faz bind apenas no hostname interno
  // e o proxy reverso do Render retorna HTTP 502 Bad Gateway.
  process.env.HOSTNAME = '0.0.0.0';
  if (!process.env.KEEP_ALIVE_TIMEOUT) {
    process.env.KEEP_ALIVE_TIMEOUT = '65000';
  }

  await prepararBanco({ connectionString });

  const caminhoServer = resolverServerStandalone();
  console.log(`[start-prod] Iniciando servidor Next.js standalone (${caminhoServer})...`);
  await import(pathToFileURL(caminhoServer).href);
}

iniciar().catch((erro) => {
  console.error('[start-prod] Falha na inicialização:', erro);
  process.exit(1);
});
