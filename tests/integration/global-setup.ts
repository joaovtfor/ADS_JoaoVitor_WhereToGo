import pg from "pg";
import { executarMigracoes } from "../../scripts/migrate.mjs";
import { urlBancoTeste } from "./banco-teste";

/** Recria o banco de testes do zero e aplica todas as migrations. */
export default async function setup() {
  const urlTeste = new URL(urlBancoTeste());
  const nomeBanco = urlTeste.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(nomeBanco)) {
    throw new Error(`Por segurança, o banco de testes deve terminar com "_test" (recebido: "${nomeBanco}").`);
  }

  const urlAdmin = new URL(urlTeste);
  urlAdmin.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: urlAdmin.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${nomeBanco} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${nomeBanco}`);
  } finally {
    await admin.end();
  }

  await executarMigracoes({ connectionString: urlTeste.toString(), log: () => undefined });
}
