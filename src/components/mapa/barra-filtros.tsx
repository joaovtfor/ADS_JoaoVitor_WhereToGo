"use client";

import type { ReactNode } from "react";
import { LocateFixed, LocateOff, SlidersHorizontal } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Chip } from "@/components/ui/chip";
import { Folha, type NavegacaoFolha } from "@/components/ui/folha";
import { ATALHOS_FILTRO, FILTROS_RAPIDOS, obterIconeCategoria, type CategoriaPublica, type FiltroRapido } from "./tipos";

interface PropriedadesBarraFiltros {
  filtroRapido: FiltroRapido;
  onFiltroRapido: (filtro: FiltroRapido) => void;
  /** Filtros ativos que não aparecem como atalho (categoria de doação, distância...). */
  totalOutrosFiltros: number;
  painelAberto: boolean;
  onAlternarPainel: () => void;
}

/**
 * Fileira que flutua no alto do mapa, separada do cabeçalho: o botão `Filtros`
 * primeiro (no celular a fileira rola e ele continua à vista) e os três atalhos
 * mais usados. Cada controle tem fundo opaco; o vão entre eles mostra o mapa.
 * No celular rola de ponta a ponta da tela, sem barra de rolagem; a partir de
 * `sm` quebra em mais linhas quando falta largura (mouse não rola de lado).
 * Rótulos curtos abaixo de `lg`: ao lado do painel aberto sobram ~250 px.
 */
