import { exigirContexto } from "@/lib/auth/sessao";
import { responder, rota } from "@/lib/http";
import { obterPerfil } from "@/modules/auth/auth.service";

/** Dados da sessão ativa (token via header Authorization: Bearer ou cookie). */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await obterPerfil(ctx), 200, { "Cache-Control": "no-store" });
});
