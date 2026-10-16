"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, ErroClienteApi, mensagemErro } from "@/lib/cliente-api";

export type PapelUsuario = "ADMIN" | "COORDENADOR" | "VOLUNTARIO";
export type NivelOcupacao = "VERDE" | "AMARELO" | "VERMELHO";
export type StatusInfraestrutura = "NORMAL" | "ALERTA" | "CRITICO";

export interface UsuarioPerfil {
  id: number;
  nome: string;
  email: string;
  papel: PapelUsuario;
  idAbrigo: number | null;
  abrigo: string | null;
  redirecionarPara: string;
}

export interface ResumoOcupacao {
  capacidadeMaxima: number;
  lotacaoAtual: number;
  vagasDisponiveis: number;
  percentual: number;
  nivel: NivelOcupacao;
}

export interface AbrigoAdmin {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  chavePix: string | null;
  titularPix: string | null;
  latitude: number;
  longitude: number;
  capacidadeMaxima: number;
  lotacaoAtual: number;
  acolhidosNaoTriados: number;
  statusInfraestrutura: StatusInfraestrutura;
  ativo: boolean;
  ocupacao: ResumoOcupacao;
}

interface ContextoAdminValor {
  usuario: UsuarioPerfil;
  abrigos: AbrigoAdmin[];
  abrigoAtivo: AbrigoAdmin | null;
  idAbrigoAtivo: number | null;
  selecionarAbrigo: (id: number) => void;
  recarregarAbrigos: () => Promise<void>;
  sair: () => Promise<void>;
}

const ContextoAdmin = createContext<ContextoAdminValor | null>(null);

export function useAdmin(): ContextoAdminValor {
  const ctx = useContext(ContextoAdmin);
  if (!ctx) throw new Error("useAdmin deve ser usado dentro de AdminShell.");
  return ctx;
}

const CORES_OCUPACAO: Record<NivelOcupacao, string> = {
  VERDE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  AMARELO: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  VERMELHO: "bg-red-500/20 text-red-300 border-red-500/40",
};

