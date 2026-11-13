import { NextResponse } from "next/server";
import { definirCookieSessao } from "@/lib/auth/sessao";
import { lerCorpo, obterIp, rota } from "@/lib/http";
import { esquemaLogin, login } from "@/modules/auth/auth.service";

/** RF01 / UC01 - login com e-mail e senha; retorna o JWT e também o grava em cookie httpOnly. */
export const POST = rota(async (req) => {
  const dados = await lerCorpo(req, esquemaLogin);
  const resultado = await login(dados, obterIp(req));

  const resposta = NextResponse.json({ dados: resultado }, { headers: { "Cache-Control": "no-store" } });
  definirCookieSessao(resposta, resultado.token, resultado.expiraEm, req);
  return resposta;
});
