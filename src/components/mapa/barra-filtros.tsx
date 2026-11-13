"use client";

import { useRef } from "react";
import { ICONE_CATEGORIA, PILULAS_FILTRO, type CategoriaPublica, type FiltroRapido } from "./tipos";

interface PropriedadesBarraFiltros {
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
  onLimparCategoria: () => void;
  alertas: { total: number; camadaVisivel: boolean; painelAberto: boolean; onAlternarCamada: () => void; onAlternarPainel: () => void };
  gps: { ativo: boolean; raioKm: number | null; onRaio: (raio: number | null) => void };
  temFiltroAtivo: boolean;
  onLimparTudo: () => void;
}

const PILULA = "min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-bold transition sm:min-h-9 sm:px-3.5 sm:text-sm";
const PILULA_INATIVA = "border border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800";

/** Pílulas de filtro rápido, categorias de doação e camada de alertas (topo do mapa). */
export function BarraFiltros(props: PropriedadesBarraFiltros) {
  const { filtroRapido, categorias, categoriaSlug, itemFiltroId, alertas, gps } = props;
  const barraRef = useRef<HTMLDivElement | null>(null);
  const categoriaAtiva = categorias.find((c) => c.slug === categoriaSlug) ?? null;

  const rolar = (direcao: -1 | 1) => barraRef.current?.scrollBy({ left: direcao * 240, behavior: "smooth" });

  return (
    <div className="flex flex-col gap-2">
      <div className="pointer-events-auto flex w-full items-center gap-1 rounded-2xl border border-slate-800/90 bg-slate-950/90 px-1.5 py-1 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => rolar(-1)}
          aria-label="Ver filtros anteriores"
          className="hidden h-9 w-8 shrink-0 items-center justify-center rounded-lg text-base font-black text-slate-400 hover:bg-slate-800 hover:text-white sm:inline-flex"
        >
          ‹
        </button>

        <div
          ref={barraRef}
          onWheel={(e) => {
            if (barraRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) barraRef.current.scrollLeft += e.deltaY;
          }}
          className="barra-filtros-scroll flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5"
        >
          {PILULAS_FILTRO.map((pilula) => {
            const ativo =
              pilula.id === "TODOS" ? filtroRapido === "TODOS" && categoriaSlug === null && itemFiltroId === null : filtroRapido === pilula.id;
            return (
              <button
                key={pilula.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => props.onFiltroRapido(pilula.id)}
                className={`${PILULA} ${ativo ? "bg-amber-500 text-slate-950" : PILULA_INATIVA}`}
              >
                {pilula.rotulo}
              </button>
            );
          })}

          <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-800" />

          {categorias.map((categoria) => {
            const ativo = categoriaSlug === categoria.slug;
            return (
              <button
                key={categoria.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => props.onCategoria(categoria.slug)}
                className={`${PILULA} ${ativo ? "bg-sky-400 text-slate-950" : PILULA_INATIVA}`}
              >
                {ICONE_CATEGORIA[categoria.slug] ?? "📦"} {categoria.nome} {ativo ? "✕" : ""}
              </button>
            );
          })}

          <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-800" />

          <button
            type="button"
            aria-pressed={alertas.camadaVisivel}
            onClick={alertas.onAlternarCamada}
            className={`${PILULA} ${alertas.camadaVisivel ? "border border-rose-500/40 bg-rose-500/20 text-rose-300" : PILULA_INATIVA}`}
          >
            🚧 Alertas no mapa ({alertas.total})
          </button>
          <button
            type="button"
            aria-pressed={alertas.painelAberto}
            onClick={alertas.onAlternarPainel}
            className={`${PILULA} ${alertas.painelAberto ? "bg-rose-500 text-slate-950" : "border border-rose-500/30 bg-slate-900/90 text-rose-200 hover:bg-slate-800"}`}
          >
            🔺 Ver vias / Reportar
          </button>
        </div>

        {props.temFiltroAtivo && (
          <button
            type="button"
            onClick={props.onLimparTudo}
            className={`${PILULA} border border-rose-500/50 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30`}
          >
            ✕ <span className="hidden sm:inline">Limpar filtros</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => rolar(1)}
          aria-label="Ver mais filtros"
          className="hidden h-9 w-8 shrink-0 items-center justify-center rounded-lg text-base font-black text-slate-400 hover:bg-slate-800 hover:text-white sm:inline-flex"
        >
          ›
        </button>
      </div>

      {(categoriaAtiva || gps.ativo) && (
        <div className="barra-filtros-scroll pointer-events-auto flex flex-nowrap items-center gap-2 overflow-x-auto rounded-2xl border border-sky-500/35 bg-slate-950/92 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md sm:flex-wrap sm:py-2 sm:text-sm">
          {categoriaAtiva && (
            <>
              <span className="shrink-0 font-bold text-sky-300">
                {ICONE_CATEGORIA[categoriaAtiva.slug] ?? "📦"} Doar {categoriaAtiva.nome}:
              </span>
              <div className="flex shrink-0 items-center gap-1.5 sm:flex-wrap">
                <button
                  type="button"
                  aria-pressed={itemFiltroId === null}
                  onClick={() => props.onItem(null)}
                  className={`${PILULA} ${itemFiltroId === null ? "bg-sky-400 text-slate-950" : PILULA_INATIVA}`}
                >
                  Qualquer item
                </button>
                {categoriaAtiva.itens.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={itemFiltroId === item.id}
                    onClick={() => props.onItem(itemFiltroId === item.id ? null : item.id)}
                    className={`${PILULA} ${itemFiltroId === item.id ? "bg-sky-400 text-slate-950" : PILULA_INATIVA}`}
                  >
                    {item.nome}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-slate-300 tabular-nums">
                <strong className="text-sky-300">{props.totalDestaque}</strong> abrigo(s) precisam disso
              </span>
              <button
                type="button"
                aria-pressed={props.ocultarNaoDestaque}
                onClick={props.onAlternarOcultar}
                className={`${PILULA} ${props.ocultarNaoDestaque ? "border border-amber-400 bg-amber-400/20 text-amber-200" : PILULA_INATIVA}`}
              >
                {props.ocultarNaoDestaque ? "👁️ Só os que precisam" : "👁️ Ocultar os demais"}
              </button>
              <button
                type="button"
                onClick={props.onLimparCategoria}
                className={`${PILULA} border border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25`}
              >
                ✕ Remover filtro
              </button>
            </>
          )}

          {gps.ativo && (
            <div className="flex shrink-0 items-center gap-1.5 sm:flex-wrap">
              <span className="shrink-0 font-semibold text-slate-400">Distância:</span>
              {([null, 5, 10, 25] as const).map((raio) => (
                <button
                  key={raio ?? "todos"}
                  type="button"
                  aria-pressed={gps.raioKm === raio}
                  onClick={() => gps.onRaio(raio)}
                  className={`${PILULA} ${gps.raioKm === raio ? "bg-emerald-400 text-slate-950" : PILULA_INATIVA}`}
                >
                  {raio ? `até ${raio} km` : "Todas"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
