"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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

type RespostaGoogle =
  | ({ status: "AUTENTICADO" } & RespostaLogin)
  | {
      status: "REQUER_ABRIGO";
      perfilGoogle: { nome: string; email: string };
      mensagem: string;
    }
  | {
      status: "PENDENTE_APROVACAO";
      mensagem: string;
      usuario: {
        id: number;
        nome: string;
        email: string;
        papel: "ADMIN" | "COORDENADOR" | "VOLUNTARIO";
        idAbrigo: number | null;
        abrigo: string | null;
      };
    };

interface ConfigGoogle {
  clientId: string | null;
  modoSimulado: boolean;
}

interface AbrigoPublicoResumo {
  id: number;
  nome: string;
  endereco: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: () => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill";
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

const CONTAS_DEMONSTRACAO = [
  {
    rotulo: "Coordenador • Central UPF",
    descricao: "Visão Geral, Estoque, Infra e Acolhidos",
    email: "coordenador@wheretogo.local",
    nome: "Coordenação - Abrigo Central UPF",
  },
  {
    rotulo: "Voluntário • Central UPF",
    descricao: "Operação rápida de Estoque e Check-in",
    email: "voluntario@wheretogo.local",
    nome: "Voluntariado - Abrigo Central UPF",
  },
  {
    rotulo: "Administração Geral",
    descricao: "Governança de abrigos, catálogo e equipe",
    email: "admin@wheretogo.local",
    nome: "Administração Geral",
  },
  {
    rotulo: "Coordenador • Ginásio Centro",
    descricao: "Gestão operacional do Ginásio Municipal",
    email: "coordenador.centro@wheretogo.local",
    nome: "Coordenação - Ginásio Municipal",
  },
] as const;

function IconeGoogle() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  );
}

