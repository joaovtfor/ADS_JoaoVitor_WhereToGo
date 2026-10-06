import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, rota, semConteudo } from "@/lib/http";
import { alterarSenha, esquemaAlterarSenha } from "@/modules/auth/auth.service";

/** Troca da própria senha. */
export const PUT = rota(async (req) => {
  const ctx = await exigirContexto(req);
  await alterarSenha(ctx, await lerCorpo(req, esquemaAlterarSenha));
  return semConteudo();
});
