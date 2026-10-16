import { NextResponse, type NextRequest } from "next/server";
import { verificarToken } from "./lib/auth/jwt";
import { ROTA_INICIAL_POR_PAPEL } from "./lib/auth/rbac";
import { COOKIE_SESSAO } from "./lib/auth/sessao";

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
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const usuario = await verificarToken(token);
  if (!usuario) {
    const resposta = NextResponse.redirect(new URL("/login", req.url));
    resposta.cookies.delete(COOKIE_SESSAO);
    return resposta;
  }

  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname === "/admin/") {
    return NextResponse.redirect(new URL(ROTA_INICIAL_POR_PAPEL[usuario.papel], req.url));
  }

  if (
    usuario.papel === "VOLUNTARIO" &&
    (pathname.startsWith("/admin/dashboard") ||
      pathname.startsWith("/admin/ocorrencias") ||
      pathname.startsWith("/admin/geral"))
  ) {
    return NextResponse.redirect(new URL("/admin/inventario", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
