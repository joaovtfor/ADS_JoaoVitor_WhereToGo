"use client";

import { memo } from "react";
import { ArrowLeftRight, Ruler, Settings, Truck } from "lucide-react";
import { obterSeloAtualizacao } from "@/components/mapa/tipos";
import { Botao, BotaoIcone } from "@/components/ui/botao";
import { Chip } from "@/components/ui/chip";
import { SeloStatus } from "@/components/ui/selo-status";
import { formatarDelta, statusDoItem, type FeedbackItem, type ItemEstoque, type ModoSaida, type StatusNecessidade } from "./tipos";
import { ROTULO_NECESSIDADE } from "../rotulos";

interface PropriedadesLinhaItem {
  item: ItemEstoque;
  feedback: FeedbackItem | undefined;
  modoSaida: ModoSaida;
  somenteLeitura: boolean;
  /** Coordenador e admin veem a área de gestão do item. */
  podeGerenciar: boolean;
  gestaoAberta: boolean;
  ocupado: boolean;
  podeTransferir: boolean;
  onMovimentar: (item: ItemEstoque, delta: number) => void;
  onAlternarGestao: (idItem: number) => void;
  onLote: (item: ItemEstoque) => void;
  onClassificar: (item: ItemEstoque, status: StatusNecessidade) => void;
  onConfigurar: (item: ItemEstoque) => void;
  onTransferir: (item: ItemEstoque) => void;
}

const NECESSIDADES: readonly StatusNecessidade[] = ["URGENTE", "NORMAL", "BLOQUEADO"];

/**
 * Uma linha do estoque (DESIGN.md §5.4): nome, quantidade e os quatro botões de
 * lançamento rápido, todos com o mesmo peso. A gestão do item fica recolhida.
 * Memorizada: digitar na busca ou lançar em outro item não renderiza esta de novo.
 */
export const LinhaItem = memo(function LinhaItem({
  item,
  feedback,
  modoSaida,
  somenteLeitura,
  podeGerenciar,
  gestaoAberta,
  ocupado,
  podeTransferir,
  onMovimentar,
  onAlternarGestao,
  onLote,
  onClassificar,
  onConfigurar,
  onTransferir,
}: PropriedadesLinhaItem) {
  const status = statusDoItem(item);
  const salvando = (feedback?.pendentes ?? 0) > 0;
  // Em modo "perda", os botões de saída mudam de cara para não serem confundidos com consumo.
  const varianteSaida = modoSaida === "PERDA" ? "perigo" : "secundaria";

  return (
    <li className="border-b border-borda py-4 last:border-b-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-corpo font-medium text-texto">{item.nome}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-texto-3">
              {status && <SeloStatus nivel={status.nivel}>{status.rotulo}</SeloStatus>}
              <span>{item.categoria}</span>
              <span className="tabular-nums">Mín. {item.quantidadeMinima}</span>
              {salvando ? (
                <span role="status">Salvando...</span>
              ) : feedback?.ultimoDelta ? (
                <span role="status" className="tabular-nums">
                  {formatarDelta(feedback.ultimoDelta)} salvo
                </span>
              ) : (
                item.atualizadoEm && <span>{obterSeloAtualizacao(item.atualizadoEm).rotulo}</span>
              )}
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="text-numero font-semibold tabular-nums text-texto">{item.quantidade}</span>{" "}
            <span className="text-meta text-texto-3">{item.unidadeMedida}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-4 gap-2 tabular-nums lg:w-64 lg:flex-none">
            <Botao variante={varianteSaida} disabled={somenteLeitura || item.quantidade < 5} onClick={() => onMovimentar(item, -5)}>
              −5
            </Botao>
            <Botao variante={varianteSaida} disabled={somenteLeitura || item.quantidade < 1} onClick={() => onMovimentar(item, -1)}>
              −1
            </Botao>
            <Botao disabled={somenteLeitura || !item.itemAtivo} onClick={() => onMovimentar(item, 1)}>
              +1
            </Botao>
            <Botao disabled={somenteLeitura || !item.itemAtivo} onClick={() => onMovimentar(item, 5)}>
              +5
            </Botao>
          </div>
          <BotaoIcone icone={Truck} rotulo={`Lançar lote de ${item.nome}`} disabled={somenteLeitura} onClick={() => onLote(item)} />
          {podeGerenciar && (
            <BotaoIcone
              icone={Settings}
              rotulo={`Gerenciar ${item.nome}`}
              aria-expanded={gestaoAberta}
              ligado={gestaoAberta}
              onClick={() => onAlternarGestao(item.idItem)}
            />
          )}
        </div>
      </div>

      {podeGerenciar && gestaoAberta && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-controle bg-superficie p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta text-texto-3">Pedido de doação no mapa:</span>
            {NECESSIDADES.map((necessidade) => (
              <Chip
                key={necessidade}
                ativo={item.statusNecessidade === necessidade}
                disabled={ocupado || somenteLeitura}
                onClick={() => {
                  if (item.statusNecessidade !== necessidade) onClassificar(item, necessidade);
                }}
              >
                {ROTULO_NECESSIDADE[necessidade]}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Botao tamanho="sm" icone={Ruler} disabled={somenteLeitura} onClick={() => onConfigurar(item)}>
              Mínimo e contagem
            </Botao>
            {podeTransferir && item.quantidade > 0 && (
              <Botao tamanho="sm" icone={ArrowLeftRight} disabled={somenteLeitura} onClick={() => onTransferir(item)}>
                Transferir
              </Botao>
            )}
          </div>
        </div>
      )}
    </li>
  );
});
