"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ToastFlutuante, useAdmin, type AbrigoAdmin, type PapelUsuario } from "../contexto-admin";

const SeletorPontoMapa = dynamic(() => import("@/components/seletor-ponto-mapa"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-400">
      Carregando seletor de localização...
    </div>
  ),
});

interface UsuarioLista {
  id: number;
  nome: string;
  email: string;
  papel: PapelUsuario;
  idAbrigo: number | null;
  abrigo: string;
  ativo: boolean;
  possuiGoogle?: boolean;
  criadoEm: string;
}

interface PaginaUsuarios {
  itens: UsuarioLista[];
  paginacao: { pagina: number; tamanho: number; total: number; totalPaginas: number };
}

interface CategoriaCatalogo {
  id: number;
  nome: string;
  slug: string;
  itensAtivos: number;
  totalItens: number;
}

interface ItemCatalogo {
  id: number;
  nome: string;
  unidadeMedida: string;
  ativo: boolean;
  idCategoria: number;
  categoria: string;
  categoriaSlug: string;
}

interface LogAuditoria {
  id: number;
  dataHora: string;
  acao: string;
  descricao: string;
  detalhes: Record<string, unknown> | null;
  enderecoIp: string | null;
  usuario: { id: number; nome: string } | null;
  abrigo: { id: number; nome: string } | null;
}

interface PaginaAuditoria {
  itens: LogAuditoria[];
  paginacao: { pagina: number; tamanho: number; total: number; totalPaginas: number };
}

type AbaGeral = "abrigos" | "usuarios" | "catalogo" | "auditoria";

