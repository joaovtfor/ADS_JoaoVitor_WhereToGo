"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ToastFlutuante, useAdmin, type NivelOcupacao, type StatusInfraestrutura } from "../contexto-admin";

interface DadosDashboard {
  abrigo: {
    id: number;
    nome: string;
    ativo: boolean;
    statusInfraestrutura: StatusInfraestrutura;
  };
  ocupacao: {
    capacidadeMaxima: number;
    lotacaoAtual: number;
    vagasDisponiveis: number;
    percentual: number;
    nivel: NivelOcupacao;
  };
  acolhidos: {
    presentes: number;
    naoTriados: number;
    entradas24h: number;
    desligados24h: number;
    recebidas24h: number;
    enviadas24h: number;
  };
  estoque: {
    itensEmEstoque: number;
    itensUrgentes: number;
    itensBloqueados: number;
    itensCriticos: Array<{
      idItem: number;
      nome: string;
      unidadeMedida: string;
      categoria: string;
      quantidade: number;
      quantidadeMinima: number;
      statusNecessidade: "URGENTE" | "NORMAL" | "BLOQUEADO";
      motivo: "URGENTE" | "ABAIXO_DO_MINIMO";
    }>;
  };
  ocorrenciasAtivas: Array<{
    id: number;
    tipo: string;
    gravidade: "ALERTA" | "CRITICO";
    descricao: string | null;
    latitude: number | null;
    longitude: number | null;
    dataRegistro: string;
  }>;
  ultimasMovimentacoes: Array<{
    id: number;
    tipo: string;
    quantidade: number;
    quantidadeResultante: number;
    dataHora: string;
    item: string;
    usuario: string;
  }>;
}

const ROTULOS_OCORRENCIA: Record<string, string> = {
  SEM_ENERGIA: "Sem Energia Elétrica",
  SEM_AGUA: "Sem Abastecimento de Água",
  SEM_COMUNICACAO: "Sem Internet / Comunicação",
  VIA_BLOQUEADA: "Via de Acesso Bloqueada",
  ALAGAMENTO: "Alagamento no Entorno",
  DESLIZAMENTO: "Risco de Deslizamento",
  RISCO_ESTRUTURAL: "Risco Estrutural no Prédio",
  OUTRO: "Outra Ocorrência",
};

const BARRA_OCUPACAO: Record<NivelOcupacao, string> = {
  VERDE: "bg-emerald-500",
  AMARELO: "bg-amber-500",
  VERMELHO: "bg-rose-500",
};

const ROTULO_SEMAFORO: Record<NivelOcupacao, string> = {
  VERDE: "Normal",
  AMARELO: "Atenção",
  VERMELHO: "Lotado / Crítico",
};

