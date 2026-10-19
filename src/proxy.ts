import { NextResponse, type NextRequest } from "next/server";
import { verificarToken } from "./lib/auth/jwt";
import { ROTA_INICIAL_POR_PAPEL } from "./lib/auth/rbac";
import { COOKIE_SESSAO } from "./lib/auth/sessao";

function redirecionarSemCache(destino: string, req: NextRequest) {
  const resposta = NextResponse.redirect(new URL(destino, req.url));
  resposta.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  resposta.headers.set("Pragma", "no-cache");
  resposta.headers.set("Expires", "0");
  return resposta;
}

/**
 * Proxy de borda do Next.js 16 (antigo Middleware) para proteção das rotas `/admin/*` (RF01 / RNF05).
 *
 * - Redireciona requisições sem cookie JWT válido para `/login`.
 * - Aplica isolamento de rotas por papel (`VOLUNTARIO` não acessa `/admin/dashboard`,
 *   `/admin/ocorrencias` nem `/admin/geral`).
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  if (!token) {
    return redirecionarSemCache("/login", req);
  }

  const usuario = await verificarToken(token);
  if (!usuario) {
    const resposta = redirecionarSemCache("/login", req);
    resposta.cookies.delete(COOKIE_SESSAO);
    return resposta;
  }

  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname === "/admin/") {
    return redirecionarSemCache(ROTA_INICIAL_POR_PAPEL[usuario.papel], req);
  }

  if (
    usuario.papel === "VOLUNTARIO" &&
    (pathname.startsWith("/admin/dashboard") ||
      pathname.startsWith("/admin/ocorrencias") ||
      pathname.startsWith("/admin/geral"))
  ) {
    return redirecionarSemCache("/admin/inventario", req);
  }

  const resposta = NextResponse.next();
  resposta.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return resposta;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