export default function PaginaAdminGeral() {
  const router = useRouter();
  const { usuario, abrigoAtivo, abrigos, recarregarAbrigos, selecionarAbrigo } = useAdmin();
  const ehAdmin = usuario.papel === "ADMIN";

  const [aba, setAba] = useState<AbaGeral>(ehAdmin ? "abrigos" : "usuarios");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Confirmação em 2 passos para ações de arquivamento/desativação
  const [confirmarAbrigoId, setConfirmarAbrigoId] = useState<number | null>(null);
  const [confirmarUsuarioId, setConfirmarUsuarioId] = useState<number | null>(null);

  // --- Estado: Abrigos -------------------------------------------------------
  const [abrigoEditando, setAbrigoEditando] = useState<AbrigoAdmin | null>(null);
  const [nomeAbrigo, setNomeAbrigo] = useState("");
  const [enderecoAbrigo, setEnderecoAbrigo] = useState("");
  const [telefoneAbrigo, setTelefoneAbrigo] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [titularPix, setTitularPix] = useState("");
  const [latitudeAbrigo, setLatitudeAbrigo] = useState("-28.2620");
  const [longitudeAbrigo, setLongitudeAbrigo] = useState("-52.4083");
  const [capacidadeAbrigo, setCapacidadeAbrigo] = useState("100");

  // --- Estado: Usuários ------------------------------------------------------
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioLista | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [senhaUsuario, setSenhaUsuario] = useState("");
  const [papelNovoUsuario, setPapelNovoUsuario] = useState<PapelUsuario>("VOLUNTARIO");
  const [idAbrigoUsuario, setIdAbrigoUsuario] = useState<number | "">(usuario.idAbrigo ?? (abrigos[0]?.id ?? ""));

  // --- Estado: Catálogo ------------------------------------------------------
  const [categorias, setCategorias] = useState<CategoriaCatalogo[]>([]);
  const [itensCatalogo, setItensCatalogo] = useState<ItemCatalogo[]>([]);
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [idCategoriaItem, setIdCategoriaItem] = useState<number | "">("");
  const [nomeItem, setNomeItem] = useState("");
  const [unidadeItem, setUnidadeItem] = useState("unidade");

  // --- Estado: Auditoria -----------------------------------------------------
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroIdAbrigoAudit, setFiltroIdAbrigoAudit] = useState("");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");

  const carregarUsuarios = useCallback(async () => {
    try {
      const res = await api<PaginaUsuarios>("/api/usuarios?tamanho=100");
      setUsuarios(res.itens);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }, []);

  const carregarCatalogo = useCallback(async () => {
    try {
      const [cats, its] = await Promise.all([
        api<CategoriaCatalogo[]>("/api/categorias"),
        api<ItemCatalogo[]>("/api/itens"),
      ]);
      setCategorias(cats);
      setItensCatalogo(its);
      if (cats[0] && !idCategoriaItem) setIdCategoriaItem(cats[0].id);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }, [idCategoriaItem]);

  const carregarAuditoria = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tamanho: "80" });
      if (filtroAcao.trim()) params.set("acao", filtroAcao.trim().toUpperCase());
      if (ehAdmin && filtroIdAbrigoAudit) params.set("idAbrigo", filtroIdAbrigoAudit);
      if (filtroDe) params.set("de", filtroDe);
      if (filtroAte) params.set("ate", filtroAte);
      const res = await api<PaginaAuditoria>(`/api/auditoria?${params.toString()}`);
      setLogs(res.itens);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }, [ehAdmin, filtroAcao, filtroIdAbrigoAudit, filtroDe, filtroAte]);

  useEffect(() => {
    void Promise.resolve().then(() => carregarUsuarios());
  }, [carregarUsuarios]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (aba === "usuarios") return carregarUsuarios();
      if (aba === "catalogo") return carregarCatalogo();
      if (aba === "auditoria") return carregarAuditoria();
    });
  }, [aba, carregarUsuarios, carregarCatalogo, carregarAuditoria]);

  function preencherFormAbrigo(a: AbrigoAdmin | null) {
    setAbrigoEditando(a);
    setNomeAbrigo(a?.nome ?? "");
    setEnderecoAbrigo(a?.endereco ?? "");
    setTelefoneAbrigo(a?.telefone ?? "");
    setChavePix(a?.chavePix ?? "");
    setTitularPix(a?.titularPix ?? "");
    setLatitudeAbrigo(String(a?.latitude ?? -28.262));
    setLongitudeAbrigo(String(a?.longitude ?? -52.4083));
    setCapacidadeAbrigo(String(a?.capacidadeMaxima ?? 100));
  }

  async function salvarAbrigo(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const corpo = {
        nome: nomeAbrigo,
        endereco: enderecoAbrigo,
        telefone: telefoneAbrigo.trim() || null,
        chavePix: chavePix.trim() || null,
        titularPix: titularPix.trim() || null,
        latitude: Number(latitudeAbrigo),
        longitude: Number(longitudeAbrigo),
        capacidadeMaxima: Number(capacidadeAbrigo),
      };
      if (abrigoEditando) {
        await api(`/api/abrigos/${abrigoEditando.id}`, {
          method: "PATCH",
          body: JSON.stringify(corpo),
        });
        setAviso(`Abrigo "${nomeAbrigo}" atualizado.`);
      } else {
        await api("/api/abrigos", {
          method: "POST",
          body: JSON.stringify(corpo),
        });
        setAviso(`Abrigo "${nomeAbrigo}" cadastrado.`);
      }
      preencherFormAbrigo(null);
      await recarregarAbrigos();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivoAbrigo(a: AbrigoAdmin) {
    setEnviando(true);
    setErro(null);
    setConfirmarAbrigoId(null);
    try {
      await api(`/api/abrigos/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !a.ativo }),
      });
      await recarregarAbrigos();
      setAviso(`Abrigo "${a.nome}" ${!a.ativo ? "reativado" : "arquivado"}.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  function preencherFormUsuario(u: UsuarioLista | null) {
    setUsuarioEditando(u);
    setNomeUsuario(u?.nome ?? "");
    setEmailUsuario(u?.email ?? "");
    setSenhaUsuario("");
    setPapelNovoUsuario(u?.papel ?? "VOLUNTARIO");
    setIdAbrigoUsuario(u?.idAbrigo ?? usuario.idAbrigo ?? (abrigos[0]?.id ?? ""));
  }

  async function salvarUsuario(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const papel = ehAdmin ? papelNovoUsuario : "VOLUNTARIO";
      const idAbrigo =
        papel === "ADMIN" ? null : ehAdmin ? Number(idAbrigoUsuario) : usuario.idAbrigo;

      if (usuarioEditando) {
        const corpoPatch: Record<string, unknown> = { nome: nomeUsuario };
        if (senhaUsuario.trim()) corpoPatch.senha = senhaUsuario;
        if (ehAdmin) {
          corpoPatch.email = emailUsuario;
          corpoPatch.papel = papel;
          corpoPatch.idAbrigo = idAbrigo;
        }
        await api(`/api/usuarios/${usuarioEditando.id}`, {
          method: "PATCH",
          body: JSON.stringify(corpoPatch),
        });
        setAviso(`Usuário "${nomeUsuario}" atualizado.`);
      } else {
        const corpoPost: Record<string, unknown> = {
          nome: nomeUsuario,
          email: emailUsuario,
          papel,
          idAbrigo,
        };
        if (senhaUsuario.trim()) {
          corpoPost.senha = senhaUsuario;
        }
        await api("/api/usuarios", {
          method: "POST",
          body: JSON.stringify(corpoPost),
        });
        setAviso(
          senhaUsuario.trim()
            ? "Usuário cadastrado com sucesso."
            : "Usuário pré-cadastrado! Ele já pode entrar com 1 toque via Google One Tap.",
        );
      }
      preencherFormUsuario(null);
      await carregarUsuarios();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivoUsuario(u: UsuarioLista) {
    setEnviando(true);
    setErro(null);
    setConfirmarUsuarioId(null);
    try {
      await api(`/api/usuarios/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !u.ativo }),
      });
      await carregarUsuarios();
      setAviso(
        !u.ativo
          ? `Acesso de "${u.nome}" aprovado e liberado!`
          : `Conta de "${u.nome}" desativada.`,
      );
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function criarNovaCategoria(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/categorias", {
        method: "POST",
        body: JSON.stringify({ nome: nomeCategoria }),
      });
      setNomeCategoria("");
      await carregarCatalogo();
      setAviso("Categoria criada.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function criarNovoItem(e: FormEvent) {
    e.preventDefault();
    if (!idCategoriaItem) return;
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/itens", {
        method: "POST",
        body: JSON.stringify({
          idCategoria: Number(idCategoriaItem),
          nome: nomeItem,
          unidadeMedida: unidadeItem,
        }),
      });
      setNomeItem("");
      await carregarCatalogo();
      setAviso("Item adicionado ao catálogo.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivoItem(item: ItemCatalogo) {
    setEnviando(true);
    setErro(null);
    try {
      await api(`/api/itens/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !item.ativo }),
      });
      await carregarCatalogo();
      setAviso(`Item "${item.nome}" ${!item.ativo ? "ativado" : "desativado"}.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <ToastFlutuante
        erro={erro}
        aviso={aviso}
        aoFecharErro={() => setErro(null)}
        aoFecharAviso={() => setAviso(null)}
      />

      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
          {ehAdmin ? "Governança Global da Rede" : "Gestão Local do Abrigo"}
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          {ehAdmin
            ? "Abrigos, Catálogo, Equipe e Auditoria"
            : `Equipe e Auditoria — ${abrigoAtivo?.nome ?? usuario.abrigo ?? ""}`}
        </h1>
      </div>

      {/* Seletor de Sub-abas */}
      <div className="flex flex-wrap gap-2">
        {ehAdmin && (
          <button
            type="button"
            onClick={() => setAba("abrigos")}
            className={`min-h-10 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer ${
              aba === "abrigos"
                ? "bg-amber-500 text-slate-950"
                : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            🏠 Abrigos e PIX ({abrigos.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => setAba("usuarios")}
          className={`min-h-10 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer inline-flex items-center gap-2 ${
            aba === "usuarios"
              ? "bg-amber-500 text-slate-950"
              : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <span>👥 {ehAdmin ? "Equipe e Acessos" : "Voluntários do Abrigo"}</span>
          {usuarios.some((u) => !u.ativo && u.possuiGoogle) && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                aba === "usuarios"
                  ? "bg-slate-950 text-amber-300"
                  : "bg-amber-500 text-slate-950"
              }`}
            >
              {usuarios.filter((u) => !u.ativo && u.possuiGoogle).length} pendente(s)
            </span>
          )}
        </button>
        {ehAdmin && (
          <button
            type="button"
            onClick={() => setAba("catalogo")}
            className={`min-h-10 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer ${
              aba === "catalogo"
                ? "bg-amber-500 text-slate-950"
                : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            📦 Catálogo de Suprimentos
          </button>
        )}
        <button
          type="button"
          onClick={() => setAba("auditoria")}
          className={`min-h-10 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer ${
            aba === "auditoria"
              ? "bg-amber-500 text-slate-950"
              : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          🛡️ Registro de Auditoria
        </button>
      </div>

      {/* ABA 1: ABRIGOS (SOMENTE ADMIN) */}
      {aba === "abrigos" && ehAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {abrigoEditando ? `Editar: ${abrigoEditando.nome}` : "Cadastrar Novo Abrigo"}
              </h2>
              {abrigoEditando && (
                <button
                  type="button"
                  onClick={() => preencherFormAbrigo(null)}
                  className="text-xs text-amber-400 hover:underline cursor-pointer"
                >
                  + Novo cadastro
                </button>
              )}
            </div>

            <form onSubmit={salvarAbrigo} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Abrigo *</label>
                <input
                  type="text"
                  required
                  value={nomeAbrigo}
                  onChange={(e) => setNomeAbrigo(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Endereço Completo *</label>
                <input
                  type="text"
                  required
                  value={enderecoAbrigo}
                  onChange={(e) => setEnderecoAbrigo(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={telefoneAbrigo}
                    onChange={(e) => setTelefoneAbrigo(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Capacidade Máx. *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={capacidadeAbrigo}
                    onChange={(e) => setCapacidadeAbrigo(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white tabular-nums"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Localização Geográfica no Mapa *
                  </span>
                  <span className="text-[11px] text-amber-300 font-semibold">
                    Clique no mapa para definir
                  </span>
                </div>

                <SeletorPontoMapa
                  latitude={latitudeAbrigo.trim() !== "" ? Number(latitudeAbrigo) : null}
                  longitude={longitudeAbrigo.trim() !== "" ? Number(longitudeAbrigo) : null}
                  aoSelecionarCoordenada={(lat, lng) => {
                    setLatitudeAbrigo(String(lat));
                    setLongitudeAbrigo(String(lng));
                  }}
                  alturaClasse="h-48"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Latitude *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={latitudeAbrigo}
                      onChange={(e) => setLatitudeAbrigo(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-base sm:text-xs text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Longitude *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={longitudeAbrigo}
                      onChange={(e) => setLongitudeAbrigo(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-base sm:text-xs text-white tabular-nums"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-300">
                  PIX Oficial (gerenciado exclusivamente pela Administração Geral)
                </p>
                <input
                  type="text"
                  value={chavePix}
                  onChange={(e) => setChavePix(e.target.value)}
                  placeholder="Chave PIX (e-mail, CNPJ, telefone)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-base sm:text-xs text-white"
                />
                <input
                  type="text"
                  value={titularPix}
                  onChange={(e) => setTitularPix(e.target.value)}
                  placeholder="Nome do Titular da Conta PIX"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-base sm:text-xs text-white"
                />
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full min-h-11 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                {abrigoEditando ? "Salvar Alterações do Abrigo" : "Cadastrar Abrigo"}
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-white">Abrigos Cadastrados</h2>
            <div className="space-y-3">
              {abrigos.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white">{a.nome}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          a.ativo ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {a.ativo ? "ATIVO" : "ARQUIVADO"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{a.endereco}</p>
                    <p className="text-xs text-slate-300 tabular-nums">
                      Ocupação: <strong>{a.ocupacao.lotacaoAtual}/{a.ocupacao.capacidadeMaxima}</strong> • Infra:{" "}
                      <strong>{a.statusInfraestrutura}</strong>
                      {a.chavePix ? ` • PIX: ${a.chavePix}` : " • Sem PIX"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        selecionarAbrigo(a.id);
                        router.push("/admin/dashboard");
                      }}
                      className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                    >
                      Abrir Painel
                    </button>
                    <button
                      type="button"
                      onClick={() => preencherFormAbrigo(a)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                    >
                      Editar
                    </button>

                    {a.ativo && confirmarAbrigoId === a.id ? (
                      <div className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/50 px-2 py-1">
                        <span className="text-[11px] text-rose-200 font-semibold">Arquivar?</span>
                        <button
                          type="button"
                          disabled={enviando}
                          onClick={() => alternarAtivoAbrigo(a)}
                          className="rounded bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-slate-950 cursor-pointer"
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarAbrigoId(null)}
                          className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 cursor-pointer"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => (a.ativo ? setConfirmarAbrigoId(a.id) : alternarAtivoAbrigo(a))}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                      >
                        {a.ativo ? "Arquivar" : "Reativar"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ABA 2: USUÁRIOS / EQUIPE */}
      {aba === "usuarios" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {usuarioEditando
                  ? `Editar: ${usuarioEditando.nome}`
                  : ehAdmin
                    ? "Cadastrar Usuário"
                    : "Cadastrar Voluntário"}
              </h2>
              {usuarioEditando && (
                <button
                  type="button"
                  onClick={() => preencherFormUsuario(null)}
                  className="text-xs text-amber-400 hover:underline cursor-pointer"
                >
                  + Novo cadastro
                </button>
              )}
            </div>
            <form onSubmit={salvarUsuario} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={nomeUsuario}
                  onChange={(e) => setNomeUsuario(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  disabled={Boolean(usuarioEditando && !ehAdmin)}
                  value={emailUsuario}
                  onChange={(e) => setEmailUsuario(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {usuarioEditando
                    ? "Nova Senha (deixe em branco p/ manter)"
                    : "Senha Inicial (opcional se usar Google One Tap)"}
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={senhaUsuario}
                  onChange={(e) => setSenhaUsuario(e.target.value)}
                  placeholder={usuarioEditando ? "••••••••" : "Em branco = acesso via Google One Tap"}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white placeholder-slate-500"
                />
              </div>

              {ehAdmin && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Papel de Acesso</label>
                    <select
                      value={papelNovoUsuario}
                      onChange={(e) => setPapelNovoUsuario(e.target.value as PapelUsuario)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                    >
                      <option value="VOLUNTARIO">VOLUNTÁRIO (Estoque e Check-in)</option>
                      <option value="COORDENADOR">COORDENADOR (Gestão do Abrigo)</option>
                      <option value="ADMIN">ADMIN (Administração Geral)</option>
                    </select>
                  </div>

                  {papelNovoUsuario !== "ADMIN" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Abrigo Vinculado</label>
                      <select
                        required
                        value={idAbrigoUsuario}
                        onChange={(e) => setIdAbrigoUsuario(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                      >
                        {abrigos
                          .filter((a) => a.ativo)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nome}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full min-h-11 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                {usuarioEditando ? "Salvar Alterações" : "Cadastrar Conta"}
              </button>
            </form>
          </section>

          <section className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-5">
            {/* Fila de Aprovação 1-Clique de Auto-Cadastro via Google One Tap */}
            {usuarios.some((u) => !u.ativo && u.possuiGoogle) && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      Fila de Aprovação Rápida
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Solicitações de Acesso via Google One Tap
                    </h3>
                  </div>
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-black text-slate-950 tabular-nums">
                    {usuarios.filter((u) => !u.ativo && u.possuiGoogle).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {usuarios
                    .filter((u) => !u.ativo && u.possuiGoogle)
                    .map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white truncate">{u.nome}</p>
                            <span className="rounded bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                              Google One Tap
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {u.email} • Solicita acesso em <strong className="text-slate-200">{u.abrigo}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={enviando}
                          onClick={() => alternarAtivoUsuario(u)}
                          className="min-h-10 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                        >
                          ✓ Aprovar Acesso
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <h2 className="text-base sm:text-lg font-bold text-white">Contas Registradas ({usuarios.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="pb-2.5 font-semibold">Nome / E-mail</th>
                    <th className="pb-2.5 font-semibold">Papel / Abrigo</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                    <th className="pb-2.5 text-right font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {usuarios.map((u) => {
                    const podeAlterar =
                      u.id !== usuario.id && (ehAdmin || u.papel === "VOLUNTARIO");
                    return (
                      <tr key={u.id}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white">{u.nome}</p>
                            {u.possuiGoogle && (
                              <span className="rounded bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                                Google
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-amber-300">
                            {u.papel}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">{u.abrigo ?? "Global (Sem abrigo)"}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              u.ativo
                                ? "bg-emerald-500/20 text-emerald-300"
                                : u.possuiGoogle
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {u.ativo ? "ATIVO" : u.possuiGoogle ? "PENDENTE" : "INATIVO"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {podeAlterar && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => preencherFormUsuario(u)}
                                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                              >
                                Editar
                              </button>

                              {u.ativo && confirmarUsuarioId === u.id ? (
                                <div className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/50 px-2 py-0.5">
                                  <span className="text-[11px] text-rose-200 font-semibold">Revogar?</span>
                                  <button
                                    type="button"
                                    disabled={enviando}
                                    onClick={() => alternarAtivoUsuario(u)}
                                    className="rounded bg-rose-500 px-1.5 py-0.5 text-[11px] font-bold text-slate-950 cursor-pointer"
                                  >
                                    Sim
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmarUsuarioId(null)}
                                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300 cursor-pointer"
                                  >
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={enviando}
                                  onClick={() =>
                                    u.ativo ? setConfirmarUsuarioId(u.id) : alternarAtivoUsuario(u)
                                  }
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                                    u.ativo
                                      ? "border border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                                      : "bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                                  }`}
                                >
                                  {u.ativo ? "Desativar" : "✓ Aprovar / Ativar"}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ABA 3: CATÁLOGO DE SUPRIMENTOS (SOMENTE ADMIN) */}
      {aba === "catalogo" && ehAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <h2 className="text-base font-bold text-white">Nova Categoria</h2>
              <form onSubmit={criarNovaCategoria} className="space-y-3">
                <input
                  type="text"
                  required
                  value={nomeCategoria}
                  onChange={(e) => setNomeCategoria(e.target.value)}
                  placeholder="Ex.: Medicamentos Contínuos"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full min-h-10 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 cursor-pointer"
                >
                  Criar Categoria
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <h2 className="text-base font-bold text-white">Novo Item de Suprimento</h2>
              <form onSubmit={criarNovoItem} className="space-y-3">
                <select
                  required
                  value={idCategoriaItem}
                  onChange={(e) => setIdCategoriaItem(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={nomeItem}
                  onChange={(e) => setNomeItem(e.target.value)}
                  placeholder="Nome do item (ex.: Soro Fisiológico 500ml)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
                <input
                  type="text"
                  required
                  value={unidadeItem}
                  onChange={(e) => setUnidadeItem(e.target.value)}
                  placeholder="Unidade (ex.: unidade, pacote, kg)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full min-h-10 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 cursor-pointer"
                >
                  Adicionar Item ao Catálogo
                </button>
              </form>
            </section>
          </div>

          <section className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-white">Itens do Catálogo ({itensCatalogo.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="pb-2.5 font-semibold">Item</th>
                    <th className="pb-2.5 font-semibold">Categoria</th>
                    <th className="pb-2.5 font-semibold">Unidade</th>
                    <th className="pb-2.5 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {itensCatalogo.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2.5 font-semibold text-white">{it.nome}</td>
                      <td className="py-2.5 text-xs text-slate-300">{it.categoria}</td>
                      <td className="py-2.5 text-xs text-slate-400">{it.unidadeMedida}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => alternarAtivoItem(it)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer ${
                            it.ativo
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {it.ativo ? "Ativo" : "Inativo"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ABA 4: AUDITORIA */}
      {aba === "auditoria" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Histórico de Auditoria</h2>
              <p className="text-xs text-slate-400">
                Registro permanente de todas as ações operacionais e administrativas realizadas no sistema.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {ehAdmin && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Abrigo</label>
                  <select
                    value={filtroIdAbrigoAudit}
                    onChange={(e) => setFiltroIdAbrigoAudit(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">Todos os abrigos</option>
                    {abrigos.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Tipo de Ação</label>
                <input
                  type="text"
                  value={filtroAcao}
                  onChange={(e) => setFiltroAcao(e.target.value)}
                  placeholder="Ex.: ESTOQUE_MOVIMENTADO"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">De (data)</label>
                <input
                  type="date"
                  value={filtroDe}
                  onChange={(e) => setFiltroDe(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Até (data)</label>
                <input
                  type="date"
                  value={filtroAte}
                  onChange={(e) => setFiltroAte(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => carregarAuditoria()}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer"
              >
                Filtrar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-semibold">Data / Hora</th>
                  <th className="pb-2.5 font-semibold">Ação</th>
                  <th className="pb-2.5 font-semibold">Descrição & Detalhes</th>
                  <th className="pb-2.5 font-semibold">Autor / IP</th>
                  <th className="pb-2.5 font-semibold">Abrigo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-400 tabular-nums">
                      {new Date(l.dataHora).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                        {l.acao}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-200">
                      <p>{l.descricao}</p>
                      {l.detalhes && Object.keys(l.detalhes).length > 0 && (
                        <p className="mt-0.5 text-[11px] font-mono text-slate-400 break-all">
                          {JSON.stringify(l.detalhes)}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">
                      {l.usuario?.nome ?? "Anônimo"}{" "}
                      {l.enderecoIp && <span className="text-slate-500 font-mono">({l.enderecoIp})</span>}
                    </td>
                    <td className="py-2.5 text-slate-400">{l.abrigo?.nome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
