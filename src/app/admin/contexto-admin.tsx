"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function ToastFlutuante({
  erro,
  aviso,
  aoFecharErro,
  aoFecharAviso,
}: {
  erro: string | null;
  aviso: string | null;
  aoFecharErro: () => void;
  aoFecharAviso: () => void;
}) {
  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => {
      aoFecharAviso();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [aviso, aoFecharAviso]);

  if (!erro && !aviso) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:w-full sm:max-w-sm z-50 flex flex-col gap-2 pointer-events-none"
    >
      {erro && (
        <div
          role="alert"
          className="pointer-events-auto flex items-start justify-between gap-3 rounded-2xl border border-rose-500/50 bg-slate-900/95 px-4 py-3 text-sm text-rose-200 shadow-2xl backdrop-blur"
        >
          <div className="min-w-0">
            <p className="font-bold text-rose-300 text-xs uppercase tracking-wider">Atenção</p>
            <p className="mt-0.5 leading-snug">{erro}</p>
          </div>
          <button
            type="button"
            onClick={aoFecharErro}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            aria-label="Fechar alerta de erro"
          >
            ✕
          </button>
        </div>
      )}
      {aviso && (
        <div
          role="status"
          className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/50 bg-slate-900/95 px-4 py-3 text-sm text-emerald-200 shadow-2xl backdrop-blur"
        >
          <p className="font-medium leading-snug">✓ {aviso}</p>
          <button
            type="button"
            onClick={aoFecharAviso}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            aria-label="Fechar aviso"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

const CORES_OCUPACAO: Record<NivelOcupacao, string> = {
  VERDE: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60",
  AMARELO: "bg-amber-950/70 text-amber-300 border-amber-600/60",
  VERMELHO: "bg-rose-950/70 text-rose-300 border-rose-600/60",
};

const CORES_INFRA: Record<StatusInfraestrutura, string> = {
  NORMAL: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60",
  ALERTA: "bg-amber-950/70 text-amber-300 border-amber-600/60",
  CRITICO: "bg-rose-950/70 text-rose-200 border-rose-600/60",
};

const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  ADMIN: "Administração Geral",
  COORDENADOR: "Coordenador",
  VOLUNTARIO: "Voluntário",
};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<UsuarioPerfil | null>(null);
  const [abrigos, setAbrigos] = useState<AbrigoAdmin[]>([]);
  const [idAbrigoSelecionado, setIdAbrigoSelecionado] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [reativandoAbrigo, setReativandoAbrigo] = useState(false);

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
          window.location.assign(new URL("/login", window.location.origin).href);
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
  }, []);

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
      window.location.assign(new URL("/login", window.location.origin).href);
    }
  }, []);

  const idAbrigoAtivo = usuario?.papel === "ADMIN" ? idAbrigoSelecionado : (usuario?.idAbrigo ?? null);
  const abrigoAtivo = useMemo(
    () => abrigos.find((a) => a.id === idAbrigoAtivo) ?? null,
    [abrigos, idAbrigoAtivo],
  );

  async function reativarAbrigoAtual() {
    if (!abrigoAtivo) return;
    setReativandoAbrigo(true);
    try {
      await api(`/api/abrigos/${abrigoAtivo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: true }),
      });
      await recarregarAbrigos();
    } finally {
      setReativandoAbrigo(false);
    }
  }

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
          <p className="text-sm text-slate-400">Carregando operação...</p>
        </div>
      </div>
    );
  }

  if (erroFatal || !usuario) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-center space-y-4">
          <p className="text-rose-300 font-semibold">{erroFatal ?? "Sessão expirada."}</p>
          <Link
            href="/login"
            prefetch={false}
            className="inline-block rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950"
          >
            Ir para Login
          </Link>
        </div>
      </div>
    );
  }

  // Navegação alinhada estritamente ao RBAC e proxy.ts
  const abas =
    usuario.papel === "VOLUNTARIO"
      ? [
          { href: "/admin/inventario", icone: "📦", rotulo: "Estoque", rotuloCurto: "Estoque" },
          { href: "/admin/abrigados", icone: "👥", rotulo: "Acolhidos & Check-in", rotuloCurto: "Acolhidos" },
        ]
      : [
          { href: "/admin/dashboard", icone: "📊", rotulo: "Visão Geral", rotuloCurto: "Visão Geral" },
          { href: "/admin/inventario", icone: "📦", rotulo: "Estoque", rotuloCurto: "Estoque" },
          { href: "/admin/ocorrencias", icone: "🚧", rotulo: "Infraestrutura", rotuloCurto: "Infra" },
          { href: "/admin/abrigados", icone: "👥", rotulo: "Acolhidos", rotuloCurto: "Acolhidos" },
          {
            href: "/admin/geral",
            icone: usuario.papel === "ADMIN" ? "🌐" : "🛡️",
            rotulo: usuario.papel === "ADMIN" ? "Governança Global" : "Equipe & Auditoria",
            rotuloCurto: "Gestão",
          },
        ];

  const ehEscopoGlobal = usuario.papel === "ADMIN" && pathname.startsWith("/admin/geral");

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
        {/* Barra Superior Enxuta */}
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href={usuario.redirecionarPara} prefetch={false} className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg">
                  W
                </span>
                <div>
                  <span className="font-bold text-white leading-none block">WhereToGo</span>
                  <span className="text-[11px] text-slate-400">{ROTULO_PAPEL[usuario.papel]}</span>
                </div>
              </Link>

              {/* Contexto do Abrigo ou Indicador de Escopo Global (Desktop) */}
              <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-800">
                {ehEscopoGlobal ? (
                  <span className="rounded-lg border border-indigo-500/40 bg-indigo-950/60 px-3 py-1 text-xs font-semibold text-indigo-200">
                    🌐 Escopo Global • Todos os Abrigos ({abrigos.length})
                  </span>
                ) : usuario.papel === "ADMIN" ? (
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
                          {!a.ativo ? " [ARQUIVADO]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200">
                    {abrigoAtivo?.nome ?? usuario.abrigo ?? "Abrigo"}
                  </span>
                )}

                {!ehEscopoGlobal && abrigoAtivo && (
                  <>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${CORES_OCUPACAO[abrigoAtivo.ocupacao.nivel]}`}
                    >
                      Vagas: {abrigoAtivo.ocupacao.lotacaoAtual}/{abrigoAtivo.ocupacao.capacidadeMaxima} (
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
                <p className="text-[11px] text-amber-400">{ROTULO_PAPEL[usuario.papel]}</p>
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
                prefetch={false}
                className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Mapa
              </Link>
              <button
                type="button"
                onClick={sair}
                className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/60 cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>

          {/* Barra Mobile de Contexto do Abrigo */}
          <div className="mx-auto max-w-7xl px-4 pb-2 md:pb-0 flex flex-col gap-2">
            <div className="flex md:hidden items-center justify-between gap-2">
              {ehEscopoGlobal ? (
                <span className="w-full rounded-lg border border-indigo-500/40 bg-indigo-950/50 px-3 py-1.5 text-xs font-semibold text-indigo-200 text-center">
                  🌐 Escopo Global • Todos os Abrigos ({abrigos.length})
                </span>
              ) : usuario.papel === "ADMIN" ? (
                <select
                  aria-label="Selecionar abrigo"
                  value={idAbrigoAtivo ?? ""}
                  onChange={(e) => selecionarAbrigo(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  {abrigos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} ({a.ocupacao.lotacaoAtual}/{a.ocupacao.capacidadeMaxima})
                      {!a.ativo ? " [ARQUIVADO]" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate text-xs font-semibold text-slate-300">
                  📍 {abrigoAtivo?.nome ?? usuario.abrigo}
                </span>
              )}

              {!ehEscopoGlobal && abrigoAtivo && (
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${CORES_OCUPACAO[abrigoAtivo.ocupacao.nivel]}`}
                >
                  {abrigoAtivo.ocupacao.lotacaoAtual}/{abrigoAtivo.ocupacao.capacidadeMaxima}
                </span>
              )}
            </div>

            {/* Abas Horizontais (Desktop >= md) */}
            <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
              {abas.map((aba) => {
                const ativa = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
                return (
                  <Link
                    key={aba.href}
                    href={aba.href}
                    prefetch={false}
                    className={`whitespace-nowrap rounded-t-lg px-3.5 py-2 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center gap-1.5 ${
                      ativa
                        ? "border-amber-400 text-amber-300 bg-slate-900/80"
                        : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <span>{aba.icone}</span>
                    <span>{aba.rotulo}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Banner de Aviso caso o abrigo selecionado esteja inativo/arquivado */}
        {!ehEscopoGlobal && abrigoAtivo && !abrigoAtivo.ativo && (
          <div className="border-b border-amber-500/40 bg-amber-950/60 px-4 py-2.5">
            <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
              <span>
                ⚠️ <strong>{abrigoAtivo.nome}</strong> está arquivado (somente leitura). Reative o abrigo para
                registrar movimentações, check-in ou alertas.
              </span>
              {usuario.papel === "ADMIN" && (
                <button
                  type="button"
                  disabled={reativandoAbrigo}
                  onClick={reativarAbrigoAtual}
                  className="rounded-lg bg-amber-500 px-3 py-1 font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {reativandoAbrigo ? "Reativando..." : "Reativar Abrigo"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Conteúdo Principal (com padding-bottom extra no mobile por conta da Bottom Bar) */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 pb-24 md:pb-8">{children}</main>

        {/* Barra de Navegação Inferior Fixa no Mobile (< md) — Ergonomia Thumb-First */}
        <nav
          aria-label="Navegação principal mobile"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-2 py-1"
        >
          <div className="mx-auto max-w-md flex items-center justify-around gap-1">
            {abas.map((aba) => {
              const ativa = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
              return (
                <Link
                  key={aba.href}
                  href={aba.href}
                  prefetch={false}
                  className={`min-h-13 flex-1 flex flex-col items-center justify-center rounded-xl py-1 px-1.5 text-[11px] font-semibold transition ${
                    ativa
                      ? "bg-amber-500/15 text-amber-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="text-base leading-none mb-1">{aba.icone}</span>
                  <span className="truncate max-w-full">{aba.rotuloCurto}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Modal de Alteração de Senha */}
        {modalSenhaAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Alterar Minha Senha</h2>
                <button
                  type="button"
                  onClick={() => setModalSenhaAberto(false)}
                  className="text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {statusSenha && (
                <div
                  className={`mb-4 rounded-xl border px-3.5 py-2.5 text-xs ${
                    statusSenha.tipo === "ok"
                      ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-200"
                      : "border-rose-500/40 bg-rose-950/60 text-rose-200"
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalSenhaAberto(false)}
                    className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoSenha}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
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
