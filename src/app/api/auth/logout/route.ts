import { NextResponse } from "next/server";
import { auditar } from "@/lib/auditoria";
import { COOKIE_SESSAO, obterUsuario } from "@/lib/auth/sessao";
import { obterIp, rota } from "@/lib/http";

/** Encerra a sessão no navegador (remove o cookie). O JWT expira sozinho. */
export const POST = rota(async (req) => {
  const usuario = await obterUsuario(req);
  if (usuario) {
    auditar(
      { usuario, ip: obterIp(req) },
      { acao: "LOGOUT", descricao: `Logout de ${usuario.email}`, idAbrigo: usuario.idAbrigo },
    );
  }

  const resposta = new NextResponse(null, { status: 204 });
  resposta.cookies.delete(COOKIE_SESSAO);
  return resposta;
});
