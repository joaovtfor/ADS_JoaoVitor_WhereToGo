"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { CircleUser, KeyRound, LayoutDashboard, LogOut, Map, Package, Settings, TriangleExclamationPoint, Users, type LucideIcon } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { FOCO, juntarClasses } from "@/components/ui/classes";
import { Icone } from "@/components/ui/icone";
import { Logo } from "@/components/ui/logo";
import { CLASSES_ITEM_MENU, ItemMenu, Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { SeloStatus, type NivelStatus } from "@/components/ui/selo-status";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ROTULO_PAPEL, ROTULO_STATUS_INFRA } from "./rotulos";

// As telas do painel importam o toast daqui.
export { ToastFlutuante } from "@/components/ui/toast";

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
  aceitaPets: boolean;
  acessivelPcd: boolean;
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

const NIVEL_OCUPACAO: Record<NivelOcupacao, NivelStatus> = { VERDE: "ok", AMARELO: "atencao", VERMELHO: "critico" };
const NIVEL_INFRA: Record<StatusInfraestrutura, NivelStatus> = { NORMAL: "ok", ALERTA: "atencao", CRITICO: "critico" };

// Último abrigo escolhido pelo ADMIN, guardado no navegador. Lido com
// useSyncExternalStore para o HTML do servidor e a primeira renderização no
// navegador coincidirem (o servidor não conhece o localStorage).
const CHAVE_ABRIGO = "wtg_abrigo_admin";
const EVENTO_ABRIGO = "wtg:abrigo-admin";

function assinarAbrigoSalvo(aoMudar: () => void) {
  window.addEventListener("storage", aoMudar);
  window.addEventListener(EVENTO_ABRIGO, aoMudar);
  return () => {
    window.removeEventListener("storage", aoMudar);
    window.removeEventListener(EVENTO_ABRIGO, aoMudar);
  };
}

function lerAbrigoSalvo(): number | null {
  try {
    const id = Number(window.localStorage.getItem(CHAVE_ABRIGO));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null; // localStorage indisponível
  }
}

interface Aba {
  href: string;
  icone: LucideIcon;
  rotulo: string;
  /** Versão que cabe na barra inferior do celular (cinco itens em 375 px). */
  rotuloCurto?: string;
}

/** Navegação alinhada ao RBAC e ao proxy.ts: cada perfil vê só o que pode abrir. */
function abasDoPapel(papel: PapelUsuario): Aba[] {
  if (papel === "VOLUNTARIO") {
    return [
      { href: "/admin/inventario", icone: Package, rotulo: "Estoque" },
      { href: "/admin/abrigados", icone: Users, rotulo: "Acolhidos" },
    ];
  }
  return [
    { href: "/admin/dashboard", icone: LayoutDashboard, rotulo: "Visão geral", rotuloCurto: "Resumo" },
    { href: "/admin/inventario", icone: Package, rotulo: "Estoque" },
    { href: "/admin/ocorrencias", icone: TriangleExclamationPoint, rotulo: "Infra" },
    { href: "/admin/abrigados", icone: Users, rotulo: "Acolhidos" },
    { href: "/admin/geral", icone: Settings, rotulo: papel === "ADMIN" ? "Gestão" : "Equipe" },
  ];
}

function LinkAba({ aba, ativa, curto = false, className }: { aba: Aba; ativa: boolean; curto?: boolean; className: string }) {
  return (
    <Link
      href={aba.href}
      prefetch={false}
      aria-current={ativa ? "page" : undefined}
      aria-label={aba.rotulo}
      className={juntarClasses(
        "flex flex-col items-center justify-center gap-1 rounded-controle text-meta transition-colors",
        FOCO,
        ativa ? "bg-primaria/15 text-primaria-clara" : "text-texto-2 hover:bg-superficie-2 hover:text-texto",
        className,
      )}
    >
      <Icone de={aba.icone} tamanho={20} />
      <span className="max-w-full truncate">{curto ? (aba.rotuloCurto ?? aba.rotulo) : aba.rotulo}</span>
    </Link>
  );
}

