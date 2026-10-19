import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ErroApi, erros } from "../http";

const JWKS_GOOGLE = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const EMISSORES_GOOGLE = ["https://accounts.google.com", "accounts.google.com"];

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
  const id = (process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
  return id.length > 0 ? id : null;
}

export function modoGoogleSimuladoHabilitado(): boolean {
  if (process.env.PERMITIR_GOOGLE_SIMULADO === "false") return false;
  return !obterGoogleClientId();
}

/**
 * Valida o ID Token oficial emitido pelo Google Identity Services (One Tap)
 * usando o conjunto de chaves públicas (JWKS) do Google.
 */
export async function verificarIdTokenGoogle(idToken: string): Promise<PerfilGoogle> {
  const clientId = obterGoogleClientId();
  if (!clientId) {
    throw new ErroApi(
      503,
      "GOOGLE_NAO_CONFIGURADO",
      "A chave GOOGLE_CLIENT_ID não está configurada no servidor.",
    );
  }

  try {
    const { payload } = await jwtVerify(idToken, JWKS_GOOGLE, {
      issuer: EMISSORES_GOOGLE,
      audience: clientId,
    });

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const emailVerificado = payload.email_verified === true;
    const nomeBruto = typeof payload.name === "string" ? payload.name.trim() : "";
    const nome = nomeBruto || email.split("@")[0] || "Usuário Google";

    if (!sub || !email || !emailVerificado) {
      throw erros.naoAutenticado("A conta Google informada não possui um e-mail verificado válido.");
    }

    return { sub, email, nome, emailVerificado: true };
  } catch (err) {
    if (err instanceof ErroApi) throw err;
    throw erros.naoAutenticado("Token do Google One Tap inválido ou expirado.");
  }
}

/**
 * Extrai e valida o perfil Google a partir do ID Token real (quando configurado)
 * ou da credencial simulada de desenvolvimento/demonstração local.
 */
export async function obterPerfilGoogle(entrada: EntradaCredencialGoogle): Promise<PerfilGoogle> {
  if (entrada.credential) {
    return verificarIdTokenGoogle(entrada.credential);
  }

  if (entrada.credencialSimulada) {
    if (!modoGoogleSimuladoHabilitado()) {
      throw erros.semPermissao(
        "Credenciais simuladas do Google One Tap estão desabilitadas quando GOOGLE_CLIENT_ID está configurado.",
      );
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
