"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErroClienteApi, api, mensagemErro } from "@/lib/cliente-api";
import {
  formatarDelta,
  type FeedbackItem,
  type ItemEstoque,
  type ModoSaida,
  type MovimentoOffline,
  type RespostaMovimento,
  type StatusNecessidade,
  type ToqueRecente,
} from "./tipos";
import { ROTULO_NECESSIDADE } from "../rotulos";

const CHAVE_FILA_OFFLINE = "wtg:inventario:fila-offline";

function vibrarToque(ms = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    // Dispositivo sem vibração
  }
}

function novoUid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function lerFilaOffline(): MovimentoOffline[] {
  try {
    const salvo = window.localStorage.getItem(CHAVE_FILA_OFFLINE);
    return salvo ? (JSON.parse(salvo) as MovimentoOffline[]) : [];
  } catch {
    return [];
  }
}

function gravarFilaOffline(fila: MovimentoOffline[]) {
  try {
    if (fila.length === 0) window.localStorage.removeItem(CHAVE_FILA_OFFLINE);
    else window.localStorage.setItem(CHAVE_FILA_OFFLINE, JSON.stringify(fila));
  } catch {
    // Sem espaço no localStorage
  }
}

/**
 * Dados e ações do estoque de um abrigo: lista de itens, lançamentos rápidos
 * com atualização otimista, fila de reenvio para quando a rede cai e as ações
 * de gestão (classificar, ajustar, transferir).
 */