function ModalSenha({ onFechar }: { onFechar: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [status, setStatus] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function alterarSenha(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSalvando(true);
    try {
      await api("/api/auth/senha", { method: "PUT", body: JSON.stringify({ senhaAtual, novaSenha }) });
      setStatus({ tipo: "ok", texto: "Senha alterada." });
      setSenhaAtual("");
      setNovaSenha("");
    } catch (err) {
      setStatus({ tipo: "erro", texto: mensagemErro(err) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Alterar senha" onFechar={onFechar}>
      <form onSubmit={alterarSenha} className="space-y-4">
        {status && (
          <p
            role={status.tipo === "erro" ? "alert" : "status"}
            className={juntarClasses(
              "rounded-controle p-3 text-meta",
              status.tipo === "ok" ? "bg-ok/12 text-ok-claro" : "bg-critico/12 text-critico-claro",
            )}
          >
            {status.texto}
          </p>
        )}
        <Campo rotulo="Senha atual">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            className={CLASSES_CAMPO}
          />
        </Campo>
        <Campo rotulo="Nova senha" dica="No mínimo 8 caracteres.">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className={CLASSES_CAMPO}
          />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={onFechar}>
            Fechar
          </Botao>
          <Botao type="submit" variante="primaria" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar senha"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

interface PropriedadesAdminShell {
  /** Perfil e abrigos chegam do servidor, junto com a página (ver layout.tsx). */
  usuario: UsuarioPerfil;
  abrigosIniciais: AbrigoAdmin[];
  children: ReactNode;
}

/**
 * Casca do painel (DESIGN.md §5.2): cabeçalho de uma linha com o abrigo ativo e
 * a conta, navegação lateral no desktop e barra inferior no celular.
 */
export function AdminShell({ usuario, abrigosIniciais, children }: PropriedadesAdminShell) {
  const pathname = usePathname();
  const [abrigos, setAbrigos] = useState<AbrigoAdmin[]>(abrigosIniciais);
  const [idEscolhido, setIdEscolhido] = useState<number | null>(null);
  const idSalvo = useSyncExternalStore(assinarAbrigoSalvo, lerAbrigoSalvo, () => null);
  const [reativandoAbrigo, setReativandoAbrigo] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);

  const recarregarAbrigos = useCallback(async () => {
    setAbrigos(await api<AbrigoAdmin[]>("/api/abrigos"));
  }, []);

  const selecionarAbrigo = useCallback((id: number) => {
    setIdEscolhido(id);
    try {
      window.localStorage.setItem(CHAVE_ABRIGO, String(id));
      window.dispatchEvent(new Event(EVENTO_ABRIGO));
    } catch {
      // Sem localStorage a escolha vale só para esta sessão.
    }
  }, []);

  const sair = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign(new URL("/login", window.location.origin).href);
    }
  }, []);

  // ADMIN escolhe o abrigo (a última escolha fica salva); os demais ficam no próprio.
  const idAbrigoAtivo = useMemo(() => {
    if (usuario.papel !== "ADMIN") return usuario.idAbrigo;
    const existe = (id: number | null) => (id !== null && abrigos.some((a) => a.id === id) ? id : null);
    return existe(idEscolhido) ?? existe(idSalvo) ?? abrigos.find((a) => a.ativo)?.id ?? abrigos[0]?.id ?? null;
  }, [usuario, abrigos, idEscolhido, idSalvo]);

  const abrigoAtivo = useMemo(() => abrigos.find((a) => a.id === idAbrigoAtivo) ?? null, [abrigos, idAbrigoAtivo]);
  const contexto = useMemo(
    () => ({ usuario, abrigos, abrigoAtivo, idAbrigoAtivo, selecionarAbrigo, recarregarAbrigos, sair }),
    [usuario, abrigos, abrigoAtivo, idAbrigoAtivo, selecionarAbrigo, recarregarAbrigos, sair],
  );

  async function reativarAbrigoAtual() {
    if (!abrigoAtivo) return;
    setReativandoAbrigo(true);
    try {
      await api(`/api/abrigos/${abrigoAtivo.id}`, { method: "PATCH", body: JSON.stringify({ ativo: true }) });
      await recarregarAbrigos();
    } finally {
      setReativandoAbrigo(false);
    }
  }

  const abas = abasDoPapel(usuario.papel);
  const abaAtiva = (aba: Aba) => pathname === aba.href || pathname.startsWith(`${aba.href}/`);
  const ehEscopoGlobal = usuario.papel === "ADMIN" && pathname.startsWith("/admin/geral");
  const primeiroNome = usuario.nome.split(" ")[0];

  return (
    <ContextoAdmin.Provider value={contexto}>
      <div className="flex min-h-dvh flex-col bg-fundo text-texto">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-borda bg-superficie px-3 sm:px-4">
          <Link
            href={usuario.redirecionarPara}
            prefetch={false}
            aria-label="WhereToGo: início do painel"
            className={juntarClasses("flex size-9 shrink-0 items-center justify-center rounded-controle", FOCO)}
          >
            <Logo marca="pino" className="h-9" />
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            {ehEscopoGlobal ? (
              <p className="truncate text-corpo font-medium text-texto">
                Todos os abrigos <span className="font-normal text-texto-3 tabular-nums">({abrigos.length})</span>
              </p>
            ) : usuario.papel === "ADMIN" ? (
              <div className="min-w-0 max-w-xs flex-1">
                <select
                  aria-label="Abrigo ativo"
                  value={idAbrigoAtivo ?? ""}
                  onChange={(e) => selecionarAbrigo(Number(e.target.value))}
                  className={CLASSES_CAMPO}
                >
                  {abrigos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                      {a.ativo ? "" : " (arquivado)"}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="truncate text-corpo font-medium text-texto">{abrigoAtivo?.nome ?? usuario.abrigo ?? "Abrigo"}</p>
            )}

            {!ehEscopoGlobal && abrigoAtivo && (
              <>
                <SeloStatus nivel={NIVEL_OCUPACAO[abrigoAtivo.ocupacao.nivel]} className="shrink-0 tabular-nums">
                  <span>
                    {abrigoAtivo.ocupacao.lotacaoAtual}/{abrigoAtivo.ocupacao.capacidadeMaxima}
                    <span className="hidden md:inline"> ocupadas</span>
                  </span>
                </SeloStatus>
                {abrigoAtivo.statusInfraestrutura !== "NORMAL" && (
                  <span className="hidden shrink-0 md:block">
                    <SeloStatus nivel={NIVEL_INFRA[abrigoAtivo.statusInfraestrutura]}>
                      Infraestrutura: {ROTULO_STATUS_INFRA[abrigoAtivo.statusInfraestrutura].toLowerCase()}
                    </SeloStatus>
                  </span>
                )}
              </>
            )}
          </div>

          <Menu rotulo={`Conta de ${usuario.nome}`} icone={CircleUser} texto={<span className="hidden max-w-32 truncate sm:inline">{primeiroNome}</span>}>
            <div className="border-b border-borda px-3 py-2">
              <p className="truncate text-corpo font-medium text-texto">{usuario.nome}</p>
              <p className="truncate text-meta text-texto-3">{ROTULO_PAPEL[usuario.papel]}</p>
            </div>
            <ItemMenu icone={KeyRound} onClick={() => setModalSenhaAberto(true)}>
              Alterar senha
            </ItemMenu>
            <Link href="/" prefetch={false} role="menuitem" className={CLASSES_ITEM_MENU}>
              <Icone de={Map} />
              Ver mapa público
            </Link>
            <ItemMenu icone={LogOut} onClick={() => void sair()}>
              Sair
            </ItemMenu>
          </Menu>
        </header>

        {!ehEscopoGlobal && abrigoAtivo && !abrigoAtivo.ativo && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda bg-atencao/12 px-4 py-2 text-meta text-atencao-claro">
            <p>
              {abrigoAtivo.nome} está arquivado e só pode ser consultado. Reative o abrigo para registrar movimentações, check-in ou alertas.
            </p>
            {usuario.papel === "ADMIN" && (
              <Botao tamanho="sm" disabled={reativandoAbrigo} onClick={() => void reativarAbrigoAtual()}>
                {reativandoAbrigo ? "Reativando..." : "Reativar abrigo"}
              </Botao>
            )}
          </div>
        )}

        <div className="flex flex-1">
          <nav
            aria-label="Seções do painel"
            className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-24 shrink-0 flex-col gap-1 border-r border-borda bg-superficie p-2 lg:flex"
          >
            {abas.map((aba) => (
              <LinkAba key={aba.href} aba={aba} ativa={abaAtiva(aba)} className="px-1 py-3" />
            ))}
          </nav>

          {/* Espaço extra embaixo no celular, por causa da barra de navegação fixa. */}
          <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-8">{children}</main>
        </div>

        <nav aria-label="Seções do painel" className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-borda bg-superficie px-2 py-1 lg:hidden">
          {abas.map((aba) => (
            <LinkAba key={aba.href} aba={aba} ativa={abaAtiva(aba)} curto className="min-h-14 min-w-0 flex-1 px-1" />
          ))}
        </nav>

        {modalSenhaAberto && <ModalSenha onFechar={() => setModalSenhaAberto(false)} />}
      </div>
    </ContextoAdmin.Provider>
  );
}
