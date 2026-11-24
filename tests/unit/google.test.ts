import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  gerarNonceGoogle,
  modoGoogleSimuladoHabilitado,
  nonceGoogleValido,
  obterPerfilGoogle,
  verificarIdTokenGoogle,
} from "@/lib/auth/google";
import { ErroApi } from "@/lib/http";

// As chaves públicas do Google (JWKS remoto) dão lugar a uma chave gerada aqui:
// o teste assina os próprios "ID Tokens do Google".
const chaves = vi.hoisted(() => ({ jwks: null as null | ReturnType<typeof createLocalJWKSet> }));
vi.mock("jose", async (importOriginal) => {
  const real = await importOriginal<typeof import("jose")>();
  return {
    ...real,
    createRemoteJWKSet: () => ((...args: Parameters<ReturnType<typeof createLocalJWKSet>>) => chaves.jwks!(...args)) as unknown,
  };
});

const CLIENT_ID = "123456-teste.apps.googleusercontent.com";
let chavePrivada: CryptoKey;

beforeAll(async () => {
  const par = await generateKeyPair("RS256");
  chavePrivada = par.privateKey;
  const publica: JWK = { ...(await exportJWK(par.publicKey)), kid: "chave-teste", alg: "RS256", use: "sig" };
  chaves.jwks = createLocalJWKSet({ keys: [publica] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function tokenGoogle(claims: Record<string, unknown> = {}, audiencia = CLIENT_ID) {
  return new SignJWT({ email: "maria@gmail.com", email_verified: true, name: "Maria Oliveira", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "chave-teste" })
    .setIssuer("https://accounts.google.com")
    .setAudience(audiencia)
    .setSubject("110169484474386276334")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(chavePrivada);
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroApi> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ErroApi) return erro;
    throw erro;
  }
  throw new Error("Era esperado um erro.");
}

describe("Login com Google (ID Token real)", () => {
  it("aceita o token com o nonce deste navegador", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    const nonce = gerarNonceGoogle();
    const perfil = await verificarIdTokenGoogle(await tokenGoogle({ nonce }), nonce);
    expect(perfil).toEqual({ sub: "110169484474386276334", email: "maria@gmail.com", nome: "Maria Oliveira", emailVerificado: true });
  });

  it("recusa token com nonce de outro navegador, sem nonce ou sem cookie", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    const nonce = gerarNonceGoogle();

    const outroNonce = await erroDe(verificarIdTokenGoogle(await tokenGoogle({ nonce: gerarNonceGoogle() }), nonce));
    expect([outroNonce.status, outroNonce.codigo]).toEqual([401, "GOOGLE_NONCE_INVALIDO"]);

    const semNonce = await erroDe(verificarIdTokenGoogle(await tokenGoogle(), nonce));
    expect(semNonce.codigo).toBe("GOOGLE_NONCE_INVALIDO");

    const semCookie = await erroDe(verificarIdTokenGoogle(await tokenGoogle({ nonce }), null));
    expect(semCookie.codigo).toBe("GOOGLE_NONCE_INVALIDO");
  });

  it("recusa token emitido para outro Client ID ou com e-mail não verificado", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    const nonce = gerarNonceGoogle();

    const outroApp = await erroDe(verificarIdTokenGoogle(await tokenGoogle({ nonce }, "outro-app.apps.googleusercontent.com"), nonce));
    expect([outroApp.status, outroApp.codigo]).toEqual([401, "NAO_AUTENTICADO"]);

    const naoVerificado = await erroDe(verificarIdTokenGoogle(await tokenGoogle({ nonce, email_verified: false }), nonce));
    expect(naoVerificado.status).toBe(401);
  });

  it("o nonce gerado tem o formato aceito pelo cookie", () => {
    expect(nonceGoogleValido(gerarNonceGoogle())).toBe(true);
    expect(nonceGoogleValido("curto")).toBe(false);
    expect(nonceGoogleValido(undefined)).toBe(false);
  });
});

describe("Login com Google simulado", () => {
  const simulado = { credencialSimulada: { email: "admin@wheretogo.local", nome: "Qualquer Pessoa" } };

  it("nunca vale em produção, mesmo sem GOOGLE_CLIENT_ID", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    expect(modoGoogleSimuladoHabilitado()).toBe(false);
    const erro = await erroDe(obterPerfilGoogle(simulado));
    expect(erro.status).toBe(403);
  });

  it("vale em desenvolvimento sem Client ID, e some quando o Client ID é configurado", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    expect(modoGoogleSimuladoHabilitado()).toBe(true);
    await expect(obterPerfilGoogle(simulado)).resolves.toMatchObject({ email: "admin@wheretogo.local" });

    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    expect(modoGoogleSimuladoHabilitado()).toBe(false);
  });
});
