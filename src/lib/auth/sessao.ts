import type { NextRequest, NextResponse } from "next/server";
import { erros, obterIp } from "../http";
import { buscarUsuarioAcessoPorId, motivoBloqueio, paraSessao } from "./acesso";
import { verificarToken } from "./jwt";
import type { Contexto, Papel, UsuarioSessao } from "./rbac";
import { revogarToken, tokenRevogado } from "./revogacao";

export const COOKIE_SESSAO = "wtg_sessao";

function extrairToken(req: NextRequest): string | null {
  const autorizacao = req.headers.get("authorization");
  if (autorizacao?.toLowerCase().startsWith("bearer ")) return autorizacao.slice(7).trim() || null;
  return req.cookies.get(COOKIE_SESSAO)?.value ?? null;
}

/** Grava o JWT no cookie httpOnly de sessão (login por senha, Google e troca de senha). */
export function definirCookieSessao(resposta: NextResponse, token: string, expiraEm: Date): void {
  resposta.cookies.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

/**
 * Lê o token (header `Authorization: Bearer` ou cookie de sessão), valida o JWT
 * e revalida o usuário no banco. Assim, desativar um usuário, trocar seu papel
 * ou desativar seu abrigo tem efeito imediato, sem esperar o token expirar.
 * Tokens encerrados por logout ou emitidos antes de uma troca de senha
 * (versão de sessão diferente) também são recusados.
 */
export async function obterUsuario(req: NextRequest): Promise<UsuarioSessao | null> {
  const token = extrairToken(req);
  if (!token) return null;

  const claims = await verificarToken(token);
  if (!claims || (claims.jti && tokenRevogado(claims.jti))) return null;

  const usuario = await buscarUsuarioAcessoPorId(claims.id);
  if (!usuario || motivoBloqueio(usuario) || usuario.versaoSessao !== claims.versaoSessao) return null;

  return paraSessao(usuario);
}

/** Logout: invalida o token da requisição (cookie ou Bearer) até ele expirar. */
export async function revogarSessao(req: NextRequest): Promise<void> {
  const token = extrairToken(req);
  const claims = token ? await verificarToken(token) : null;
  if (claims?.jti) revogarToken(claims.jti, claims.expiraEm);
}

/** Exige usuário autenticado (401) e, opcionalmente, um dos papéis (403). */
export async function exigirUsuario(req: NextRequest, papeis?: readonly Papel[]): Promise<UsuarioSessao> {
  const usuario = await obterUsuario(req);
  if (!usuario) throw erros.naoAutenticado();
  if (papeis && !papeis.includes(usuario.papel)) throw erros.semPermissao();
  return usuario;
}

/** Atalho para as rotas autenticadas: usuário + IP para auditoria. */
export async function exigirContexto(req: NextRequest, papeis?: readonly Papel[]): Promise<Contexto> {
  const usuario = await exigirUsuario(req, papeis);
  return { usuario, ip: obterIp(req) };
}
