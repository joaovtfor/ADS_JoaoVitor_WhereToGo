import { NextResponse } from "next/server";
import { auditar } from "@/lib/auditoria";
import { COOKIE_SESSAO, obterUsuario, revogarSessao } from "@/lib/auth/sessao";
import { obterIp, rota } from "@/lib/http";

/**
 * Encerra a sessão: remove o cookie e revoga o JWT da requisição, que deixa de
 * valer também via `Authorization: Bearer`. Outras sessões do mesmo usuário
 * (outro navegador/aparelho) continuam ativas.
 */
export const POST = rota(async (req) => {
  const usuario = await obterUsuario(req);
  if (usuario) {
    auditar(
      { usuario, ip: obterIp(req) },
      { acao: "LOGOUT", descricao: `Logout de ${usuario.email}`, idAbrigo: usuario.idAbrigo },
    );
  }
  await revogarSessao(req);

  const resposta = new NextResponse(null, { status: 204 });
  resposta.cookies.delete(COOKIE_SESSAO);
  return resposta;
});
