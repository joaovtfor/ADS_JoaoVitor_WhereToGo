import type { NextRequest } from "next/server";
import { erros, obterIp } from "../http";
import { buscarUsuarioAcessoPorId, motivoBloqueio, paraSessao } from "./acesso";
import { verificarToken } from "./jwt";
import type { Contexto, Papel, UsuarioSessao } from "./rbac";

export const COOKIE_SESSAO = "wtg_sessao";

function extrairToken(req: NextRequest): string | null {
  const autorizacao = req.headers.get("authorization");
  if (autorizacao?.toLowerCase().startsWith("bearer ")) return autorizacao.slice(7).trim() || null;
  return req.cookies.get(COOKIE_SESSAO)?.value ?? null;
}

/**
 * Lê o token (header `Authorization: Bearer` ou cookie de sessão), valida o JWT
 * e revalida o usuário no banco. Assim, desativar um usuário, trocar seu papel
 * ou desativar seu abrigo tem efeito imediato, sem esperar o token expirar.
 */
export async function obterUsuario(req: NextRequest): Promise<UsuarioSessao | null> {
  const token = extrairToken(req);
  if (!token) return null;

  const claims = await verificarToken(token);
  if (!claims) return null;

  const usuario = await buscarUsuarioAcessoPorId(claims.id);
  if (!usuario || motivoBloqueio(usuario)) return null;

  return paraSessao(usuario);
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