const CORES_INFRA: Record<StatusInfraestrutura, string> = {
  NORMAL: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  ALERTA: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  CRITICO: "bg-red-500/20 text-red-200 border-red-500/50",
};

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<UsuarioPerfil | null>(null);
  const [abrigos, setAbrigos] = useState<AbrigoAdmin[]>([]);
  const [idAbrigoSelecionado, setIdAbrigoSelecionado] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState<string | null>(null);

  // Modal de alteração de senha
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [statusSenha, setStatusSenha] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const recarregarAbrigos = useCallback(async () => {
    const lista = await api<AbrigoAdmin[]>("/api/abrigos");
    setAbrigos(lista);
  }, []);

  useEffect(() => {
    let ativo = true;
    async function inicializar() {
      try {
        const [perfil, listaAbrigos] = await Promise.all([
          api<UsuarioPerfil>("/api/auth/me"),
          api<AbrigoAdmin[]>("/api/abrigos"),
        ]);
        if (!ativo) return;
        setUsuario(perfil);
        setAbrigos(listaAbrigos);

        if (perfil.idAbrigo) {
          setIdAbrigoSelecionado(perfil.idAbrigo);
        } else {
          const salvo = Number(window.localStorage.getItem("wtg_abrigo_admin"));
          const inicial =
            listaAbrigos.find((a) => a.id === salvo)?.id ??
            listaAbrigos.find((a) => a.ativo)?.id ??
            listaAbrigos[0]?.id ??
            null;
          setIdAbrigoSelecionado(inicial);
        }
      } catch (err) {
        if (!ativo) return;
        if (err instanceof ErroClienteApi && err.status === 401) {
          router.replace("/login");
          return;
        }
        setErroFatal(mensagemErro(err));
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    inicializar();
    return () => {
      ativo = false;
    };
  }, [router]);

  const selecionarAbrigo = useCallback((id: number) => {
    setIdAbrigoSelecionado(id);
    try {
      window.localStorage.setItem("wtg_abrigo_admin", String(id));
    } catch {
      // Ignora indisponibilidade de localStorage
    }
  }, []);

  const sair = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }, [router]);

  const idAbrigoAtivo = usuario?.papel === "ADMIN" ? idAbrigoSelecionado : (usuario?.idAbrigo ?? null);
  const abrigoAtivo = useMemo(
    () => abrigos.find((a) => a.id === idAbrigoAtivo) ?? null,
    [abrigos, idAbrigoAtivo],
  );

  async function alterarSenha(e: FormEvent) {
    e.preventDefault();
    setStatusSenha(null);
    setSalvandoSenha(true);
    try {
      await api("/api/auth/senha", {
        method: "PUT",
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      setStatusSenha({ tipo: "ok", texto: "Senha alterada com sucesso." });
      setSenhaAtual("");
      setNovaSenha("");
    } catch (err) {
      setStatusSenha({ tipo: "erro", texto: mensagemErro(err) });
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Carregando sessão operacional...</p>
        </div>
      </div>
    );
  }

  if (erroFatal || !usuario) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-slate-900 p-6 text-center space-y-4">
          <p className="text-red-300 font-semibold">{erroFatal ?? "Sessão expirada."}</p>
          <Link
            href="/login"
            className="inline-block rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950"
          >
            Ir para Login
          </Link>
        </div>
      </div>
    );
  }

  const abas = [
    ...(usuario.papel !== "VOLUNTARIO"
      ? [{ href: "/admin/dashboard", rotulo: "Dashboard & Triagem" }]
      : []),
    { href: "/admin/inventario", rotulo: "Inventário (Fast-CRUD)" },
    { href: "/admin/ocorrencias", rotulo: "Infraestrutura & Vias" },
    { href: "/admin/abrigados", rotulo: "Acolhidos & Vagas" },
    ...(usuario.papel !== "VOLUNTARIO"
      ? [
          {
            href: "/admin/geral",
            rotulo: usuario.papel === "ADMIN" ? "Administração & Auditoria" : "Equipe & Auditoria",
          },
        ]
      : []),
  ];

  return (
    <ContextoAdmin.Provider
      value={{
        usuario,
        abrigos,
        abrigoAtivo,
        idAbrigoAtivo,
        selecionarAbrigo,
        recarregarAbrigos,
        sair,
      }}
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Barra Superior */}
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href={usuario.redirecionarPara} className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg">
                  W
                </span>
                <div>
                  <span className="font-bold text-white leading-none block">WhereToGo</span>
                  <span className="text-[11px] text-slate-400">Painel Operacional</span>
                </div>
              </Link>

              {/* Seletor ou Emblema do Abrigo Ativo */}
              <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-800">
                {usuario.papel === "ADMIN" ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor="seletor-abrigo" className="text-xs text-slate-400">
                      Abrigo:
                    </label>
                    <select
                      id="seletor-abrigo"
                      value={idAbrigoAtivo ?? ""}
                      onChange={(e) => selecionarAbrigo(Number(e.target.value))}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                    >
                      {abrigos.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome} ({a.ocupacao.lotacaoAtual}/{a.ocupacao.capacidadeMaxima})
                          {!a.ativo ? " [INATIVO]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200">
                    {abrigoAtivo?.nome ?? usuario.abrigo ?? "Abrigo"}
                  </span>
                )}

                {abrigoAtivo && (
                  <>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${CORES_OCUPACAO[abrigoAtivo.ocupacao.nivel]}`}
                    >
                      Lotação: {abrigoAtivo.ocupacao.lotacaoAtual}/{abrigoAtivo.ocupacao.capacidadeMaxima} (
                      {abrigoAtivo.ocupacao.percentual}%)
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${CORES_INFRA[abrigoAtivo.statusInfraestrutura]}`}
                    >
                      Infra: {abrigoAtivo.statusInfraestrutura}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block mr-1">
                <p className="text-xs font-semibold text-white leading-tight">{usuario.nome}</p>
                <p className="text-[11px] text-amber-400 font-mono">{usuario.papel}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusSenha(null);
                  setModalSenhaAberto(true);
                }}
                className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Senha
              </button>
              <Link
                href="/"
                className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Mapa Público
              </Link>
              <button
                type="button"
                onClick={sair}
                className="rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/60 cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>

          {/* Barra Mobile do Abrigo + Navegação por Abas */}
          <div className="mx-auto max-w-7xl px-4 pb-2 md:pb-0 flex flex-col gap-2">
            {usuario.papel === "ADMIN" && (
              <div className="flex md:hidden items-center gap-2">
                <span className="text-xs text-slate-400">Abrigo:</span>
                <select
                  value={idAbrigoAtivo ?? ""}
                  onChange={(e) => selecionarAbrigo(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  {abrigos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} ({a.ocupacao.lotacaoAtual}/{a.ocupacao.capacidadeMaxima})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <nav className="flex items-center gap-1 overflow-x-auto pb-1">
              {abas.map((aba) => {
                const ativa = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
                return (
                  <Link
                    key={aba.href}
                    href={aba.href}
                    className={`whitespace-nowrap rounded-t-lg px-3.5 py-2 text-xs sm:text-sm font-semibold border-b-2 transition ${
                      ativa
                        ? "border-amber-400 text-amber-300 bg-slate-900/80"
                        : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    {aba.rotulo}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Conteúdo Principal */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>

        {/* Modal de Alteração de Senha */}
        {modalSenhaAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Alterar Minha Senha</h2>
                <button
                  type="button"
                  onClick={() => setModalSenhaAberto(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {statusSenha && (
                <div
                  className={`mb-4 rounded-xl border px-3.5 py-2.5 text-xs ${
                    statusSenha.tipo === "ok"
                      ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-200"
                      : "border-red-500/40 bg-red-950/60 text-red-200"
                  }`}
                >
                  {statusSenha.texto}
                </div>
              )}

              <form onSubmit={alterarSenha} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Senha atual</label>
                  <input
                    type="password"
                    required
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nova senha (mínimo 8 caracteres)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalSenhaAberto(false)}
                    className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoSenha}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {salvandoSenha ? "Salvando..." : "Atualizar Senha"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ContextoAdmin.Provider>
  );
}
