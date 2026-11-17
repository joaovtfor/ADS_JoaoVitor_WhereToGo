"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Botao, BotaoIcone, classesBotao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { FOCO, juntarClasses } from "@/components/ui/classes";
import { Icone } from "@/components/ui/icone";
import { Logo } from "@/components/ui/logo";
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
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

  // Login com Google e auto-cadastro de voluntário
  const [configGoogle, setConfigGoogle] = useState<ConfigGoogle>({
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null,
    modoSimulado: false,
  });
  const [scriptGooglePronto, setScriptGooglePronto] = useState(false);
  const [abrigos, setAbrigos] = useState<AbrigoPublicoResumo[]>([]);
  const [idAbrigoCadastro, setIdAbrigoCadastro] = useState<number | "">("");

  // Formulário de Google simulado (ambiente sem GOOGLE_CLIENT_ID)
  const [modalNovoGoogleAberto, setModalNovoGoogleAberto] = useState(false);
  const [demoAberto, setDemoAberto] = useState(false);
  const [nomeSimulado, setNomeSimulado] = useState("");
  const [emailSimulado, setEmailSimulado] = useState("");

  // Etapas depois do login com Google (escolha do abrigo ou aguardando aprovação)
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
    if (new URLSearchParams(window.location.search).get("sessao") === "expirada") {
      void Promise.resolve().then(() => setErro("Sua sessão expirou ou foi encerrada. Entre novamente para continuar."));
    }
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
          setCarregando(false);
          return;
        }

        if (resposta.status === "PENDENTE_APROVACAO") {
          setCredencialPendente(null);
          setModalNovoGoogleAberto(false);
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

  async function entrarComDemo(conta: (typeof CONTAS_DEMONSTRACAO)[number]) {
    const senhaPadrao = "WhereToGo@2026";
    setEmail(conta.email);
    setSenha(senhaPadrao);
    setErro(null);
    setCadastroPendente(null);
    setCarregando(true);

    try {
      const resultado = await api<RespostaLogin>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: conta.email, senha: senhaPadrao }),
      });
      window.location.assign(resultado.redirecionarPara);
      return;
    } catch (errLogin) {
      if (configGoogle.modoSimulado) {
        try {
          const respostaGoogle = await api<RespostaGoogle>("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({
              credencialSimulada: { nome: conta.nome, email: conta.email },
            }),
          });
          if (respostaGoogle.status === "AUTENTICADO") {
            window.location.assign(respostaGoogle.redirecionarPara);
            return;
          }
        } catch {
          // Mantém o erro original do login por senha abaixo
        }
      }
      setErro(mensagemErro(errLogin));
      setCarregando(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const formularioGoogleAberto = modalNovoGoogleAberto && configGoogle.modoSimulado;

  return (
    <div className="flex min-h-dvh flex-col bg-fundo px-4 py-4 text-texto sm:px-6">
      {configGoogle.clientId && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptGooglePronto(true)} />
      )}

      <header className="mx-auto flex w-full max-w-sm items-center justify-between">
        <Link href="/" prefetch={false} className={juntarClasses("flex items-center rounded-controle", FOCO)}>
          <Logo marca="completa" alt="WhereToGo" className="h-11" />
        </Link>
        <Link href="/" prefetch={false} className={classesBotao("fantasma", "sm")}>
          <Icone de={ArrowLeft} tamanho={16} />
          Mapa público
        </Link>
      </header>

      <main className="mx-auto my-auto w-full max-w-sm py-8">
        <h1 className="text-titulo font-semibold text-texto">Acesso da equipe</h1>
        <p className="mt-1 text-corpo text-texto-2">Para coordenadores e voluntários dos abrigos.</p>

        {erro && (
          <p role="alert" className="mt-5 rounded-controle bg-critico/12 p-3 text-meta text-critico-claro">
            {erro}
          </p>
        )}

        {cadastroPendente && (
          <div role="status" className="mt-5 space-y-2 rounded-controle bg-ok/12 p-3 text-meta">
            <p className="font-medium text-ok-claro">Solicitação de acesso registrada</p>
            <p className="text-texto-2">{cadastroPendente.mensagem}</p>
            <p className="text-texto-2">
              {cadastroPendente.usuario.nome} ({cadastroPendente.usuario.email})
              {cadastroPendente.usuario.abrigo && <> · {cadastroPendente.usuario.abrigo}</>}
            </p>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setCadastroPendente(null)}>
              Voltar ao login
            </Botao>
          </div>
        )}

        {credencialPendente ? (
          // Conta Google nova: falta escolher o abrigo onde a pessoa vai atuar.
          <form onSubmit={concluirSolicitacaoAbrigo} className="mt-6 space-y-4">
            <div>
              <h2 className="text-corpo font-medium text-texto">Olá, {credencialPendente.perfilGoogle.nome}</h2>
              <p className="mt-1 text-meta text-texto-2">
                Conta verificada ({credencialPendente.perfilGoogle.email}). Escolha o abrigo onde você vai atuar; a coordenação aprova o seu acesso.
              </p>
            </div>
            <Campo rotulo="Abrigo de atuação">
              <select required value={idAbrigoCadastro} onChange={(e) => setIdAbrigoCadastro(Number(e.target.value))} className={CLASSES_CAMPO}>
                {abrigos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} ({a.endereco})
                  </option>
                ))}
              </select>
            </Campo>
            <div className="flex gap-2">
              <Botao type="submit" variante="primaria" disabled={carregando || !idAbrigoCadastro} className="flex-1">
                {carregando ? "Enviando..." : "Solicitar acesso"}
              </Botao>
              <Botao onClick={() => setCredencialPendente(null)}>Cancelar</Botao>
            </div>
          </form>
        ) : (
          <>
            <form onSubmit={submeter} className="mt-6 space-y-4">
              <Campo rotulo="E-mail">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@exemplo.org"
                  className={CLASSES_CAMPO}
                />
              </Campo>

              <Campo rotulo="Senha">
                <span className="relative block">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className={`${CLASSES_CAMPO} pr-12`}
                  />
                  <BotaoIcone
                    icone={mostrarSenha ? EyeOff : Eye}
                    rotulo={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute top-0 right-0"
                  />
                </span>
              </Campo>

              <Botao type="submit" variante="primaria" disabled={carregando} className="w-full">
                {carregando ? "Entrando..." : "Entrar"}
              </Botao>
            </form>

            <div className="my-5 flex items-center gap-3 text-meta text-texto-3">
              <span className="h-px flex-1 bg-borda" />
              ou
              <span className="h-px flex-1 bg-borda" />
            </div>

            {configGoogle.clientId ? (
              <div ref={containerBotaoGoogleRef} className="flex min-h-11 justify-center" />
            ) : (
              <Botao aria-expanded={formularioGoogleAberto} onClick={() => setModalNovoGoogleAberto((v) => !v)} className="w-full">
                <IconeGoogle />
                Continuar com o Google
              </Botao>
            )}

            {formularioGoogleAberto && (
              <form onSubmit={submeterNovoGoogleSimulado} className="mt-4 space-y-3 border-t border-borda pt-4">
                <p className="text-meta text-texto-2">
                  Se o e-mail já tiver acesso, você entra direto. Se for novo, o pedido vai para aprovação da coordenação do abrigo escolhido.
                </p>
                <Campo rotulo="Seu nome">
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={nomeSimulado}
                    onChange={(e) => setNomeSimulado(e.target.value)}
                    placeholder="Maria Oliveira"
                    className={CLASSES_CAMPO}
                  />
                </Campo>
                <Campo rotulo="E-mail do Google">
                  <input
                    type="email"
                    required
                    value={emailSimulado}
                    onChange={(e) => setEmailSimulado(e.target.value)}
                    placeholder="maria@gmail.com"
                    className={CLASSES_CAMPO}
                  />
                </Campo>
                <Campo rotulo="Abrigo (para novos voluntários)">
                  <select value={idAbrigoCadastro} onChange={(e) => setIdAbrigoCadastro(Number(e.target.value))} className={CLASSES_CAMPO}>
                    {abrigos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Botao type="submit" disabled={carregando} className="w-full">
                  {carregando ? "Validando..." : "Entrar ou solicitar acesso"}
                </Botao>
              </form>
            )}
          </>
        )}

        <section className="mt-8 border-t border-borda pt-4">
          <Botao
            tamanho="sm"
            variante="fantasma"
            icone={ChevronDown}
            aria-expanded={demoAberto}
            aria-controls="contas-demonstracao"
            onClick={() => setDemoAberto((v) => !v)}
            className="-ml-3"
          >
            Contas de demonstração
          </Botao>
          {demoAberto && (
            <ul id="contas-demonstracao" className="mt-1">
              {CONTAS_DEMONSTRACAO.map((conta) => (
                <li key={conta.email} className="border-b border-borda last:border-b-0">
                  <button
                    type="button"
                    disabled={carregando}
                    onClick={() => void entrarComDemo(conta)}
                    className={juntarClasses(
                      "-mx-2 flex w-[calc(100%+1rem)] flex-col rounded-controle px-2 py-2.5 text-left transition-colors hover:bg-superficie-2 disabled:opacity-50",
                      FOCO,
                    )}
                  >
                    <span className="text-corpo text-texto">{conta.rotulo}</span>
                    <span className="text-meta text-texto-3">{conta.descricao}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
