import { NextResponse } from "next/server";
import { definirCookieSessao, exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, rota } from "@/lib/http";
import { alterarSenha, esquemaAlterarSenha } from "@/modules/auth/auth.service";

/**
 * Troca da própria senha. Revoga as demais sessões do usuário e renova o
 * cookie desta, para quem trocou a senha continuar conectado.
 */
export const PUT = rota(async (req) => {
  const ctx = await exigirContexto(req);
  const { token, expiraEm } = await alterarSenha(ctx, await lerCorpo(req, esquemaAlterarSenha));

  const resposta = new NextResponse(null, { status: 204 });
  definirCookieSessao(resposta, token, expiraEm);
  return resposta;
});
