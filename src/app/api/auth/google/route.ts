import { NextResponse } from "next/server";
import {
  apagarCookieNonceGoogle,
  COOKIE_NONCE_GOOGLE,
  definirCookieNonceGoogle,
  gerarNonceGoogle,
  modoGoogleSimuladoHabilitado,
  nonceGoogleValido,
  obterGoogleClientId,
} from "@/lib/auth/google";
import { definirCookieSessao } from "@/lib/auth/sessao";
import { lerCorpo, obterIp, rota } from "@/lib/http";
import { autenticarComGoogle, esquemaLoginGoogle } from "@/modules/auth/auth.service";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * Configuração do login com Google para a tela de login: o Client ID (público),
 * se o modo simulado existe neste ambiente e o nonce deste navegador, que a
 * tela entrega ao Google Identity Services. O nonce também vai num cookie
 * httpOnly; o mesmo navegador recebe o mesmo valor enquanto o cookie vale (duas
 * abas abertas não se atrapalham).
 */
export const GET = rota(async (req) => {
  const clientId = obterGoogleClientId();
  const modoSimulado = modoGoogleSimuladoHabilitado();
  if (!clientId) {
    return NextResponse.json({ dados: { clientId, modoSimulado, nonce: null } }, { headers: SEM_CACHE });
  }

  const existente = req.cookies.get(COOKIE_NONCE_GOOGLE)?.value;
  const nonce = nonceGoogleValido(existente) ? existente : gerarNonceGoogle();
  const resposta = NextResponse.json({ dados: { clientId, modoSimulado, nonce } }, { headers: SEM_CACHE });
  definirCookieNonceGoogle(resposta, nonce, req);
  return resposta;
});

/**
 * RF01 / RF11 - Autenticação com 1 toque ou solicitação de auto-cadastro via Google One Tap.
 */
export const POST = rota(async (req) => {
  const dados = await lerCorpo(req, esquemaLoginGoogle);
  const nonce = req.cookies.get(COOKIE_NONCE_GOOGLE)?.value;
  const resultado = await autenticarComGoogle(dados, obterIp(req), nonceGoogleValido(nonce) ? nonce : null);

  if (resultado.status === "AUTENTICADO") {
    const resposta = NextResponse.json({ dados: resultado }, { status: 200, headers: SEM_CACHE });
    definirCookieSessao(resposta, resultado.token, resultado.expiraEm, req);
    apagarCookieNonceGoogle(resposta);
    return resposta;
  }

  // REQUER_ABRIGO reenvia o mesmo token com o abrigo escolhido: o nonce continua valendo.
  return NextResponse.json(
    { dados: resultado },
    { status: resultado.status === "PENDENTE_APROVACAO" ? 202 : 200, headers: SEM_CACHE },
  );
});