export function BarraFiltros({ filtroRapido, onFiltroRapido, totalOutrosFiltros, painelAberto, onAlternarPainel }: PropriedadesBarraFiltros) {
  return (
    <div
      role="group"
      aria-label="Filtros do mapa"
      className="pointer-events-auto -mx-3 flex max-w-[calc(100%+1.5rem)] items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <Botao
        tamanho="sm"
        icone={SlidersHorizontal}
        ligado={painelAberto || totalOutrosFiltros > 0}
        aria-label={totalOutrosFiltros > 0 ? `Filtros (${totalOutrosFiltros} ativos)` : "Filtros"}
        onClick={onAlternarPainel}
      >
        <span className="hidden lg:inline">Filtros</span>
        {totalOutrosFiltros > 0 && <span className="tabular-nums">{totalOutrosFiltros}</span>}
      </Botao>
      {ATALHOS_FILTRO.map((filtro) => (
        <Chip key={filtro.id} ativo={filtroRapido === filtro.id} icone={filtro.icone} onClick={() => onFiltroRapido(filtro.id)}>
          <span className="lg:hidden">{filtro.rotuloCurto}</span>
          <span className="hidden lg:inline">{filtro.rotulo}</span>
        </Chip>
      ))}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-borda py-4 first:border-t-0">
      <h3 className="text-meta font-medium text-texto-3">{titulo}</h3>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

interface PropriedadesPainelFiltros {
  filtroRapido: FiltroRapido;
  onFiltroRapido: (filtro: FiltroRapido) => void;
  categorias: CategoriaPublica[];
  categoriaSlug: string | null;
  onCategoria: (slug: string) => void;
  itemFiltroId: number | null;
  onItem: (id: number | null) => void;
  totalDestaque: number;
  ocultarNaoDestaque: boolean;
  onAlternarOcultar: () => void;
  alertas: { total: number; camadaVisivel: boolean; onAlternarCamada: () => void; onVerPainel: () => void };
  gps: {
    ativo: boolean;
    buscando: boolean;
    raioKm: number | null;
    onRaio: (raio: number | null) => void;
    onAtivar: () => void;
    onParar: () => void;
  };
  totalResultados: number;
  temFiltroAtivo: boolean;
  onLimparTudo: () => void;
  /** "Ver N abrigos": troca os filtros pela lista com o resultado. */
  onVerResultados: () => void;
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
}

/** Todos os filtros do mapa em um só lugar, agrupados por assunto. */
export function PainelFiltros(props: PropriedadesPainelFiltros) {
  const { filtroRapido, categorias, categoriaSlug, itemFiltroId, alertas, gps } = props;
  const categoriaAtiva = categorias.find((c) => c.slug === categoriaSlug) ?? null;

  return (
    <Folha
      rotulo="Filtros do mapa"
      titulo={<h2 className="text-titulo font-semibold text-texto">Filtros</h2>}
      rotuloFechar="Fechar painel"
      onFechar={props.onFechar}
      {...props.navegacao}
      rodape={
        <div className="flex gap-2">
          <Botao variante="fantasma" onClick={props.onLimparTudo} disabled={!props.temFiltroAtivo}>
            Limpar
          </Botao>
          <Botao variante="primaria" onClick={props.onVerResultados} className="flex-1 tabular-nums">
            {props.totalResultados === 1 ? "Ver 1 abrigo" : `Ver ${props.totalResultados} abrigos`}
          </Botao>
        </div>
      }
    >
      <Secao titulo="Abrigo">
        {FILTROS_RAPIDOS.map((filtro) => (
          <Chip key={filtro.id} ativo={filtroRapido === filtro.id} icone={filtro.icone} onClick={() => props.onFiltroRapido(filtro.id)}>
            {filtro.rotulo}
          </Chip>
        ))}
      </Secao>

      {categorias.length > 0 && (
        <Secao titulo="Quero doar">
          {categorias.map((categoria) => (
            <Chip
              key={categoria.id}
              ativo={categoriaSlug === categoria.slug}
              icone={obterIconeCategoria(categoria.slug)}
              onClick={() => props.onCategoria(categoria.slug)}
            >
              {categoria.nome}
            </Chip>
          ))}

          {categoriaAtiva && (
            <div className="mt-2 w-full space-y-2 border-t border-borda pt-3">
              <p className="text-meta text-texto-2">
                <span className="tabular-nums text-texto">{props.totalDestaque}</span>{" "}
                {props.totalDestaque === 1 ? "abrigo precisa" : "abrigos precisam"} de {categoriaAtiva.nome.toLowerCase()} agora. Algum item específico?
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip ativo={itemFiltroId === null} onClick={() => props.onItem(null)}>
                  Qualquer item
                </Chip>
                {categoriaAtiva.itens.map((item) => (
                  <Chip key={item.id} ativo={itemFiltroId === item.id} onClick={() => props.onItem(itemFiltroId === item.id ? null : item.id)}>
                    {item.nome}
                  </Chip>
                ))}
              </div>
              <Chip ativo={props.ocultarNaoDestaque} onClick={props.onAlternarOcultar}>
                Mostrar só os abrigos que precisam
              </Chip>
            </div>
          )}
        </Secao>
      )}

      <Secao titulo="Distância">
        {gps.ativo ? (
          <>
            {([null, 5, 10, 25] as const).map((raio) => (
              <Chip key={raio ?? "todas"} ativo={gps.raioKm === raio} onClick={() => gps.onRaio(raio)}>
                {raio ? `Até ${raio} km` : "Qualquer distância"}
              </Chip>
            ))}
            <Botao tamanho="sm" variante="fantasma" icone={LocateOff} onClick={gps.onParar}>
              Parar de usar minha localização
            </Botao>
          </>
        ) : (
          <>
            <p className="w-full text-meta text-texto-2">Ative sua localização para filtrar por distância.</p>
            <Botao tamanho="sm" icone={LocateFixed} onClick={gps.onAtivar} disabled={gps.buscando}>
              {gps.buscando ? "Localizando..." : "Usar minha localização"}
            </Botao>
          </>
        )}
      </Secao>

      <Secao titulo="Vias e áreas de risco">
        <Chip ativo={alertas.camadaVisivel} onClick={alertas.onAlternarCamada}>
          Mostrar no mapa
        </Chip>
        <Botao tamanho="sm" variante="fantasma" onClick={alertas.onVerPainel} className="tabular-nums">
          {alertas.total === 1 ? "Ver 1 alerta" : `Ver ${alertas.total} alertas`} ou reportar
        </Botao>
      </Secao>
    </Folha>
  );
}
