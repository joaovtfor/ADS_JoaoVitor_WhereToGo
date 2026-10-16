"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "@/lib/cliente-api";

interface RespostaLogin {
  token: string;
  expiraEm: string;
  usuario: {
    id: number;
    nome: string;
    email: string;
    papel: "ADMIN" | "COORDENADOR" | "VOLUNTARIO";
    idAbrigo: number | null;
    abrigo: string | null;
  };
  redirecionarPara: string;
}

const CONTAS_DEMONSTRACAO = [
  {
    rotulo: "Coordenador (Central UPF)",
    papel: "COORDENADOR",
    email: "coordenador@wheretogo.local",
    destino: "/admin/dashboard",
  },
  {
    rotulo: "Voluntário (Central UPF)",
    papel: "VOLUNTARIO",
    email: "voluntario@wheretogo.local",
    destino: "/admin/inventario",
  },
  {
    rotulo: "Administrador Geral",
    papel: "ADMIN",
    email: "admin@wheretogo.local",
    destino: "/admin/geral",
  },
  {
    rotulo: "Coordenador (Ginásio Centro)",
    papel: "COORDENADOR",
    email: "coordenador.centro@wheretogo.local",
    destino: "/admin/dashboard",
  },
] as const;

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    api<{ redirecionarPara: string }>("/api/auth/me")
      .then((sessao) => {
        if (ativo && sessao?.redirecionarPara) {
          router.replace(sessao.redirecionarPara);
        }
      })
      .catch(() => {
        // Não autenticado: permanece na tela de login.
      });
    return () => {
      ativo = false;
    };
  }, [router]);

  async function submeter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resultado = await api<RespostaLogin>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      });
      router.push(resultado.redirecionarPara);
      router.refresh();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  function preencherDemo(emailDemo: string) {
    setEmail(emailDemo);
    setSenha("WhereToGo@2026");
    setErro(null);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      <header className="mx-auto w-full max-w-md flex items-center justify-between py-2">
        <Link href="/" className="flex items-center gap-2.5 text-white hover:opacity-90">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg">
            W
          </span>
          <div>
            <span className="font-bold tracking-tight text-lg block leading-none">WhereToGo</span>
            <span className="text-xs text-slate-400">Gestão de Crise e Abrigos</span>
          </div>
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          ← Mapa Público
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md my-auto py-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <span className="inline-block rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-300 mb-2">
              Acesso Restrito • RBAC
            </span>
            <h1 className="text-2xl font-bold text-white">Entrar na Operação</h1>
            <p className="mt-1 text-sm text-slate-400">
              Identifique-se para acessar o painel do seu perfil (Voluntário, Coordenador de Abrigo ou Administração Geral).
            </p>
          </div>

          {erro && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200"
            >
              <p className="font-semibold text-red-300">Não foi possível autenticar</p>
              <p className="mt-0.5">{erro}</p>
            </div>
          )}

          <form onSubmit={submeter} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-200 mb-1.5">
                E-mail institucional ou operacional
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@wheretogo.local"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-base text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="senha" className="block text-sm font-medium text-slate-200">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="text-xs font-medium text-amber-400 hover:text-amber-300"
                >
                  {mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                </button>
              </div>
              <input
                id="senha"
                type={mostrarSenha ? "text" : "password"}
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-base text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full min-h-12 rounded-xl bg-amber-500 px-4 py-3 text-base font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition cursor-pointer"
            >
              {carregando ? "Autenticando..." : "Acessar Painel"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Credenciais de Demonstração (Seed • 1 clique)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CONTAS_DEMONSTRACAO.map((conta) => (
                <button
                  key={conta.email}
                  type="button"
                  onClick={() => preencherDemo(conta.email)}
                  className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 text-left hover:border-amber-500/50 hover:bg-slate-800/70 transition cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-200">{conta.rotulo}</span>
                  <span className="text-[11px] text-slate-400 truncate w-full">{conta.email}</span>
                  <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-amber-300">
                    → {conta.destino}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-xs text-slate-500 py-2">
        WhereToGo • Auditoria Imutável Ativa (RNF03) • Controle de Acesso Baseado em Papéis (RNF05)
      </footer>
    </div>
  );
}
