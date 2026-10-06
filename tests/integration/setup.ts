import { afterAll } from "vitest";
import { aguardarAuditoriasPendentes } from "@/lib/auditoria";
import { encerrarPool } from "@/lib/db";
import { urlBancoTeste } from "./banco-teste";

process.env.DATABASE_URL = urlBancoTeste();
process.env.JWT_SECRET = "chave-de-teste-de-integracao-com-mais-de-32-caracteres";

afterAll(async () => {
  await aguardarAuditoriasPendentes();
  await encerrarPool();
});
