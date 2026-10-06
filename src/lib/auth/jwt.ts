import { decodeJwt, jwtVerify, SignJWT } from "jose";
import { env } from "../env";
import { z } from "../validacao";
import { PAPEIS, type UsuarioSessao } from "./rbac";

const EMISSOR = "wheretogo";
const AUDIENCIA = "wheretogo-painel";

const esquemaClaims = z.object({
  sub: z.string().regex(/^\d+$/),
  nome: z.string(),
  email: z.string(),
  papel: z.enum(PAPEIS),
  idAbrigo: z.number().int().positive().nullable(),
});

function chave(): Uint8Array {
  return new TextEncoder().encode(env().JWT_SECRET);
}

export interface TokenAssinado {
  token: string;
  expiraEm: Date;
}

/** Gera o JWT de sessão com as claims de RBAC (id, nome, e-mail, papel e abrigo). */
export async function assinarToken(usuario: UsuarioSessao): Promise<TokenAssinado> {
  const token = await new SignJWT({
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    idAbrigo: usuario.idAbrigo,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(usuario.id))
    .setIssuer(EMISSOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt()
    .setExpirationTime(env().JWT_EXPIRES_IN)
    .sign(chave());

  const { exp } = decodeJwt(token);
  return { token, expiraEm: new Date((exp ?? 0) * 1000) };
}

/** Valida assinatura, emissor, audiência e expiração. Retorna `null` se inválido. */
export async function verificarToken(token: string): Promise<UsuarioSessao | null> {
  try {
    const { payload } = await jwtVerify(token, chave(), {
      issuer: EMISSOR,
      audience: AUDIENCIA,
      algorithms: ["HS256"],
    });
    const claims = esquemaClaims.parse(payload);
    return {
      id: Number(claims.sub),
      nome: claims.nome,
      email: claims.email,
      papel: claims.papel,
      idAbrigo: claims.idAbrigo,
    };
  } catch {
    return null;
  }
}
