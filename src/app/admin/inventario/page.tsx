"use client";

import { useCallback, useMemo, useState } from "react";
import { History, Search, Undo2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Icone } from "@/components/ui/icone";
import { CabecalhoPagina, EstadoVazio, Faixa } from "@/components/ui/pagina";
import { pode } from "@/lib/auth/permissoes";
import { ToastFlutuante, useAdmin } from "../contexto-admin";
import { Historico } from "./historico";
import { LinhaItem } from "./linha-item";
import { ModalConfig, ModalLote, ModalTransferencia } from "./modais";
import { emAlerta, formatarDelta, type FiltroStatusEstoque, type ItemEstoque } from "./tipos";
import { useEstoque } from "./use-estoque";

/** Qual modal está aberto, e para qual item. */
type ModalAberto = { tipo: "lote" | "config" | "transferencia"; idItem: number } | null;

export default function PaginaInventario() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, abrigos } = useAdmin();
  // A Defesa Civil consulta o estoque de qualquer abrigo e remaneja entre eles, mas não lança nem classifica.
  const podeMovimentar = pode(usuario, "estoque:movimentar");
  const podeClassificar = pode(usuario, "estoque:classificar");
  const podeTransferirEstoque = pode(usuario, "estoque:transferir");
  const podeVerHistorico = pode(usuario, "estoque:historico");
  const somenteLeitura = abrigoAtivo ? !abrigoAtivo.ativo : false;
  const estoque = useEstoque(idAbrigoAtivo, somenteLeitura);
  const { itens, setErro, setAviso, movimentar, classificar } = estoque;

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("TODAS");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusEstoque>("TODOS");
  const [gestaoAbertaId, setGestaoAbertaId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalAberto>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const categorias = useMemo(
    () => Array.from(new Map(itens.map((i) => [i.categoriaSlug, { slug: i.categoriaSlug, nome: i.categoria }])).values()),
    [itens],
  );

  const contagem = useMemo(
    () => ({
      emAlerta: itens.filter(emAlerta).length,
      urgentes: itens.filter((i) => i.statusNecessidade === "URGENTE").length,
      bloqueados: itens.filter((i) => i.statusNecessidade === "BLOQUEADO").length,
      comSaldo: itens.filter((i) => i.quantidade > 0).length,
    }),
    [itens],
  );

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (categoria !== "TODAS" && i.categoriaSlug !== categoria) return false;
      if (filtroStatus === "CRITICOS" && !emAlerta(i)) return false;
      if (filtroStatus === "URGENTE" && i.statusNecessidade !== "URGENTE") return false;
      if (filtroStatus === "BLOQUEADO" && i.statusNecessidade !== "BLOQUEADO") return false;
      if (filtroStatus === "COM_SALDO" && i.quantidade <= 0) return false;
      return !termo || i.nome.toLowerCase().includes(termo);
    });
  }, [itens, busca, categoria, filtroStatus]);

  const abrigosDestino = useMemo(() => abrigos.filter((a) => a.ativo && a.id !== idAbrigoAtivo), [abrigos, idAbrigoAtivo]);

  // Funções estáveis: as linhas são memorizadas e só renderizam quando o próprio item muda.
  const alternarGestao = useCallback((idItem: number) => setGestaoAbertaId((atual) => (atual === idItem ? null : idItem)), []);
  const abrirLote = useCallback((item: ItemEstoque) => setModal({ tipo: "lote", idItem: item.idItem }), []);
  const abrirConfig = useCallback((item: ItemEstoque) => setModal({ tipo: "config", idItem: item.idItem }), []);
  const abrirTransferencia = useCallback((item: ItemEstoque) => setModal({ tipo: "transferencia", idItem: item.idItem }), []);

  if (!idAbrigoAtivo) return <EstadoVazio>Selecione um abrigo no topo para ver o estoque.</EstadoVazio>;

  // O modal usa sempre a versão atual do item (o saldo pode mudar com ele aberto).
  const itemDoModal = modal ? (itens.find((i) => i.idItem === modal.idItem) ?? null) : null;
  const alternarFiltro = (filtro: FiltroStatusEstoque) => setFiltroStatus((atual) => (atual === filtro ? "TODOS" : filtro));

  return (
    <div className="space-y-5">
      <ToastFlutuante erro={estoque.erro} aviso={estoque.aviso} aoFecharErro={() => setErro(null)} aoFecharAviso={() => setAviso(null)} />

      <CabecalhoPagina
        titulo="Estoque"
        descricao={
          podeMovimentar
            ? "Toque nos botões de cada item para registrar entradas e saídas."
            : "Consulta do estoque do abrigo escolhido no topo. Os lançamentos ficam com a equipe do abrigo."
        }
      >
        {podeMovimentar && (
          <div role="group" aria-label="As saídas contam como" className="flex items-center gap-2">
            <span className="text-meta text-texto-3">Saídas como</span>
            <Chip ativo={estoque.modoSaida === "SAIDA_CONSUMO"} onClick={() => estoque.setModoSaida("SAIDA_CONSUMO")}>
              Consumo
            </Chip>
            <Chip ativo={estoque.modoSaida === "PERDA"} onClick={() => estoque.setModoSaida("PERDA")}>
              Perda
            </Chip>
          </div>
        )}
        {podeVerHistorico && (
          <Botao icone={History} ligado={mostrarHistorico} onClick={() => setMostrarHistorico((v) => !v)}>
            Histórico
          </Botao>
        )}
      </CabecalhoPagina>

      {estoque.filaOffline.length > 0 && (
        <Faixa
          acoes={
            <>
              <Botao tamanho="sm" disabled={estoque.sincronizando} onClick={() => void estoque.sincronizarFila()}>
                {estoque.sincronizando ? "Enviando..." : "Enviar agora"}
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={estoque.descartarFila}>
                Descartar
              </Botao>
            </>
          }
        >
          {estoque.filaOffline.length === 1 ? "1 lançamento aguarda" : `${estoque.filaOffline.length} lançamentos aguardam`} conexão. Os saldos na tela já
          contam com eles e o envio é automático quando o sinal voltar.
        </Faixa>
      )}

      {estoque.toquesRecentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-borda py-2 text-meta">
          <span className="text-texto-3">Últimos lançamentos</span>
          {estoque.toquesRecentes.map((toque) => (
            <span key={toque.uid} className={toque.desfeito ? "text-texto-3 line-through" : "inline-flex items-center gap-1 text-texto-2"}>
              <span className="tabular-nums text-texto">{formatarDelta(toque.delta)}</span> {toque.nomeItem}
              <span className="text-texto-3 tabular-nums"> {toque.horario}</span>
              {!toque.desfeito && !somenteLeitura && (
                <Botao tamanho="sm" variante="fantasma" icone={Undo2} onClick={() => estoque.desfazerToque(toque)}>
                  Desfazer
                </Botao>
              )}
            </span>
          ))}
          <Botao tamanho="sm" variante="fantasma" onClick={estoque.limparToques} className="ml-auto">
            Limpar
          </Botao>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Icone de={Search} tamanho={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-3" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar item"
            aria-label="Buscar item do estoque"
            className={`${CLASSES_CAMPO} pl-9`}
          />
        </div>
        <div className="w-40 shrink-0 sm:w-52">
          <select aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CLASSES_CAMPO}>
          <option value="TODAS">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nome}
            </option>
          ))}
          </select>
        </div>
        <div className="barra-filtros-scroll flex items-center gap-2 tabular-nums">
          <Chip ativo={filtroStatus === "CRITICOS"} onClick={() => alternarFiltro("CRITICOS")}>
            Em alerta {contagem.emAlerta}
          </Chip>
          <Chip ativo={filtroStatus === "URGENTE"} onClick={() => alternarFiltro("URGENTE")}>
            Urgentes {contagem.urgentes}
          </Chip>
          <Chip ativo={filtroStatus === "BLOQUEADO"} onClick={() => alternarFiltro("BLOQUEADO")}>
            Bloqueados {contagem.bloqueados}
          </Chip>
          <Chip ativo={filtroStatus === "COM_SALDO"} onClick={() => alternarFiltro("COM_SALDO")}>
            Com saldo {contagem.comSaldo}
          </Chip>
          <Chip ativo={estoque.incluirCatalogo} onClick={() => estoque.setIncluirCatalogo(!estoque.incluirCatalogo)}>
            Mostrar zerados
          </Chip>
        </div>
      </div>

      {estoque.carregando ? (
        <EstadoVazio>Carregando estoque...</EstadoVazio>
      ) : itensFiltrados.length === 0 ? (
        <EstadoVazio>Nenhum item com estes filtros.</EstadoVazio>
      ) : (
        <ul className="border-t border-borda">
          {itensFiltrados.map((item) => (
            <LinhaItem
              key={item.idItem}
              item={item}
              feedback={estoque.feedbackPorItem[item.idItem]}
              modoSaida={estoque.modoSaida}
              somenteLeitura={somenteLeitura}
              podeMovimentar={podeMovimentar}
              // Sem classificar (Defesa Civil), a gestão do item só serve para transferir: precisa de saldo.
              podeGerenciar={podeClassificar || (podeTransferirEstoque && abrigosDestino.length > 0 && item.quantidade > 0)}
              podeClassificar={podeClassificar}
              gestaoAberta={gestaoAbertaId === item.idItem}
              ocupado={estoque.ocupadoId === item.idItem}
              podeTransferir={podeTransferirEstoque && abrigosDestino.length > 0}
              onMovimentar={movimentar}
              onAlternarGestao={alternarGestao}
              onLote={abrirLote}
              onClassificar={classificar}
              onConfigurar={abrirConfig}
              onTransferir={abrirTransferencia}
            />
          ))}
        </ul>
      )}

      {itemDoModal && modal?.tipo === "lote" && (
        <ModalLote
          item={itemDoModal}
          onFechar={() => setModal(null)}
          onLancar={(delta, motivo) => {
            movimentar(itemDoModal, delta, motivo);
            setModal(null);
            setAviso(`${formatarDelta(delta)} ${itemDoModal.nome} (${motivo.toLowerCase()}).`);
          }}
        />
      )}
      {itemDoModal && modal?.tipo === "config" && (
        <ModalConfig
          item={itemDoModal}
          salvando={estoque.ocupadoId === itemDoModal.idItem}
          onFechar={() => setModal(null)}
          onSalvar={(dados) => void estoque.salvarConfig(itemDoModal, dados).then((ok) => ok && setModal(null))}
        />
      )}
      {itemDoModal && modal?.tipo === "transferencia" && (
        <ModalTransferencia
          item={itemDoModal}
          abrigosDestino={abrigosDestino}
          salvando={estoque.ocupadoId === itemDoModal.idItem}
          onFechar={() => setModal(null)}
          onTransferir={(dados) => void estoque.transferir(itemDoModal, dados).then((ok) => ok && setModal(null))}
        />
      )}

      {mostrarHistorico && podeVerHistorico && <Historico idAbrigo={idAbrigoAtivo} itens={itens} versao={estoque.versaoMovimentos} onErro={setErro} />}
    </div>
  );
}
