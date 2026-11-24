import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextResponse } from "next/server";
import { ErroApi, erros } from "../http";
import { requisicaoEhHttps } from "./sessao";

const JWKS_GOOGLE = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const EMISSORES_GOOGLE = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Nonce do login com Google: valor aleatório que o navegador entrega ao Google
 * Identity Services e que volta dentro do ID Token. Ele fica num cookie
 * httpOnly deste navegador: um token capturado em outro lugar (log, extensão,
 * outro site com o mesmo Client ID) não serve aqui, porque não traz o nonce do
 * cookie de quem está entrando.
 */
export const COOKIE_NONCE_GOOGLE = "wtg_google_nonce";
const VALIDADE_NONCE_S = 30 * 60;
/** 32 bytes em base64url. */
const FORMATO_NONCE = /^[A-Za-z0-9_-]{43}$/;

export interface PerfilGoogle {
  sub: string;
  email: string;
  nome: string;
  emailVerificado: boolean;
}

export interface EntradaCredencialGoogle {
  credential?: string;
  credencialSimulada?: {
    email: string;
    nome: string;
    sub?: string;
  };
}

export function obterGoogleClientId(): string | null {
  // NEXT_PUBLIC_GOOGLE_CLIENT_ID: nome antigo, aceito para não quebrar ambientes já configurados.
  const id = (process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
  return id.length > 0 ? id : null;
}

/**
 * Login "Google simulado" (só e-mail e nome, sem token do Google): existe para
 * testar o auto-cadastro sem uma conta Google. Como não prova nada sobre quem
 * está entrando, NUNCA vale em produção, com ou sem GOOGLE_CLIENT_ID: lá
 * qualquer pessoa entraria como qualquer usuário só informando o e-mail.
 * Fora de produção (next dev, testes), vale enquanto não houver Client ID,
 * a menos que PERMITIR_GOOGLE_SIMULADO=false.
 */
export function modoGoogleSimuladoHabilitado(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.PERMITIR_GOOGLE_SIMULADO === "false") return false;
  return !obterGoogleClientId();
}

export function nonceGoogleValido(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && FORMATO_NONCE.test(valor);
}

export function gerarNonceGoogle(): string {
  return randomBytes(32).toString("base64url");
}

/** Grava (ou renova) o nonce no cookie, restrito às rotas de login com Google. */
export function definirCookieNonceGoogle(resposta: NextResponse, nonce: string, req: Request): void {
  resposta.cookies.set(COOKIE_NONCE_GOOGLE, nonce, {
    httpOnly: true,
    secure: requisicaoEhHttps(req),
    sameSite: "strict",
    path: "/api/auth/google",
    maxAge: VALIDADE_NONCE_S,
  });
}

/** Depois do login, o nonce não serve para mais nada. */
export function apagarCookieNonceGoogle(resposta: NextResponse): void {
  resposta.cookies.set(COOKIE_NONCE_GOOGLE, "", { path: "/api/auth/google", maxAge: 0 });
}

function mesmoTexto(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Valida o ID Token oficial emitido pelo Google Identity Services (One Tap ou
 * botão) com as chaves públicas (JWKS) do Google: assinatura, emissor,
 * validade, destinatário (o nosso Client ID), e-mail verificado e o nonce
 * deste navegador.
 */
export async function verificarIdTokenGoogle(idToken: string, nonceEsperado: string | null): Promise<PerfilGoogle> {
  const clientId = obterGoogleClientId();
  if (!clientId) {
    throw new ErroApi(
      503,
      "GOOGLE_NAO_CONFIGURADO",
      "A chave GOOGLE_CLIENT_ID não está configurada no servidor.",
    );
  }
  if (!nonceEsperado) {
    throw new ErroApi(401, "GOOGLE_NONCE_INVALIDO", "O login com Google expirou nesta página. Tente de novo.");
  }

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    ({ payload } = await jwtVerify(idToken, JWKS_GOOGLE, {
      issuer: EMISSORES_GOOGLE,
      audience: clientId,
    }));
  } catch {
    throw erros.naoAutenticado("Token do Google One Tap inválido ou expirado.");
  }

  if (typeof payload.nonce !== "string" || !mesmoTexto(payload.nonce, nonceEsperado)) {
    throw new ErroApi(401, "GOOGLE_NONCE_INVALIDO", "Este login com Google não foi iniciado nesta página. Tente de novo.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerificado = payload.email_verified === true;
  const nomeBruto = typeof payload.name === "string" ? payload.name.trim() : "";
  const nome = nomeBruto || email.split("@")[0] || "Usuário Google";

  if (!sub || !email || !emailVerificado) {
    throw erros.naoAutenticado("A conta Google informada não possui um e-mail verificado válido.");
  }

  return { sub, email, nome, emailVerificado: true };
}

/**
 * Extrai e valida o perfil Google a partir do ID Token real (quando configurado)
 * ou da credencial simulada (só fora de produção, ver `modoGoogleSimuladoHabilitado`).
 */
export async function obterPerfilGoogle(entrada: EntradaCredencialGoogle, nonceEsperado: string | null = null): Promise<PerfilGoogle> {
  if (entrada.credential) {
    return verificarIdTokenGoogle(entrada.credential, nonceEsperado);
  }

  if (entrada.credencialSimulada) {
    if (!modoGoogleSimuladoHabilitado()) {
      throw erros.semPermissao("O login com Google simulado só existe em ambiente de desenvolvimento sem GOOGLE_CLIENT_ID.");
    }
    const email = entrada.credencialSimulada.email.trim().toLowerCase();
    const nome = entrada.credencialSimulada.nome.trim();
    const sub =
      entrada.credencialSimulada.sub?.trim() ||
      `google-sim-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;

    return {
      sub,
      email,
      nome,
      emailVerificado: true,
    };
  }

  throw erros.requisicaoInvalida("Informe uma credencial do Google One Tap.");
}
