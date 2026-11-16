"use client";

import { useEffect, useState } from "react";
import { CLASSES_CAMPO } from "@/components/ui/campo";
import { Secao } from "@/components/ui/pagina";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ROTULO_TIPO_MOVIMENTACAO } from "../rotulos";
import { formatarDelta, type ItemEstoque, type MovimentacaoEstoque, type PaginaMovimentacoes } from "./tipos";

interface PropriedadesHistorico {
  idAbrigo: number;
  itens: ItemEstoque[];
  /** Muda a cada lançamento confirmado: a lista é buscada de novo. */
  versao: number;
  onErro: (mensagem: string) => void;
}

/** As 50 movimentações mais recentes do abrigo, com filtro por item e por tipo. */
export function Historico({ idAbrigo, itens, versao, onErro }: PropriedadesHistorico) {
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[] | null>(null);
  const [filtroItem, setFiltroItem] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  useEffect(() => {
    let ativo = true;
    const params = new URLSearchParams({ tamanho: "50" });
    if (filtroItem) params.set("idItem", filtroItem);
    if (filtroTipo) params.set("tipo", filtroTipo);
    api<PaginaMovimentacoes>(`/api/abrigos/${idAbrigo}/movimentacoes?${params.toString()}`)
      .then((resposta) => {
        if (ativo) setMovimentacoes(resposta.itens);
      })
      .catch((err) => {
        if (ativo) onErro(mensagemErro(err));
      });
    return () => {
      ativo = false;
    };
  }, [idAbrigo, filtroItem, filtroTipo, versao, onErro]);

  return (
    <Secao
      titulo="Histórico de movimentações"
      descricao="As 50 mais recentes: entradas, saídas, perdas, ajustes e transferências."
      acoes={
        <>
          <select aria-label="Filtrar por item" value={filtroItem} onChange={(e) => setFiltroItem(e.target.value)} className={`${CLASSES_CAMPO} sm:w-48`}>
            <option value="">Todos os itens</option>
            {itens.map((item) => (
              <option key={item.idItem} value={String(item.idItem)}>
                {item.nome}
              </option>
            ))}
          </select>
          <select aria-label="Filtrar por tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={`${CLASSES_CAMPO} sm:w-48`}>
            <option value="">Todos os tipos</option>
            {Object.entries(ROTULO_TIPO_MOVIMENTACAO).map(([tipo, rotulo]) => (
              <option key={tipo} value={tipo}>
                {rotulo}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-meta">
          <thead>
            <tr className="border-b border-borda text-texto-3">
              <th className="py-2 pr-4 font-normal">Quando</th>
              <th className="py-2 pr-4 font-normal">Item</th>
              <th className="py-2 pr-4 font-normal">Tipo</th>
              <th className="py-2 pr-4 text-right font-normal">Variação</th>
              <th className="py-2 pr-4 text-right font-normal">Saldo</th>
              <th className="py-2 font-normal">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {movimentacoes === null ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-texto-2">
                  Carregando histórico...
                </td>
              </tr>
            ) : movimentacoes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-texto-2">
                  Nenhuma movimentação com estes filtros.
                </td>
              </tr>
            ) : (
              movimentacoes.map((m) => (
                <tr key={m.id} className="border-b border-borda align-top last:border-b-0">
                  <td className="py-2.5 pr-4 whitespace-nowrap text-texto-3 tabular-nums">
                    {new Date(m.dataHora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2.5 pr-4 text-texto">{m.item}</td>
                  <td className="py-2.5 pr-4 text-texto-2">
                    {ROTULO_TIPO_MOVIMENTACAO[m.tipo] ?? "Movimentação"}
                    {m.estornada && <span className="text-texto-3"> (desfeita)</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-texto tabular-nums">{formatarDelta(m.quantidade)}</td>
                  <td className="py-2.5 pr-4 text-right text-texto-2 tabular-nums">{m.quantidadeResultante}</td>
                  <td className="py-2.5 text-texto-2">
                    {m.usuario}
                    {m.abrigoContraparte && <> ({m.abrigoContraparte})</>}
                    {m.observacao && <span className="block text-texto-3">{m.observacao}</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}
