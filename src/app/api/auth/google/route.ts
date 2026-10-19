import { NextResponse } from "next/server";
import { modoGoogleSimuladoHabilitado, obterGoogleClientId } from "@/lib/auth/google";
import { COOKIE_SESSAO } from "@/lib/auth/sessao";
import { lerCorpo, obterIp, responder, rota } from "@/lib/http";
import { autenticarComGoogle, esquemaLoginGoogle } from "@/modules/auth/auth.service";

/** Retorna a disponibilidade do Google One Tap (Client ID oficial ou modo simulado de desenvolvimento). */
export const GET = rota(async () => {
  return responder(
    {
      clientId: obterGoogleClientId(),
      modoSimulado: modoGoogleSimuladoHabilitado(),
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

/**
 * RF01 / RF11 - Autenticação com 1 toque ou solicitação de auto-cadastro via Google One Tap.
 */
export const POST = rota(async (req) => {
  const dados = await lerCorpo(req, esquemaLoginGoogle);
  const resultado = await autenticarComGoogle(dados, obterIp(req));

  if (resultado.status === "AUTENTICADO") {
    const resposta = NextResponse.json(
      { dados: resultado },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
    resposta.cookies.set(COOKIE_SESSAO, resultado.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: resultado.expiraEm,
    });
    return resposta;
  }

  return responder(resultado, resultado.status === "PENDENTE_APROVACAO" ? 202 : 200, {
    "Cache-Control": "no-store",
  });
});