export function useEstoque(idAbrigo: number | null, somenteLeitura: boolean) {
  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [incluirCatalogo, setIncluirCatalogo] = useState(true);
  const [modoSaida, setModoSaida] = useState<ModoSaida>("SAIDA_CONSUMO");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);
  const [feedbackPorItem, setFeedbackPorItem] = useState<Record<number, FeedbackItem>>({});
  const [toquesRecentes, setToquesRecentes] = useState<ToqueRecente[]>([]);
  const [filaOffline, setFilaOffline] = useState<MovimentoOffline[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  /** Sobe a cada lançamento confirmado: quem lista movimentações (histórico) recarrega. */
  const [versaoMovimentos, setVersaoMovimentos] = useState(0);

  // Fila sequencial por item: toques repetidos em rede lenta chegam na ordem certa.
  const filasPorItemRef = useRef<Map<number, Promise<void>>>(new Map());
  // Envios ainda na fila por item: o saldo do servidor só substitui o otimista
  // quando a fila esvazia (senão o número "pisca" 13 -> 11 -> 12 -> 13).
  const pendentesPorItemRef = useRef<Map<number, number>>(new Map());

  const carregar = useCallback(async () => {
    if (!idAbrigo) return;
    const chaveCache = `wtg:inventario:cache:${idAbrigo}`;
    try {
      const qs = incluirCatalogo ? "?incluirCatalogo=true" : "";
      const lista = await api<ItemEstoque[]>(`/api/abrigos/${idAbrigo}/estoque${qs}`);
      setItens(lista);
      try {
        window.localStorage.setItem(chaveCache, JSON.stringify(lista));
      } catch {
        // Sem espaço no localStorage
      }
      setErro(null);
    } catch (err) {
      // Falha de rede (não de regra): mostra a última lista salva neste aparelho.
      if (!(err instanceof ErroClienteApi)) {
        try {
          const cacheado = window.localStorage.getItem(chaveCache);
          if (cacheado) {
            setItens(JSON.parse(cacheado) as ItemEstoque[]);
            setAviso("Sem conexão. Mostrando o estoque salvo neste aparelho; seus lançamentos ficam guardados para envio.");
            return;
          }
        } catch {
          // Cache ilegível
        }
      }
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigo, incluirCatalogo]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  // A fila salva só existe no navegador: é lida depois da primeira renderização.
  useEffect(() => {
    void Promise.resolve().then(() => setFilaOffline(lerFilaOffline()));
  }, []);

  const descartarFila = useCallback(() => {
    setFilaOffline([]);
    gravarFilaOffline([]);
  }, []);

  const sincronizarFila = useCallback(async () => {
    if (sincronizando || filaOffline.length === 0) return;
    setSincronizando(true);
    const restantes: MovimentoOffline[] = [];
    let enviados = 0;

    for (const movimento of filaOffline) {
      try {
        await api<RespostaMovimento>(`/api/abrigos/${movimento.idAbrigo}/estoque/${movimento.idItem}/movimentacoes`, {
          method: "POST",
          body: JSON.stringify(movimento.corpo),
        });
        enviados++;
      } catch (err) {
        // Continua sem rede: tenta de novo depois. Recusado pelo servidor: descarta.
        if (!(err instanceof ErroClienteApi)) restantes.push(movimento);
      }
    }

    setFilaOffline(restantes);
    gravarFilaOffline(restantes);
    setSincronizando(false);
    if (enviados > 0) {
      await carregar();
      setVersaoMovimentos((v) => v + 1);
      setAviso(enviados === 1 ? "1 lançamento pendente foi enviado." : `${enviados} lançamentos pendentes foram enviados.`);
    }
  }, [sincronizando, filaOffline, carregar]);

  useEffect(() => {
    const aoReconectar = () => void sincronizarFila();
    window.addEventListener("online", aoReconectar);
    return () => window.removeEventListener("online", aoReconectar);
  }, [sincronizarFila]);

  /**
   * Fila sequencial por item com atualização otimista: o número muda no toque
   * e o saldo do servidor só é aplicado quando não há mais envios pendentes.
   */
  const enfileirar = useCallback(
    (
      item: ItemEstoque,
      delta: number,
      enviar: () => Promise<RespostaMovimento>,
      aoConfirmar?: (resposta: RespostaMovimento) => void,
      corpoOffline?: Record<string, unknown>,
    ) => {
      const { idItem } = item;
      setErro(null);

      // Otimista: status estimado até o servidor responder.
      setItens((atual) =>
        atual.map((i) => {
          if (i.idItem !== idItem) return i;
          const quantidade = Math.max(0, i.quantidade + delta);
          const statusNecessidade = i.statusNecessidade === "NORMAL" && quantidade < i.quantidadeMinima ? "URGENTE" : i.statusNecessidade;
          return { ...i, quantidade, statusNecessidade, critico: statusNecessidade === "URGENTE" || quantidade < i.quantidadeMinima };
        }),
      );
      setFeedbackPorItem((anterior) => {
        const atual = anterior[idItem] ?? { pendentes: 0, ultimoDelta: null };
        return { ...anterior, [idItem]: { pendentes: atual.pendentes + 1, ultimoDelta: (atual.ultimoDelta ?? 0) + delta } };
      });

      const pendentes = pendentesPorItemRef.current;
      pendentes.set(idItem, (pendentes.get(idItem) ?? 0) + 1);
      const restantes = () => {
        const valor = Math.max(0, (pendentes.get(idItem) ?? 1) - 1);
        pendentes.set(idItem, valor);
        return valor;
      };

      const filaAnterior = filasPorItemRef.current.get(idItem) ?? Promise.resolve();
      const novaPromessa = filaAnterior
        .then(async () => {
          const resposta = await enviar();
          if (restantes() === 0) {
            // Confirmado: vale o saldo e o status reais (que pode ter voltado a NORMAL).
            setItens((atual) =>
              atual.map((i) =>
                i.idItem === idItem
                  ? {
                      ...i,
                      quantidade: Math.max(0, resposta.quantidadeAtual),
                      statusNecessidade: resposta.statusNecessidade,
                      critico: resposta.statusNecessidade === "URGENTE" || resposta.quantidadeAtual < i.quantidadeMinima,
                    }
                  : i,
              ),
            );
          }
          aoConfirmar?.(resposta);
          setVersaoMovimentos((v) => v + 1);
        })
        .catch(async (err) => {
          restantes();
          if (!(err instanceof ErroClienteApi) && corpoOffline && idAbrigo) {
            const movimento: MovimentoOffline = {
              uid: novoUid(),
              idAbrigo,
              idItem,
              nomeItem: item.nome,
              delta,
              corpo: corpoOffline,
              criadoEm: new Date().toISOString(),
            };
            setFilaOffline((anterior) => {
              const nova = [...anterior, movimento];
              gravarFilaOffline(nova);
              return nova;
            });
            setAviso(`Sem conexão: ${formatarDelta(delta)} em "${item.nome}" ficou guardado e será enviado quando o sinal voltar.`);
            return;
          }
          setErro(mensagemErro(err));
          await carregar();
        })
        .finally(() => {
          setFeedbackPorItem((anterior) => {
            const atual = anterior[idItem] ?? { pendentes: 1, ultimoDelta: delta };
            return { ...anterior, [idItem]: { pendentes: Math.max(0, atual.pendentes - 1), ultimoDelta: atual.ultimoDelta } };
          });
        });

      filasPorItemRef.current.set(idItem, novaPromessa);
    },
    [idAbrigo, carregar],
  );

  /** Lançamento rápido: entrada (doação) ou saída (consumo ou perda, conforme o modo). */
  const movimentar = useCallback(
    (item: ItemEstoque, delta: number, observacao?: string) => {
      if (!idAbrigo || somenteLeitura) return;
      if (delta < 0 && item.quantidade + delta < 0) return;

      vibrarToque();
      const corpo: Record<string, unknown> = { quantidade: delta };
      if (delta < 0 && modoSaida === "PERDA") {
        corpo.tipo = "PERDA";
        corpo.observacao = observacao ?? "Baixa por perda/avaria no painel de estoque";
      } else if (observacao) {
        corpo.observacao = observacao;
      }

      enfileirar(
        item,
        delta,
        () => api<RespostaMovimento>(`/api/abrigos/${idAbrigo}/estoque/${item.idItem}/movimentacoes`, { method: "POST", body: JSON.stringify(corpo) }),
        (resposta) => {
          if (!resposta.movimentacao) return;
          const toque: ToqueRecente = {
            uid: novoUid(),
            idMovimentacao: resposta.movimentacao.id,
            idItem: item.idItem,
            nomeItem: item.nome,
            delta,
            horario: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            desfeito: false,
          };
          setToquesRecentes((anteriores) => [toque, ...anteriores.slice(0, 4)]);
        },
        corpo,
      );
    },
    [idAbrigo, somenteLeitura, modoSaida, enfileirar],
  );

  /** Estorna a movimentação original (tipo ESTORNO), sem inflar doações ou consumo. */
  function desfazerToque(toque: ToqueRecente) {
    if (toque.desfeito || somenteLeitura || !idAbrigo) return;
    const itemAtual = itens.find((i) => i.idItem === toque.idItem);
    if (!itemAtual) return;
    if (itemAtual.quantidade - toque.delta < 0) {
      setErro("Saldo atual insuficiente para desfazer este lançamento.");
      return;
    }

    vibrarToque();
    setToquesRecentes((anteriores) => anteriores.map((t) => (t.uid === toque.uid ? { ...t, desfeito: true } : t)));
    enfileirar(itemAtual, -toque.delta, () =>
      api<RespostaMovimento>(`/api/abrigos/${idAbrigo}/movimentacoes/${toque.idMovimentacao}/estorno`, { method: "POST", body: JSON.stringify({}) }),
    );
    setAviso(`Lançamento de ${toque.nomeItem} (${formatarDelta(toque.delta)}) desfeito.`);
  }

  /** Executa uma ação de gestão sobre um item, com o item marcado como ocupado enquanto salva. */
  const comItemOcupado = useCallback(
    async (idItem: number, acao: () => Promise<unknown>, mensagemSucesso: string): Promise<boolean> => {
    if (!idAbrigo || somenteLeitura) return false;
    setOcupadoId(idItem);
    setErro(null);
    try {
      await acao();
      await carregar();
      setVersaoMovimentos((v) => v + 1);
      setAviso(mensagemSucesso);
      return true;
    } catch (err) {
      setErro(mensagemErro(err));
      return false;
    } finally {
      setOcupadoId(null);
    }
    },
    [idAbrigo, somenteLeitura, carregar],
  );

  /** Como o item aparece para doadores no mapa público. Estável, para não renderizar as linhas à toa. */
  const classificar = useCallback(
    (item: ItemEstoque, statusNecessidade: StatusNecessidade) => {
      vibrarToque(15);
      void comItemOcupado(
        item.idItem,
        () => api(`/api/abrigos/${idAbrigo}/estoque/${item.idItem}`, { method: "PATCH", body: JSON.stringify({ statusNecessidade }) }),
        `${item.nome}: ${ROTULO_NECESSIDADE[statusNecessidade].toLowerCase()}.`,
      );
    },
    [comItemOcupado, idAbrigo],
  );

  /** Estoque mínimo e, se a contagem física difere do saldo, um ajuste justificado. */
  function salvarConfig(item: ItemEstoque, dados: { minimo: number; contagem: number | null; justificativa: string }) {
    return comItemOcupado(
      item.idItem,
      async () => {
        if (dados.minimo !== item.quantidadeMinima) {
          await api(`/api/abrigos/${idAbrigo}/estoque/${item.idItem}`, { method: "PATCH", body: JSON.stringify({ quantidadeMinima: dados.minimo }) });
        }
        if (dados.contagem !== null && dados.contagem !== item.quantidade) {
          await api(`/api/abrigos/${idAbrigo}/estoque/${item.idItem}/movimentacoes`, {
            method: "POST",
            body: JSON.stringify({ tipo: "AJUSTE", quantidadeFinal: dados.contagem, observacao: dados.justificativa.trim() || "Ajuste por contagem física" }),
          });
        }
      },
      `${item.nome} atualizado.`,
    );
  }

  function transferir(item: ItemEstoque, dados: { idAbrigoDestino: number; quantidade: number; observacao: string }) {
    return comItemOcupado(
      item.idItem,
      () => api(`/api/abrigos/${idAbrigo}/transferencias-estoque`, { method: "POST", body: JSON.stringify({ ...dados, idItem: item.idItem }) }),
      `Transferência de ${item.nome} concluída.`,
    );
  }

  return {
    itens,
    carregando,
    erro,
    aviso,
    setErro,
    setAviso,
    incluirCatalogo,
    setIncluirCatalogo,
    modoSaida,
    setModoSaida,
    ocupadoId,
    feedbackPorItem,
    toquesRecentes,
    limparToques: () => setToquesRecentes([]),
    filaOffline,
    sincronizando,
    sincronizarFila,
    descartarFila,
    versaoMovimentos,
    movimentar,
    desfazerToque,
    classificar,
    salvarConfig,
    transferir,
  };
}
