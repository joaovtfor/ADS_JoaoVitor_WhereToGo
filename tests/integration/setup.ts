import { afterAll } from "vitest";
import { aguardarAuditoriasPendentes } from "@/lib/auditoria";
import { encerrarPool } from "@/lib/db";
import { urlBancoTeste } from "./banco-teste";

process.env.DATABASE_URL = urlBancoTeste();
process.env.JWT_SECRET = "chave-de-teste-de-integracao-com-mais-de-32-caracteres";
// `urlBancoTeste` carrega o `.env` de quem roda os testes. Com um Client ID
// real lá, o Google simulado (usado nos testes de cadastro e aprovação) fica
// desligado. O token real é testado em tests/unit/google.test.ts.
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
delete process.env.PERMITIR_GOOGLE_SIMULADO;

afterAll(async () => {
  await aguardarAuditoriasPendentes();
  await encerrarPool();
});