export default function PaginaLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Estado Google One Tap & Auto-Cadastro
  const [configGoogle, setConfigGoogle] = useState<ConfigGoogle>({
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null,
    modoSimulado: false,
  });
  const [scriptGooglePronto, setScriptGooglePronto] = useState(false);
  const [abrigos, setAbrigos] = useState<AbrigoPublicoResumo[]>([]);
  const [idAbrigoCadastro, setIdAbrigoCadastro] = useState<number | "">("");

  // Prompt flutuante One Tap (modo simulado quando sem GOOGLE_CLIENT_ID)
  const [oneTapVisivel, setOneTapVisivel] = useState(true);
  const [modalNovoGoogleAberto, setModalNovoGoogleAberto] = useState(false);
  const [nomeSimulado, setNomeSimulado] = useState("");
  const [emailSimulado, setEmailSimulado] = useState("");

  // Etapas pós-toque no Google One Tap (seleção de abrigo ou aguardando aprovação)
  const [credencialPendente, setCredencialPendente] = useState<{
    credential?: string;
    credencialSimulada?: { nome: string; email: string };
    perfilGoogle: { nome: string; email: string };
  } | null>(null);
  const [cadastroPendente, setCadastroPendente] = useState<{
    mensagem: string;
    usuario: { nome: string; email: string; abrigo: string | null };
  } | null>(null);

  const containerBotaoGoogleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let ativo = true;
    api<{ redirecionarPara: string }>("/api/auth/me")
      .then((sessao) => {
        if (ativo && sessao?.redirecionarPara) {
          window.location.replace(sessao.redirecionarPara);
        }
      })
      .catch(() => {
        // Não autenticado: permanece na tela de login.
      });

    api<ConfigGoogle>("/api/auth/google")
      .then((cfg) => {
        if (!ativo) return;
        setConfigGoogle({
          clientId: cfg.clientId ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null,
          modoSimulado: cfg.modoSimulado,
        });
      })
      .catch(() => {
        // Ignora falha silenciosamente
      });

    api<AbrigoPublicoResumo[]>("/api/public/abrigos")
      .then((lista) => {
        if (!ativo) return;
        setAbrigos(lista);
        if (lista[0]?.id) setIdAbrigoCadastro(lista[0].id);
      })
      .catch(() => {
        // Ignora falha silenciosamente
      });

    return () => {
      ativo = false;
    };
  }, []);

  const autenticarViaGoogle = useCallback(
    async (opcoes: {
      credential?: string;
      credencialSimulada?: { nome: string; email: string };
      idAbrigo?: number;
    }) => {
      setErro(null);
      setCadastroPendente(null);
      setCarregando(true);
      try {
        const resposta = await api<RespostaGoogle>("/api/auth/google", {
          method: "POST",
          body: JSON.stringify(opcoes),
        });

        if (resposta.status === "AUTENTICADO") {
          window.location.assign(resposta.redirecionarPara);
          return;
        }

        if (resposta.status === "REQUER_ABRIGO") {
          setCredencialPendente({
            credential: opcoes.credential,
            credencialSimulada: opcoes.credencialSimulada,
            perfilGoogle: resposta.perfilGoogle,
          });
          setModalNovoGoogleAberto(false);
          setOneTapVisivel(false);
          setCarregando(false);
          return;
        }

        if (resposta.status === "PENDENTE_APROVACAO") {
          setCredencialPendente(null);
          setModalNovoGoogleAberto(false);
          setOneTapVisivel(false);
          setCadastroPendente({
            mensagem: resposta.mensagem,
            usuario: {
              nome: resposta.usuario.nome,
              email: resposta.usuario.email,
              abrigo: resposta.usuario.abrigo,
            },
          });
          setCarregando(false);
        }
      } catch (err) {
        setErro(mensagemErro(err));
        setCarregando(false);
      }
    },
    [],
  );

  // Inicializa o Google Identity Services real quando há clientId configurado
  useEffect(() => {
    if (!configGoogle.clientId || !scriptGooglePronto || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: configGoogle.clientId,
      callback: (response) => {
        void autenticarViaGoogle({ credential: response.credential });
      },
      auto_select: false,
      cancel_on_tap_outside: false,
    });

    window.google.accounts.id.prompt();

    if (containerBotaoGoogleRef.current) {
      containerBotaoGoogleRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerBotaoGoogleRef.current, {
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 360,
      });
    }
  }, [configGoogle.clientId, scriptGooglePronto, autenticarViaGoogle]);

  async function submeter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setCadastroPendente(null);
    setCarregando(true);
    try {
      const resultado = await api<RespostaLogin>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      });
      window.location.assign(resultado.redirecionarPara);
    } catch (err) {
      setErro(mensagemErro(err));
      setCarregando(false);
    }
  }

  async function concluirSolicitacaoAbrigo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!credencialPendente || !idAbrigoCadastro) return;
    await autenticarViaGoogle({
      credential: credencialPendente.credential,
      credencialSimulada: credencialPendente.credencialSimulada,
      idAbrigo: Number(idAbrigoCadastro),
    });
  }

  async function submeterNovoGoogleSimulado(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await autenticarViaGoogle({
      credencialSimulada: {
        nome: nomeSimulado.trim(),
        email: emailSimulado.trim().toLowerCase(),
      },
      idAbrigo: idAbrigoCadastro ? Number(idAbrigoCadastro) : undefined,
    });
  }

  function preencherDemo(emailDemo: string) {
    setEmail(emailDemo);
    setSenha("WhereToGo@2026");
    setErro(null);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      {configGoogle.clientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setScriptGooglePronto(true)}
        />
      )}

      {/* Widget Flutuante Google One Tap (Modo Simulado quando sem GOOGLE_CLIENT_ID) */}
      {configGoogle.modoSimulado && oneTapVisivel && !credencialPendente && !cadastroPendente && (
        <aside
          aria-label="Google One Tap"
          className="fixed top-4 right-4 z-50 w-84 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <IconeGoogle />
              <span className="text-xs font-bold text-white">Fazer login com o Google</span>
            </div>
            <button
              type="button"
              onClick={() => setOneTapVisivel(false)}
              className="rounded-lg px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              aria-label="Fechar Google One Tap"
            >
              ✕
            </button>
          </div>

          <p className="mt-2.5 text-[11px] text-slate-400 leading-snug">
            Toque em uma conta para entrar com 1 clique ou solicite seu cadastro rápido de voluntário:
          </p>

          <div className="mt-2.5 space-y-1.5">
            {CONTAS_DEMONSTRACAO.slice(0, 2).map((conta) => (
              <button
                key={conta.email}
                type="button"
                disabled={carregando}
                onClick={() =>
                  autenticarViaGoogle({
                    credencialSimulada: { nome: conta.nome, email: conta.email },
                  })
                }
                className="w-full flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-left hover:border-amber-500/50 hover:bg-slate-800/80 transition cursor-pointer disabled:opacity-50"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                  {conta.rotulo[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{conta.rotulo}</p>
                  <p className="text-[11px] text-slate-400 truncate">{conta.email}</p>
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setModalNovoGoogleAberto(true);
                setOneTapVisivel(false);
              }}
              className="w-full rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25 transition cursor-pointer"
            >
              + Nova conta Google (Auto-cadastro)
            </button>
          </div>
        </aside>
      )}

      <header className="mx-auto w-full max-w-md flex items-center justify-between py-2">
        <Link href="/" prefetch={false} className="flex items-center gap-2.5 text-white hover:opacity-90">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg">
            W
          </span>
          <div>
            <span className="font-bold tracking-tight text-lg block leading-none">WhereToGo</span>
            <span className="text-xs text-slate-400">Rede de Abrigos e Apoio Humanitário</span>
          </div>
        </Link>
        <Link
          href="/"
          prefetch={false}
          className="min-h-10 inline-flex items-center rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          ← Mapa Público
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md my-auto py-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl">
          <div className="mb-5">
            <span className="inline-block rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-300 mb-2">
              Acesso Operacional
            </span>
            <h1 className="text-2xl font-bold text-white">Entrar na Operação</h1>
            <p className="mt-1 text-sm text-slate-400">
              Acesse com 1 toque pelo Google One Tap ou informe suas credenciais.
            </p>
          </div>

          {erro && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200"
            >
              <p className="font-semibold text-rose-300">Não foi possível concluir</p>
              <p className="mt-0.5">{erro}</p>
            </div>
          )}

          {/* Confirmação de Cadastro Enviado / Pendente de Aprovação */}
          {cadastroPendente && (
            <div
              role="status"
              className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4 space-y-2.5 text-sm"
            >
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <span>✓ Solicitação de Acesso Registrada</span>
              </div>
              <p className="text-slate-200 text-xs leading-relaxed">{cadastroPendente.mensagem}</p>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs space-y-1">
                <p className="text-slate-300">
                  <strong>Voluntário(a):</strong> {cadastroPendente.usuario.nome} ({cadastroPendente.usuario.email})
                </p>
                {cadastroPendente.usuario.abrigo && (
                  <p className="text-amber-300">
                    <strong>Abrigo solicitado:</strong> {cadastroPendente.usuario.abrigo}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCadastroPendente(null)}
                className="text-xs font-semibold text-emerald-300 hover:underline cursor-pointer"
              >
                ← Voltar ao login
              </button>
            </div>
          )}

          {/* Etapa complementar quando uma conta Google real nova precisa escolher o abrigo */}
          {credencialPendente ? (
            <form onSubmit={concluirSolicitacaoAbrigo} className="mb-6 rounded-2xl border border-sky-500/40 bg-slate-950 p-4 space-y-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                  Auto-cadastro Google One Tap
                </span>
                <h2 className="text-base font-bold text-white mt-0.5">
                  Olá, {credencialPendente.perfilGoogle.nome}!
                </h2>
                <p className="text-xs text-slate-400">
                  Conta verificada ({credencialPendente.perfilGoogle.email}). Escolha o abrigo onde você vai atuar:
                </p>
              </div>

              <div>
                <label htmlFor="abrigo-google" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Abrigo de atuação
                </label>
                <select
                  id="abrigo-google"
                  required
                  value={idAbrigoCadastro}
                  onChange={(e) => setIdAbrigoCadastro(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                >
                  {abrigos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} — {a.endereco}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={carregando || !idAbrigoCadastro}
                  className="flex-1 min-h-11 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {carregando ? "Enviando..." : "Solicitar Acesso como Voluntário"}
                </button>
                <button
                  type="button"
                  onClick={() => setCredencialPendente(null)}
                  className="min-h-11 rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Botão Principal Google One Tap */}
              <div className="mb-5">
                {configGoogle.clientId ? (
                  <div ref={containerBotaoGoogleRef} className="flex justify-center min-h-11" />
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setModalNovoGoogleAberto((v) => !v)}
                      className="w-full min-h-12 flex items-center justify-center gap-3 rounded-xl border border-slate-700 bg-white px-4 py-3 text-sm font-bold text-slate-900 hover:bg-slate-100 transition cursor-pointer shadow"
                    >
                      <IconeGoogle />
                      <span>Continuar com o Google (One Tap)</span>
                    </button>
                  </div>
                )}

                {/* Modal Inline de Auto-Cadastro / Login Google Simulado */}
                {modalNovoGoogleAberto && configGoogle.modoSimulado && (
                  <form
                    onSubmit={submeterNovoGoogleSimulado}
                    className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <IconeGoogle />
                        Acesso ou Auto-Cadastro via Google
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalNovoGoogleAberto(false)}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Se o e-mail já estiver ativo, você entra direto. Se for novo, sua solicitação vai para aprovação do Coordenador do abrigo escolhido.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Seu Nome (Conta Google)</label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={nomeSimulado}
                        onChange={(e) => setNomeSimulado(e.target.value)}
                        placeholder="Ex.: Maria Oliveira"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">E-mail Google</label>
                      <input
                        type="email"
                        required
                        value={emailSimulado}
                        onChange={(e) => setEmailSimulado(e.target.value)}
                        placeholder="maria.voluntaria@gmail.com"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Abrigo (para novos voluntários)
                      </label>
                      <select
                        value={idAbrigoCadastro}
                        onChange={(e) => setIdAbrigoCadastro(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        {abrigos.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={carregando}
                      className="w-full min-h-11 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                    >
                      {carregando ? "Validando conta Google..." : "Entrar / Solicitar Cadastro com Google"}
                    </button>
                  </form>
                )}

                <div className="relative my-5 flex items-center justify-center">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    ou com e-mail e senha
                  </span>
                  <div className="border-t border-slate-800 w-full" />
                </div>
              </div>

              <form onSubmit={submeter} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-200 mb-1.5">
                    E-mail
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
                      className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
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
                  {carregando ? "Entrando..." : "Acessar Painel"}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-400 mb-2.5">
              Contas de demonstração (toque para preencher):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CONTAS_DEMONSTRACAO.map((conta) => (
                <button
                  key={conta.email}
                  type="button"
                  onClick={() => preencherDemo(conta.email)}
                  className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left hover:border-amber-500/50 hover:bg-slate-800/70 transition cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-100">{conta.rotulo}</span>
                  <span className="text-[11px] text-slate-400 mt-0.5 leading-snug">{conta.descricao}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-xs text-slate-500 py-2">
        WhereToGo • Operação Humanitária e Gestão de Abrigos
      </footer>
    </div>
  );
}
