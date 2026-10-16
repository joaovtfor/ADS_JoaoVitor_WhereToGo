"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "@/lib/cliente-api";
import { useAdmin } from "../contexto-admin";

interface ItemEstoque {
  idItem: number;
  nome: string;
  unidadeMedida: string;
  itemAtivo: boolean;
  idCategoria: number;
  categoria: string;
  categoriaSlug: string;
  quantidade: number;
  quantidadeMinima: number;
  statusNecessidade: "URGENTE" | "NORMAL" | "BLOQUEADO";
  atualizadoEm: string | null;
  critico: boolean;
}

interface MovimentacaoEstoque {
  id: number;
  tipo: string;
  quantidade: number;
  quantidadeResultante: number;
  dataHora: string;
  observacao: string | null;
  idItem: number;
  item: string;
  unidadeMedida: string;
  idUsuario: number;
  usuario: string;
  idAbrigoContraparte: number | null;
  abrigoContraparte: string | null;
}

interface PaginaMovimentacoes {
  itens: MovimentacaoEstoque[];
  paginacao: { pagina: number; tamanho: number; total: number; totalPaginas: number };
}

export default function PaginaInventario() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, abrigos } = useAdmin();
  const podeClassificar = usuario.papel === "ADMIN" || usuario.papel === "COORDENADOR";

  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [incluirCatalogo, setIncluirCatalogo] = useState(true);
  const [modoSaida, setModoSaida] = useState<"SAIDA_CONSUMO" | "PERDA">("SAIDA_CONSUMO");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("TODAS");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);

  // Histórico de movimentações do abrigo (RF13)
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([]);
  const [filtroItemHist, setFiltroItemHist] = useState<string>("");
  const [filtroTipoHist, setFiltroTipoHist] = useState<string>("");

  // Modal de Ajuste Físico / Config Mínimo (Coordenador/Admin)
  const [itemConfig, setItemConfig] = useState<ItemEstoque | null>(null);
  const [minimoInput, setMinimoInput] = useState("");
  const [contagemFisicaInput, setContagemFisicaInput] = useState("");
  const [justificativaAjuste, setJustificativaAjuste] = useState("");

  // Modal de Transferência de Suprimentos entre Abrigos
  const [itemTransferencia, setItemTransferencia] = useState<ItemEstoque | null>(null);
  const [idAbrigoDestino, setIdAbrigoDestino] = useState<number | "">("");
  const [qtdTransferencia, setQtdTransferencia] = useState("1");
  const [obsTransferencia, setObsTransferencia] = useState("");

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      const qs = incluirCatalogo ? "?incluirCatalogo=true" : "";
      const lista = await api<ItemEstoque[]>(`/api/abrigos/${idAbrigoAtivo}/estoque${qs}`);
      setItens(lista);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigoAtivo, incluirCatalogo]);

  const carregarHistorico = useCallback(async () => {
    if (!idAbrigoAtivo || !podeClassificar) return;
    try {
      const params = new URLSearchParams({ tamanho: "50" });
      if (filtroItemHist) params.set("idItem", filtroItemHist);
      if (filtroTipoHist) params.set("tipo", filtroTipoHist);
      const res = await api<PaginaMovimentacoes>(
        `/api/abrigos/${idAbrigoAtivo}/movimentacoes?${params.toString()}`,
      );
      setMovimentacoes(res.itens);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }, [idAbrigoAtivo, podeClassificar, filtroItemHist, filtroTipoHist]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  useEffect(() => {
    if (!mostrarHistorico) return;
    void Promise.resolve().then(carregarHistorico);
  }, [mostrarHistorico, carregarHistorico]);

  async function movimentarRapido(item: ItemEstoque, delta: number) {
    if (!idAbrigoAtivo) return;
    setOcupadoId(item.idItem);
    setErro(null);
    try {
      const corpo: Record<string, unknown> = { quantidade: delta };
      if (delta < 0 && modoSaida === "PERDA") {
        corpo.tipo = "PERDA";
        corpo.observacao = "Baixa por perda/avaria via Fast-CRUD";
      }
      const res = await api<{ quantidadeAtual: number }>(
        `/api/abrigos/${idAbrigoAtivo}/estoque/${item.idItem}/movimentacoes`,
        {
          method: "POST",
          body: JSON.stringify(corpo),
        },
      );
      setItens((atual) =>
        atual.map((i) => {
          if (i.idItem !== item.idItem) return i;
          const novaQtd = res.quantidadeAtual;
          const novoStatus =
            i.statusNecessidade === "NORMAL" && novaQtd < i.quantidadeMinima ? "URGENTE" : i.statusNecessidade;
          return {
            ...i,
            quantidade: novaQtd,
            statusNecessidade: novoStatus,
            critico: novoStatus === "URGENTE" || novaQtd < i.quantidadeMinima,
          };
        }),
      );
      if (mostrarHistorico) await carregarHistorico();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setOcupadoId(null);
    }
  }

  async function classificarStatus(item: ItemEstoque, statusNecessidade: "URGENTE" | "NORMAL" | "BLOQUEADO") {
    if (!idAbrigoAtivo) return;
    setOcupadoId(item.idItem);
    setErro(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}/estoque/${item.idItem}`, {
        method: "PATCH",
        body: JSON.stringify({ statusNecessidade }),
      });
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setOcupadoId(null);
    }
  }

  async function salvarConfigItem(e: FormEvent) {
    e.preventDefault();
    if (!itemConfig || !idAbrigoAtivo) return;
    setOcupadoId(itemConfig.idItem);
    setErro(null);
    setAviso(null);
    try {
      const novaMinima = Number(minimoInput);
      if (novaMinima !== itemConfig.quantidadeMinima) {
        await api(`/api/abrigos/${idAbrigoAtivo}/estoque/${itemConfig.idItem}`, {
          method: "PATCH",
          body: JSON.stringify({ quantidadeMinima: novaMinima }),
        });
      }
      if (contagemFisicaInput.trim() !== "" && Number(contagemFisicaInput) !== itemConfig.quantidade) {
        await api(`/api/abrigos/${idAbrigoAtivo}/estoque/${itemConfig.idItem}/movimentacoes`, {
          method: "POST",
          body: JSON.stringify({
            tipo: "AJUSTE",
            quantidadeFinal: Number(contagemFisicaInput),
            observacao: justificativaAjuste.trim() || "Ajuste por contagem física",
          }),
        });
      }
      setItemConfig(null);
      await carregar();
      setAviso(`Parâmetros de "${itemConfig.nome}" atualizados.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setOcupadoId(null);
    }
  }

  async function confirmarTransferencia(e: FormEvent) {
    e.preventDefault();
    if (!itemTransferencia || !idAbrigoAtivo || !idAbrigoDestino) return;
    setOcupadoId(itemTransferencia.idItem);
    setErro(null);
    setAviso(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}/transferencias-estoque`, {
        method: "POST",
        body: JSON.stringify({
          idAbrigoDestino: Number(idAbrigoDestino),
          idItem: itemTransferencia.idItem,
          quantidade: Number(qtdTransferencia),
          observacao: obsTransferencia,
        }),
      });
      setItemTransferencia(null);
      await carregar();
      setAviso(`Transferência de ${itemTransferencia.nome} concluída.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setOcupadoId(null);
    }
  }

  const categorias = Array.from(
    new Map(itens.map((i) => [i.categoriaSlug, { slug: i.categoriaSlug, nome: i.categoria }])).values(),
  );

  const itensFiltrados = itens.filter((i) => {
    if (categoriaAtiva !== "TODAS" && i.categoriaSlug !== categoriaAtiva) return false;
    if (busca.trim() && !i.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  });

  const abrigosDestino = abrigos.filter((a) => a.ativo && a.id !== idAbrigoAtivo);

  if (!idAbrigoAtivo) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
        Selecione um abrigo no topo para acessar o inventário.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            RF02 & RF03 • Inventário Fast-CRUD e Classificação de Necessidades
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Estoque Operacional — {abrigoAtivo?.nome}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Toque nos botões rápidos para registrar entradas e saídas auditadas sem recarregar a página.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs">
            <button
              type="button"
              onClick={() => setModoSaida("SAIDA_CONSUMO")}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition cursor-pointer ${
                modoSaida === "SAIDA_CONSUMO"
                  ? "bg-amber-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              − Saída Consumo
            </button>
            <button
              type="button"
              onClick={() => setModoSaida("PERDA")}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition cursor-pointer ${
                modoSaida === "PERDA"
                  ? "bg-red-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              − Baixa por Perda
            </button>
          </div>

          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirCatalogo}
              onChange={(e) => setIncluirCatalogo(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            Mostrar itens com saldo zero
          </label>

          {podeClassificar && (
            <button
              type="button"
              onClick={() => setMostrarHistorico((v) => !v)}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                mostrarHistorico
                  ? "border-amber-500 bg-amber-500/20 text-amber-200"
                  : "border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              📜 {mostrarHistorico ? "Ocultar Histórico" : "Histórico do Estoque (RF13)"}
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200">{erro}</div>
      )}
      {aviso && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
          {aviso}
        </div>
      )}

      {/* Barra de Busca e Abas de Categoria Macro */}
      <div className="space-y-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item por nome (ex.: Água, Fralda, Cobertor)..."
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoriaAtiva("TODAS")}
            className={`min-h-10 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              categoriaAtiva === "TODAS"
                ? "bg-amber-500 text-slate-950"
                : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            Todas ({itens.length})
          </button>
          {categorias.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategoriaAtiva(c.slug)}
              className={`min-h-10 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                categoriaAtiva === c.slug
                  ? "bg-amber-500 text-slate-950"
                  : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      {/* Grade de Cards Fast-CRUD */}
      {carregando ? (
        <p className="py-12 text-center text-sm text-slate-400">Carregando estoque...</p>
      ) : itensFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
          Nenhum item encontrado para este filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {itensFiltrados.map((item) => {
            const desabilitado = ocupadoId === item.idItem;
            return (
              <div
                key={item.idItem}
                className={`rounded-2xl border p-4 flex flex-col justify-between space-y-4 ${
                  item.statusNecessidade === "URGENTE"
                    ? "border-red-500/40 bg-slate-900"
                    : item.statusNecessidade === "BLOQUEADO"
                      ? "border-slate-700 bg-slate-900/70"
                      : "border-slate-800 bg-slate-900"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase">{item.categoria}</span>
                      <h3 className="text-base font-bold text-white leading-snug">{item.nome}</h3>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${
                        item.statusNecessidade === "URGENTE"
                          ? "bg-red-500/20 text-red-300 border border-red-500/40"
                          : item.statusNecessidade === "BLOQUEADO"
                            ? "bg-slate-700 text-slate-300"
                            : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {item.statusNecessidade}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div>
                      <span className="text-3xl font-black text-white font-mono">{item.quantidade}</span>
                      <span className="ml-1.5 text-xs text-slate-400">{item.unidadeMedida}(s)</span>
                    </div>
                    <span className="text-xs text-slate-400">Mínimo: {item.quantidadeMinima}</span>
                  </div>
                </div>

                {/* Botões Touch Fast-CRUD (-5, -1, +1, +5) */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    disabled={desabilitado || item.quantidade < 5}
                    onClick={() => movimentarRapido(item, -5)}
                    className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 text-base font-black text-amber-300 hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                  >
                    −5
                  </button>
                  <button
                    type="button"
                    disabled={desabilitado || item.quantidade < 1}
                    onClick={() => movimentarRapido(item, -1)}
                    className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 text-lg font-black text-amber-300 hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    disabled={desabilitado || !item.itemAtivo}
                    onClick={() => movimentarRapido(item, 1)}
                    className="min-h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-lg font-black text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-35 cursor-pointer"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    disabled={desabilitado || !item.itemAtivo}
                    onClick={() => movimentarRapido(item, 5)}
                    className="min-h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-base font-black text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-35 cursor-pointer"
                  >
                    +5
                  </button>
                </div>

                {/* Controles exclusivos de Coordenador / Admin (RF03 + Ajuste + Transferência) */}
                {podeClassificar && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2">
                    <div className="grid grid-cols-3 gap-1">
                      {(["URGENTE", "NORMAL", "BLOQUEADO"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={desabilitado || item.statusNecessidade === st}
                          onClick={() => classificarStatus(item, st)}
                          className={`rounded-lg py-1 text-[10px] font-bold transition cursor-pointer ${
                            item.statusNecessidade === st
                              ? "bg-amber-500 text-slate-950"
                              : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setItemConfig(item);
                          setMinimoInput(String(item.quantidadeMinima));
                          setContagemFisicaInput(String(item.quantidade));
                          setJustificativaAjuste("");
                        }}
                        className="flex-1 rounded-lg border border-slate-800 bg-slate-950 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
                      >
                        ⚙️ Mínimo / Contagem
                      </button>
                      {item.quantidade > 0 && abrigosDestino.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setItemTransferencia(item);
                            setIdAbrigoDestino(abrigosDestino[0]?.id ?? "");
                            setQtdTransferencia("1");
                            setObsTransferencia("");
                          }}
                          className="flex-1 rounded-lg border border-slate-800 bg-slate-950 py-1 text-[11px] font-medium text-sky-300 hover:bg-slate-800 cursor-pointer"
                        >
                          ⇄ Transferir
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Estoque Mínimo e Ajuste por Contagem Física */}
      {itemConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Configurar: {itemConfig.nome}</h3>
            <form onSubmit={salvarConfigItem} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Estoque Mínimo de Segurança ({itemConfig.unidadeMedida}s)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={minimoInput}
                  onChange={(e) => setMinimoInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Contagem Física no Depósito (Saldo atual: {itemConfig.quantidade})
                </label>
                <input
                  type="number"
                  min={0}
                  value={contagemFisicaInput}
                  onChange={(e) => setContagemFisicaInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                {Number(contagemFisicaInput) !== itemConfig.quantidade && (
                  <input
                    type="text"
                    required
                    value={justificativaAjuste}
                    onChange={(e) => setJustificativaAjuste(e.target.value)}
                    placeholder="Justificativa obrigatória do ajuste físico *"
                    className="w-full rounded-xl border border-amber-500/50 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setItemConfig(null)}
                  className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Transferência de Suprimentos entre Abrigos */}
      {itemTransferencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Transferir {itemTransferencia.nome} (Saldo: {itemTransferencia.quantidade})
            </h3>
            <form onSubmit={confirmarTransferencia} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Abrigo de Destino</label>
                <select
                  required
                  value={idAbrigoDestino}
                  onChange={(e) => setIdAbrigoDestino(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {abrigosDestino.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  max={itemTransferencia.quantidade}
                  required
                  value={qtdTransferencia}
                  onChange={(e) => setQtdTransferencia(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observação / Motivo *</label>
                <input
                  type="text"
                  required
                  value={obsTransferencia}
                  onChange={(e) => setObsTransferencia(e.target.value)}
                  placeholder="Ex.: Apoio emergencial ao abrigo vizinho"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setItemTransferencia(null)}
                  className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  Confirmar Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Histórico Imutável de Movimentações do Abrigo (RF13) */}
      {mostrarHistorico && podeClassificar && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">
                Histórico de Movimentações de Estoque (RF13)
              </h2>
              <p className="text-xs text-slate-400">
                Livro-razão imutável de entradas, saídas, perdas, ajustes e transferências do abrigo.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <select
                value={filtroItemHist}
                onChange={(e) => setFiltroItemHist(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              >
                <option value="">Todos os itens</option>
                {itens.map((i) => (
                  <option key={i.idItem} value={String(i.idItem)}>
                    {i.nome}
                  </option>
                ))}
              </select>
              <select
                value={filtroTipoHist}
                onChange={(e) => setFiltroTipoHist(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              >
                <option value="">Todos os tipos</option>
                <option value="ENTRADA_DOACAO">ENTRADA_DOACAO</option>
                <option value="SAIDA_CONSUMO">SAIDA_CONSUMO</option>
                <option value="PERDA">PERDA</option>
                <option value="AJUSTE">AJUSTE</option>
                <option value="TRANSFERENCIA_ENTRADA">TRANSFERENCIA_ENTRADA</option>
                <option value="TRANSFERENCIA_SAIDA">TRANSFERENCIA_SAIDA</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-semibold">Data / Hora</th>
                  <th className="pb-2.5 font-semibold">Item</th>
                  <th className="pb-2.5 font-semibold">Tipo</th>
                  <th className="pb-2.5 font-semibold">Variação / Saldo</th>
                  <th className="pb-2.5 font-semibold">Responsável / Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {movimentacoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Nenhuma movimentação encontrada para o filtro selecionado.
                    </td>
                  </tr>
                ) : (
                  movimentacoes.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-slate-400 font-mono">
                        {new Date(m.dataHora).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-white">{m.item}</td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                          {m.tipo}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono">
                        <span className={m.quantidade > 0 ? "text-emerald-300 font-bold" : "text-amber-300 font-bold"}>
                          {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                        </span>{" "}
                        <span className="text-slate-400">→ saldo {m.quantidadeResultante}</span>
                      </td>
                      <td className="py-2.5 text-slate-300">
                        {m.usuario}
                        {m.abrigoContraparte && (
                          <span className="text-sky-300"> ({m.abrigoContraparte})</span>
                        )}
                        {m.observacao && <span className="text-slate-400"> • {m.observacao}</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

