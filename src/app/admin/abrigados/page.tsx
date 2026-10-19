"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ToastFlutuante, useAdmin } from "../contexto-admin";

interface Abrigado {
  id: number;
  idAbrigoAtual: number;
  abrigoAtual: string;
  nomeCompleto: string;
  cpf: string | null;
  dataNascimento: string | null;
  dataEntrada: string;
  dataSaida: string | null;
  statusAcolhimento: "PRESENTE" | "DESLIGADO";
}

interface PaginaAbrigados {
  itens: Abrigado[];
  paginacao: { pagina: number; tamanho: number; total: number; totalPaginas: number };
}

interface TransferenciaHistorico {
  id: number;
  dataTransferencia: string;
  motivo: string;
  idAbrigoOrigem: number;
  abrigoOrigem: string;
  idAbrigoDestino: number;
  abrigoDestino: string;
  usuario: string;
}

const MOTIVOS_SAIDA_RAPIDOS = [
  "Retorno para residência",
  "Acolhido por familiares",
  "Encaminhamento hospitalar / social",
];

function formatarCpf(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return cpf ?? "Sem documento";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export default function PaginaAbrigados() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, abrigos, recarregarAbrigos } = useAdmin();
  const podeGerenciar = usuario.papel === "ADMIN" || usuario.papel === "COORDENADOR";
  const somenteLeitura = abrigoAtivo ? !abrigoAtivo.ativo : false;

  const [dados, setDados] = useState<PaginaAbrigados | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<"PRESENTE" | "DESLIGADO" | "TODOS">("PRESENTE");
  const [buscaInput, setBuscaInput] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Formulário de Check-in
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [cpf, setCpf] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [descontarDaTriagem, setDescontarDaTriagem] = useState(true);

  // Modal de Confirmação de Saída (prevenção de toque acidental)
  const [alvoSaida, setAlvoSaida] = useState<Abrigado | null>(null);
  const [motivoSaida, setMotivoSaida] = useState(MOTIVOS_SAIDA_RAPIDOS[0]);

  // Modal de Transferência / Histórico
  const [alvoTransferencia, setAlvoTransferencia] = useState<Abrigado | null>(null);
  const [idAbrigoDestino, setIdAbrigoDestino] = useState<number | "">("");
  const [motivoTransferencia, setMotivoTransferencia] = useState("");
  const [historicoAberto, setHistoricoAberto] = useState<{ abrigado: Abrigado; lista: TransferenciaHistorico[] } | null>(
    null,
  );

  // Modal de Edição
  const [alvoEdicao, setAlvoEdicao] = useState<Abrigado | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [cpfEdicao, setCpfEdicao] = useState("");
  const [nascimentoEdicao, setNascimentoEdicao] = useState("");

  // Debounce de 300ms na busca textual para preservar banda 3G (RNF01)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaDebounced(buscaInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [buscaInput]);

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      const params = new URLSearchParams({ status: statusFiltro, tamanho: "100" });
      if (buscaDebounced) params.set("busca", buscaDebounced);
      const res = await api<PaginaAbrigados>(`/api/abrigos/${idAbrigoAtivo}/abrigados?${params.toString()}`);
      setDados(res);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigoAtivo, statusFiltro, buscaDebounced]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  async function registrarCheckin(e: FormEvent) {
    e.preventDefault();
    if (!idAbrigoAtivo || somenteLeitura) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await api<{ abrigado: Abrigado; reentrada: boolean }>(
        `/api/abrigos/${idAbrigoAtivo}/abrigados`,
        {
          method: "POST",
          body: JSON.stringify({
            nomeCompleto,
            cpf: cpf.trim() || null,
            dataNascimento: dataNascimento || null,
            descontarDaTriagem: descontarDaTriagem && (abrigoAtivo?.acolhidosNaoTriados ?? 0) > 0,
          }),
        },
      );
      setNomeCompleto("");
      setCpf("");
      setDataNascimento("");
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso(
        res.reentrada
          ? `Reentrada registrada para ${res.abrigado.nomeCompleto}.`
          : `Check-in de ${res.abrigado.nomeCompleto} concluído.`,
      );
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarSaida(e: FormEvent) {
    e.preventDefault();
    if (!alvoSaida || somenteLeitura) return;
    setEnviando(true);
    setErro(null);
    try {
      await api(`/api/abrigados/${alvoSaida.id}/desligamento`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoSaida.trim() || "Saída registrada no painel" }),
      });
      const nome = alvoSaida.nomeCompleto;
      setAlvoSaida(null);
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso(`Saída de ${nome} registrada e vaga liberada.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarTransferencia(e: FormEvent) {
    e.preventDefault();
    if (!alvoTransferencia || !idAbrigoDestino || somenteLeitura) return;
    setEnviando(true);
    setErro(null);
    try {
      await api(`/api/abrigados/${alvoTransferencia.id}/transferencias`, {
        method: "POST",
        body: JSON.stringify({
          idAbrigoDestino: Number(idAbrigoDestino),
          motivo: motivoTransferencia,
        }),
      });
      const nome = alvoTransferencia.nomeCompleto;
      setAlvoTransferencia(null);
      setMotivoTransferencia("");
      setIdAbrigoDestino("");
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso(`${nome} transferido(a) com sucesso.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function abrirHistorico(abrigado: Abrigado) {
    setErro(null);
    try {
      const lista = await api<TransferenciaHistorico[]>(`/api/abrigados/${abrigado.id}/transferencias`);
      setHistoricoAberto({ abrigado, lista });
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault();
    if (!alvoEdicao || somenteLeitura) return;
    setEnviando(true);
    setErro(null);
    try {
      await api(`/api/abrigados/${alvoEdicao.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nomeCompleto: nomeEdicao,
          cpf: cpfEdicao.trim() || null,
          dataNascimento: nascimentoEdicao || null,
        }),
      });
      setAlvoEdicao(null);
      await carregar();
      setAviso("Dados do acolhido atualizados.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  const abrigosDestino = abrigos.filter(
    (a) => a.ativo && a.id !== idAbrigoAtivo && a.ocupacao.vagasDisponiveis > 0,
  );

  if (!idAbrigoAtivo) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
        Selecione um abrigo no topo para gerenciar acolhidos.
      </div>
    );
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
          Acolhidos e Portaria
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          {abrigoAtivo?.nome}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Registre entradas na recepção (com ou sem documentos), confirme saídas e realize transferências entre abrigos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Check-in */}
        <section className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white">Check-in de Acolhido</h2>
            {abrigoAtivo && (
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 tabular-nums">
                {abrigoAtivo.ocupacao.vagasDisponiveis} vagas livres
              </span>
            )}
          </div>

          <form onSubmit={registrarCheckin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                disabled={somenteLeitura}
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Ex.: Maria Aparecida dos Santos"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base sm:text-sm text-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                CPF (opcional)
              </label>
              <input
                type="text"
                disabled={somenteLeitura}
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base sm:text-sm text-white tabular-nums disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Data de Nascimento (opcional)</label>
              <input
                type="date"
                disabled={somenteLeitura}
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base sm:text-sm text-white disabled:opacity-50"
              />
            </div>

            {(abrigoAtivo?.acolhidosNaoTriados ?? 0) > 0 && (
              <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={somenteLeitura}
                  checked={descontarDaTriagem}
                  onChange={(e) => setDescontarDaTriagem(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                />
                <span className="text-xs text-amber-200">
                  <strong>Converter da fila de espera</strong> ({abrigoAtivo?.acolhidosNaoTriados} aguardando):
                  mantém a lotação total sem consumir uma nova vaga.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={somenteLeitura || enviando}
              className="w-full min-h-12 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              {enviando ? "Registrando..." : "Confirmar Check-in"}
            </button>
          </form>
        </section>

        {/* Lista de Acolhidos */}
        <section className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <input
                type="search"
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                placeholder="Buscar por nome ou CPF..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-base sm:text-sm text-white"
              />
              {buscaInput && (
                <button
                  type="button"
                  onClick={() => setBuscaInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
              {(["PRESENTE", "DESLIGADO", "TODOS"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFiltro(st)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                    statusFiltro === st ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {st === "PRESENTE" ? "Presentes" : st === "DESLIGADO" ? "Saídas" : "Todos"}
                </button>
              ))}
            </div>
          </div>

          {carregando ? (
            <p className="py-8 text-center text-sm text-slate-400">Carregando lista de acolhidos...</p>
          ) : !dados || dados.itens.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center text-sm text-slate-400">
              Nenhum registro encontrado para este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="pb-2.5 font-semibold">Nome Completo / Documento</th>
                    <th className="pb-2.5 font-semibold">Entrada / Saída</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                    <th className="pb-2.5 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {dados.itens.map((ab) => (
                    <tr key={ab.id}>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-white">{ab.nomeCompleto}</p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          CPF: {formatarCpf(ab.cpf)}
                          {ab.dataNascimento ? ` • Nasc.: ${ab.dataNascimento}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-300 tabular-nums">
                        <p>Entrada: {new Date(ab.dataEntrada).toLocaleString("pt-BR")}</p>
                        {ab.dataSaida && (
                          <p className="text-slate-500">Saída: {new Date(ab.dataSaida).toLocaleString("pt-BR")}</p>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            ab.statusAcolhimento === "PRESENTE"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {ab.statusAcolhimento === "PRESENTE" ? "PRESENTE" : "SAIU"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirHistorico(ab)}
                            className="min-h-8 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                          >
                            Histórico
                          </button>
                          {podeGerenciar && (
                            <>
                              <button
                                type="button"
                                disabled={somenteLeitura}
                                onClick={() => {
                                  setAlvoEdicao(ab);
                                  setNomeEdicao(ab.nomeCompleto);
                                  setCpfEdicao(ab.cpf ?? "");
                                  setNascimentoEdicao(ab.dataNascimento ?? "");
                                }}
                                className="min-h-8 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                              >
                                Editar
                              </button>
                              {ab.statusAcolhimento === "PRESENTE" && (
                                <>
                                  <button
                                    type="button"
                                    disabled={somenteLeitura}
                                    onClick={() => {
                                      setAlvoTransferencia(ab);
                                      setIdAbrigoDestino(abrigosDestino[0]?.id ?? "");
                                      setMotivoTransferencia("");
                                    }}
                                    className="min-h-8 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-40 cursor-pointer"
                                  >
                                    Transferir
                                  </button>
                                  <button
                                    type="button"
                                    disabled={somenteLeitura || enviando}
                                    onClick={() => {
                                      setAlvoSaida(ab);
                                      setMotivoSaida(MOTIVOS_SAIDA_RAPIDOS[0]);
                                    }}
                                    className="min-h-8 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 cursor-pointer"
                                  >
                                    Dar Saída
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Modal de Confirmação de Saída (Evita baixa acidental em 1 toque) */}
      {alvoSaida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Confirmar Saída de {alvoSaida.nomeCompleto}
            </h3>
            <p className="text-xs text-slate-400">
              Esta ação encerra o acolhimento atual e libera 1 vaga no abrigo. O histórico permanece salvo.
            </p>
            <form onSubmit={confirmarSaida} className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Motivo da saída:</label>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_SAIDA_RAPIDOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotivoSaida(m)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                        motivoSaida === m
                          ? "border-amber-500 bg-amber-500/20 text-amber-200"
                          : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={motivoSaida}
                  onChange={(e) => setMotivoSaida(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAlvoSaida(null)}
                  className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {enviando ? "Confirmando..." : "Confirmar Saída"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Transferência */}
      {alvoTransferencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Transferir {alvoTransferencia.nomeCompleto}
            </h3>
            {abrigosDestino.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-300">
                  Não há outros abrigos ativos com vagas disponíveis no momento.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAlvoTransferencia(null)}
                    className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={confirmarTransferencia} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Abrigo de Destino</label>
                  <select
                    required
                    value={idAbrigoDestino}
                    onChange={(e) => setIdAbrigoDestino(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                  >
                    {abrigosDestino.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome} ({a.ocupacao.vagasDisponiveis} vagas livres)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Motivo da Transferência *</label>
                  <input
                    type="text"
                    required
                    value={motivoTransferencia}
                    onChange={(e) => setMotivoTransferencia(e.target.value)}
                    placeholder="Ex.: Reunificação familiar / atendimento médico"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAlvoTransferencia(null)}
                    className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={enviando}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                  >
                    Confirmar Transferência
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {alvoEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Editar Cadastro do Acolhido</h3>
            <form onSubmit={salvarEdicao} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={nomeEdicao}
                  onChange={(e) => setNomeEdicao(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CPF</label>
                <input
                  type="text"
                  value={cpfEdicao}
                  onChange={(e) => setCpfEdicao(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Data de Nascimento</label>
                <input
                  type="date"
                  value={nascimentoEdicao}
                  onChange={(e) => setNascimentoEdicao(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAlvoEdicao(null)}
                  className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Transferências */}
      {historicoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Transferências de {historicoAberto.abrigado.nomeCompleto}
              </h3>
              <button
                type="button"
                onClick={() => setHistoricoAberto(null)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            {historicoAberto.lista.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma transferência registrada para este acolhido.</p>
            ) : (
              <ul className="space-y-2.5 max-h-80 overflow-y-auto">
                {historicoAberto.lista.map((t) => (
                  <li key={t.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
                    <p className="font-semibold text-white">
                      {t.abrigoOrigem} → {t.abrigoDestino}
                    </p>
                    <p className="text-slate-300">Motivo: {t.motivo}</p>
                    <p className="text-slate-500 tabular-nums">
                      Autorizado por {t.usuario} em {new Date(t.dataTransferencia).toLocaleString("pt-BR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
