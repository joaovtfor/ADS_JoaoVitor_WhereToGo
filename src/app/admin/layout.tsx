import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { classesBotao } from "@/components/ui/botao";
import { COOKIE_SESSAO, obterUsuarioPorToken } from "@/lib/auth/sessao";
import { listarAbrigos } from "@/modules/abrigos/abrigos.service";
import { obterPerfil } from "@/modules/auth/auth.service";
import { AdminShell, type AbrigoAdmin, type UsuarioPerfil } from "./contexto-admin";

/** Esqueleto mostrado enquanto a sessão é conferida: mesma estrutura do painel, sem dados. */
function EsqueletoPainel() {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo text-texto-2">
      <div className="h-14 border-b border-borda bg-superficie" />
      <p role="status" className="p-6 text-corpo">
        Carregando o painel...
      </p>
    </div>
  );
}

function FalhaAoCarregar() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fundo p-6 text-center">
      <p role="alert" className="max-w-sm text-corpo text-texto">
        Não foi possível carregar o painel agora. Verifique a conexão e tente de novo.
      </p>
      <Link href="/admin" prefetch={false} className={classesBotao("secundaria")}>
        Tentar de novo
      </Link>
    </div>
  );
}

/**
 * Confere a sessão e busca perfil e abrigos no servidor, na mesma resposta da
 * página. Antes o painel fazia isso no navegador, atrás de uma tela de espera
 * (DESIGN.md §6.2). O proxy já barrou quem não tem cookie válido; aqui a sessão
 * é revalidada no banco (usuário desativado, senha trocada, abrigo arquivado).
 */
async function PainelComSessao({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;

  let dados: { perfil: UsuarioPerfil; abrigos: AbrigoAdmin[] } | "sem-sessao" | "falha";
  try {
    const usuario = await obterUsuarioPorToken(token);
    if (!usuario) {
      dados = "sem-sessao";
    } else {
      const contexto = { usuario, ip: null };
      const [perfil, abrigos] = await Promise.all([obterPerfil(contexto), listarAbrigos(contexto, {})]);
      dados = { perfil, abrigos };
    }
  } catch (erro) {
    console.error("[admin] falha ao carregar a sessão do painel", erro);
    dados = "falha";
  }

  // Fora do try: `redirect` funciona lançando uma exceção própria.
  if (dados === "sem-sessao") redirect("/login?sessao=expirada");
  if (dados === "falha") return <FalhaAoCarregar />;

  return (
    <AdminShell usuario={dados.perfil} abrigosIniciais={dados.abrigos}>
      {children}
    </AdminShell>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<EsqueletoPainel />}>
      <PainelComSessao>{children}</PainelComSessao>
    </Suspense>
  );
}