export default function PaginaDashboard() {
  const { idAbrigoAtivo, abrigoAtivo, recarregarAbrigos } = useAdmin();
  const [dados, setDados] = useState<DadosDashboard | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  // Edição rápida de capacidade e telefone
  const [editandoOperacao, setEditandoOperacao] = useState(false);
  const [novaCapacidade, setNovaCapacidade] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      const resposta = await api<DadosDashboard>(`/api/abrigos/${idAbrigoAtivo}/dashboard`);
      setDados(resposta);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigoAtivo]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  async function ajustarNaoTriados(delta: number) {
    if (!dados || !idAbrigoAtivo) return;
    const novoValor = Math.max(0, dados.acolhidos.naoTriados + delta);
    setProcessando(true);
    setErro(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}`, {
        method: "PATCH",
        body: JSON.stringify({ acolhidosNaoTriados: novoValor }),
      });
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso(`Fila de triagem ajustada para ${novoValor} pessoa(s).`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setProcessando(false);
    }
  }

  async function salvarOperacao(e: FormEvent) {
    e.preventDefault();
    if (!idAbrigoAtivo) return;
    setProcessando(true);
    setErro(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}`, {
        method: "PATCH",
        body: JSON.stringify({
          capacidadeMaxima: Number(novaCapacidade),
          telefone: novoTelefone.trim() || null,
        }),
      });
      setEditandoOperacao(false);
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso("Capacidade e contato atualizados.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setProcessando(false);
    }
  }

  async function alterarStatusItem(idItem: number, statusNecessidade: "URGENTE" | "NORMAL" | "BLOQUEADO") {
    if (!idAbrigoAtivo) return;
    setProcessando(true);
    setErro(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}/estoque/${idItem}`, {
        method: "PATCH",
        body: JSON.stringify({ statusNecessidade }),
      });
      await carregar();
      setAviso(`Status do item alterado para ${statusNecessidade}.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setProcessando(false);
    }
  }

  async function resolverOcorrencia(idOcorrencia: number) {
    if (!idAbrigoAtivo) return;
    setProcessando(true);
    setErro(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}/ocorrencias/${idOcorrencia}/resolucao`, {
        method: "POST",
        body: JSON.stringify({ observacao: "Resolvido pelo painel de visão geral" }),
      });
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso("Ocorrência marcada como resolvida.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setProcessando(false);
    }
  }

  async function alternarAlertaRapido(tipo: string) {
    if (!idAbrigoAtivo || !dados) return;
    const ativasDoTipo = dados.ocorrenciasAtivas.filter((o) => o.tipo === tipo);
    if (ativasDoTipo.length > 0) {
      setProcessando(true);
      setErro(null);
      try {
        await Promise.all(
          ativasDoTipo.map((o) =>
            api(`/api/abrigos/${idAbrigoAtivo}/ocorrencias/${o.id}/resolucao`, {
              method: "POST",
              body: JSON.stringify({ observacao: "Desativado pelo atalho rápido do painel" }),
            }),
          ),
        );
        await Promise.all([carregar(), recarregarAbrigos()]);
        setAviso(`Alerta "${ROTULOS_OCORRENCIA[tipo] ?? tipo}" encerrado.`);
      } catch (err) {
        setErro(mensagemErro(err));
      } finally {
        setProcessando(false);
      }
      return;
    }

    setProcessando(true);
    setErro(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}/ocorrencias`, {
        method: "POST",
        body: JSON.stringify({ tipo }),
      });
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso(`Alerta "${ROTULOS_OCORRENCIA[tipo] ?? tipo}" publicado no mapa.`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setProcessando(false);
    }
  }

  if (!idAbrigoAtivo) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
        Selecione um abrigo no topo para visualizar a Visão Geral.
      </div>
    );
  }

  if (carregando && !dados) {
    return <div className="py-12 text-center text-sm text-slate-400">Carregando indicadores do abrigo...</div>;
  }

  if (!dados) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-6 text-rose-200">
        {erro ?? "Não foi possível carregar os indicadores do abrigo."}
      </div>
    );
  }

  const { ocupacao, acolhidos, estoque, ocorrenciasAtivas, ultimasMovimentacoes } = dados;
  const somenteLeitura = !dados.abrigo.ativo;

  return (
    <div className="space-y-6">
      <ToastFlutuante
        erro={erro}
        aviso={aviso}
        aoFecharErro={() => setErro(null)}
        aoFecharAviso={() => setAviso(null)}
      />

      {/* Cabeçalho do Abrigo */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Visão Geral do Abrigo
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{dados.abrigo.nome}</h1>
          {abrigoAtivo?.endereco && <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{abrigoAtivo.endereco}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={somenteLeitura}
            onClick={() => {
              setNovaCapacidade(String(ocupacao.capacidadeMaxima));
              setNovoTelefone(abrigoAtivo?.telefone ?? "");
              setEditandoOperacao((v) => !v);
            }}
            className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            ⚙️ Capacidade & Contato
          </button>
          <button
            type="button"
            onClick={() => carregar()}
            className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            ↻ Atualizar
          </button>
        </div>
      </div>

      {/* Formulário inline de capacidade e telefone */}
      {editandoOperacao && (
        <form
          onSubmit={salvarOperacao}
          className="rounded-2xl border border-amber-500/40 bg-slate-900 p-4 flex flex-wrap items-end gap-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Capacidade Máxima (vagas)</label>
            <input
              type="number"
              min={Math.max(1, ocupacao.lotacaoAtual)}
              required
              value={novaCapacidade}
              onChange={(e) => setNovaCapacidade(e.target.value)}
              className="w-40 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white tabular-nums"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-300 mb-1">Telefone de Emergência</label>
            <input
              type="text"
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(e.target.value)}
              placeholder="(54) 99999-0000"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={processando}
              className="min-h-10 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditandoOperacao(false)}
              className="min-h-10 rounded-xl border border-slate-700 px-3.5 py-2 text-xs text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Grade Principal: Ocupação + Triagem Rápida e Status de Infraestrutura */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Ocupação e Triagem Rápida */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base sm:text-lg font-bold text-white">Ocupação e Recepção</h2>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-bold tabular-nums ${
                  ocupacao.nivel === "VERDE"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : ocupacao.nivel === "AMARELO"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {ROTULO_SEMAFORO[ocupacao.nivel]} • {ocupacao.percentual}%
              </span>
            </div>

            {/* Barra de progresso */}
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
              <div
                className={`h-full transition-all ${BARRA_OCUPACAO[ocupacao.nivel]}`}
                style={{ width: `${Math.min(100, ocupacao.percentual)}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">Lotação Total</p>
                <p className="text-xl font-black text-white tabular-nums">
                  {ocupacao.lotacaoAtual}
                  <span className="text-xs font-normal text-slate-400">/{ocupacao.capacidadeMaxima}</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">Vagas Livres</p>
                <p className="text-xl font-black text-emerald-400 tabular-nums">{ocupacao.vagasDisponiveis}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">Cadastrados</p>
                <p className="text-xl font-black text-sky-300 tabular-nums">{acolhidos.presentes}</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                <p className="text-[11px] text-amber-300">Aguardando Cadastro</p>
                <p className="text-xl font-black text-amber-300 tabular-nums">{acolhidos.naoTriados}</p>
              </div>
            </div>
          </div>

          {/* Controle Rápido de Acolhidos Não Triados */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-200">
                Chegadas em Massa (Reserva Rápida de Vagas)
              </p>
              <p className="text-[11px] text-slate-400">
                Reserva vagas imediatamente no mapa público enquanto as famílias aguardam o check-in nominal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[-5, -1, 1, 5, 10].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  disabled={
                    somenteLeitura ||
                    processando ||
                    (delta < 0 && acolhidos.naoTriados === 0) ||
                    (delta > 0 && ocupacao.vagasDisponiveis < delta)
                  }
                  onClick={() => ajustarNaoTriados(delta)}
                  className={`min-h-12 flex-1 rounded-xl border px-3 py-2 text-sm font-bold tabular-nums transition cursor-pointer disabled:opacity-40 ${
                    delta > 0
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
              <Link
                href="/admin/abrigados"
                className="min-h-12 inline-flex items-center justify-center rounded-xl bg-sky-500/20 border border-sky-500/40 px-3.5 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/30"
              >
                Fazer Check-in →
              </Link>
            </div>
          </div>

          {/* Fluxo das últimas 24h */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-2 border-t border-slate-800 tabular-nums">
            <span>Últimas 24h:</span>
            <span>Entradas: <strong className="text-slate-200">{acolhidos.entradas24h}</strong></span>
            <span>Saídas: <strong className="text-slate-200">{acolhidos.desligados24h}</strong></span>
            <span>Recebidos: <strong className="text-slate-200">{acolhidos.recebidas24h}</strong></span>
            <span>Transferidos: <strong className="text-slate-200">{acolhidos.enviadas24h}</strong></span>
          </div>
        </section>

        {/* Card 2: Status de Infraestrutura e Vias de Acesso */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Infraestrutura e Vias de Acesso</h2>
                <p className="text-xs text-slate-400">
                  Alertas ativos avisam a população no mapa público em tempo real.
                </p>
              </div>
              <Link
                href="/admin/ocorrencias"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-slate-800"
              >
                Detalhes →
              </Link>
            </div>

            {ocorrenciasAtivas.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">
                ✓ Energia, água e vias de acesso operando normalmente.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {ocorrenciasAtivas.map((oc) => (
                  <li
                    key={oc.id}
                    className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                      oc.gravidade === "CRITICO"
                        ? "border-rose-500/40 bg-rose-950/30"
                        : "border-amber-500/40 bg-amber-950/30"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-black ${
                            oc.gravidade === "CRITICO" ? "bg-rose-500 text-slate-950" : "bg-amber-400 text-slate-950"
                          }`}
                        >
                          {oc.gravidade}
                        </span>
                        <span className="text-sm font-bold text-white">
                          {ROTULOS_OCORRENCIA[oc.tipo] ?? oc.tipo}
                        </span>
                      </div>
                      {oc.descricao && <p className="text-xs text-slate-300 mt-1">{oc.descricao}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={somenteLeitura || processando}
                      onClick={() => resolverOcorrencia(oc.id)}
                      className="min-h-9 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 cursor-pointer"
                    >
                      ✓ Resolver
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Toggles Rápidos de Incidentes */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2.5">
            <p className="text-xs font-bold text-slate-300">
              Atalhos de Alerta Rápido (toque para ativar ou encerrar):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { tipo: "SEM_ENERGIA", rotulo: "⚡ Sem Energia" },
                { tipo: "SEM_AGUA", rotulo: "🚰 Sem Água" },
                { tipo: "SEM_COMUNICACAO", rotulo: "📡 Sem Sinal" },
                { tipo: "VIA_BLOQUEADA", rotulo: "🚧 Via Bloqueada" },
                { tipo: "ALAGAMENTO", rotulo: "🌊 Alagamento" },
                { tipo: "DESLIZAMENTO", rotulo: "⛰️ Deslizamento" },
                { tipo: "RISCO_ESTRUTURAL", rotulo: "🏚️ Risco Prédio" },
              ].map((alerta) => {
                const jaAtiva = ocorrenciasAtivas.some((o) => o.tipo === alerta.tipo);
                return (
                  <button
                    key={alerta.tipo}
                    type="button"
                    disabled={somenteLeitura || processando}
                    aria-pressed={jaAtiva}
                    onClick={() => alternarAlertaRapido(alerta.tipo)}
                    className={`min-h-11 rounded-xl border px-2.5 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-40 ${
                      jaAtiva
                        ? "border-rose-500 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {jaAtiva ? `${alerta.rotulo} • ATIVO` : alerta.rotulo}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Grade Inferior: Suprimentos Críticos e Últimas Movimentações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suprimentos Críticos */}
        <section className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Suprimentos em Alerta</h2>
              <p className="text-xs text-slate-400">
                Itens marcados como urgentes aparecem em destaque para doadores no mapa público.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <span className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 font-bold text-rose-200">
                Urgentes: {estoque.itensUrgentes}
              </span>
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-bold text-slate-300">
                Bloqueados: {estoque.itensBloqueados}
              </span>
              <Link
                href="/admin/inventario"
                className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-slate-950 hover:bg-amber-400"
              >
                Ir para Estoque →
              </Link>
            </div>
          </div>

          {estoque.itensCriticos.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-400">
              ✓ Todos os insumos estão acima do estoque mínimo e sem alertas urgentes.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="pb-2.5 font-semibold">Item</th>
                    <th className="pb-2.5 font-semibold">Saldo / Mínimo</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                    <th className="pb-2.5 text-right font-semibold">Alterar Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {estoque.itensCriticos.map((item) => (
                    <tr key={item.idItem}>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-white">{item.nome}</p>
                        <p className="text-xs text-slate-400">{item.unidadeMedida}</p>
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        <span className={item.quantidade < item.quantidadeMinima ? "text-rose-400 font-bold" : "text-white"}>
                          {item.quantidade}
                        </span>
                        <span className="text-slate-500"> / mín. {item.quantidadeMinima}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            item.statusNecessidade === "URGENTE"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : item.statusNecessidade === "BLOQUEADO"
                                ? "bg-slate-700 text-slate-300"
                                : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {item.statusNecessidade}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {(["URGENTE", "NORMAL", "BLOQUEADO"] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              disabled={somenteLeitura || processando || item.statusNecessidade === st}
                              onClick={() => alterarStatusItem(item.idItem, st)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer disabled:opacity-40 ${
                                item.statusNecessidade === st
                                  ? "bg-amber-500 text-slate-950"
                                  : "border border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Últimas Movimentações */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-white">Últimas Movimentações</h2>
          {ultimasMovimentacoes.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma movimentação registrada neste abrigo.</p>
          ) : (
            <ul className="space-y-2.5">
              {ultimasMovimentacoes.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{m.item}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {m.usuario} • {m.tipo}
                    </p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <span
                      className={`text-sm font-bold ${
                        m.quantidade > 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                    </span>
                    <p className="text-[11px] text-slate-500">Saldo: {m.quantidadeResultante}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
