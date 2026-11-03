"use client";

import type { ReactNode } from "react";
import { obterEstiloNivel, type AbrigoMapa, type AlertaMapa } from "./tipos";

function Gaveta({ titulo, subtitulo, cor, onFechar, children }: { titulo: string; subtitulo: string; cor: string; onFechar: () => void; children: ReactNode }) {
  return (
    <aside
      aria-label={titulo}
      className={`pointer-events-auto absolute top-24 bottom-16 left-3 z-[450] flex w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-3xl border bg-slate-950/95 shadow-2xl backdrop-blur-xl sm:w-96 ${cor}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-white">{titulo}</h2>
          <p className="text-xs text-slate-400">{subtitulo}</p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label={`Fechar ${titulo.toLowerCase()}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm font-bold text-slate-400 hover:text-white sm:h-9 sm:w-9"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

interface PropriedadesPainelAlertas {
  alertas: AlertaMapa[];
  onVerNoMapa: (alerta: AlertaMapa) => void;
  onVerAbrigo: (idAbrigo: number) => void;
  onFechar: () => void;
}

/** Lista de vias bloqueadas e áreas de risco ativas. */
export function PainelAlertas({ alertas, onVerNoMapa, onVerAbrigo, onFechar }: PropriedadesPainelAlertas) {
  return (
    <Gaveta
      titulo={`Vias e áreas de risco (${alertas.length})`}
      subtitulo="Toque para ver o ponto ou a área no mapa"
      cor="border-rose-500/40"
      onFechar={onFechar}
    >
      {alertas.map((alerta) => (
        <article
          key={alerta.id}
          className={`space-y-2 rounded-2xl border p-3 ${alerta.gravidade === "CRITICO" ? "border-rose-500/40 bg-rose-950/25" : "border-amber-500/40 bg-amber-950/25"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
              {alerta.tipo === "AREA_RISCO" ? "🔺" : "🚧"} {alerta.descricaoTipo}
            </h3>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${alerta.gravidade === "CRITICO" ? "bg-rose-500 text-slate-950" : "bg-amber-400 text-slate-950"}`}
            >
              {alerta.gravidade === "CRITICO" ? "Crítico" : "Alerta"}
            </span>
          </div>
          {alerta.descricao && <p className="text-sm text-slate-200">{alerta.descricao}</p>}
          {!alerta.localizacaoPropria && <p className="text-xs text-slate-400">Local exato não informado: alerta no próprio abrigo.</p>}
          <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
            <span className="truncate text-xs text-slate-400">Abrigo: {alerta.abrigo.nome}</span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onVerNoMapa(alerta)}
                className="min-h-12 rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 text-xs font-bold text-rose-200 hover:bg-rose-500/30 sm:min-h-9"
              >
                🎯 No mapa
              </button>
              <button
                type="button"
                onClick={() => onVerAbrigo(alerta.abrigo.id)}
                className="min-h-12 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800 sm:min-h-9"
              >
                🏠 Abrigo
              </button>
            </div>
          </div>
        </article>
      ))}
    </Gaveta>
  );
}

interface PropriedadesListaAbrigos {
  abrigos: AbrigoMapa[];
  carregando: boolean;
  idSelecionado: number | null;
  onSelecionar: (id: number) => void;
  onLimparFiltros: () => void;
  onFechar: () => void;
}

/** Lista rápida dos abrigos que atendem aos filtros. */
export function ListaAbrigos({ abrigos, carregando, idSelecionado, onSelecionar, onLimparFiltros, onFechar }: PropriedadesListaAbrigos) {
  return (
    <Gaveta
      titulo={`Abrigos na região (${abrigos.length})`}
      subtitulo="Toque em um abrigo para ver os detalhes"
      cor="border-slate-700/80"
      onFechar={onFechar}
    >
      {carregando && abrigos.length === 0 ? (
        <p className="p-4 text-center text-sm text-slate-400">Carregando abrigos...</p>
      ) : abrigos.length === 0 ? (
        <div className="space-y-3 p-4 text-center">
          <p className="text-sm font-semibold text-slate-300">Nenhum abrigo encontrado com estes filtros.</p>
          <button type="button" onClick={onLimparFiltros} className="min-h-12 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950">
            Limpar filtros
          </button>
        </div>
      ) : (
        abrigos.map((abrigo) => {
          const estilo = obterEstiloNivel(abrigo.ocupacao.nivel);
          const selecionado = abrigo.id === idSelecionado;
          return (
            <button
              key={abrigo.id}
              type="button"
              onClick={() => onSelecionar(abrigo.id)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                selecionado
                  ? "border-amber-500 bg-slate-900 ring-1 ring-amber-500/40"
                  : abrigo.destaque
                    ? "border-sky-500/50 bg-sky-950/20 hover:bg-slate-900"
                    : "border-slate-800/90 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-1 text-sm font-bold text-white">
                  {abrigo.destaque ? "⭐ " : ""}
                  {abrigo.nome}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${estilo.badge}`}>
                  {estilo.simbolo} {abrigo.ocupacao.vagasDisponiveis > 0 ? `${abrigo.ocupacao.vagasDisponiveis} vagas` : "Lotado"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="truncate">{abrigo.endereco}</span>
                {abrigo.distanciaKm !== null && (
                  <span className="shrink-0 font-bold text-sky-300 tabular-nums">{abrigo.distanciaKm.toFixed(1)} km</span>
                )}
              </div>
              {abrigo.emAreaDeRisco && <p className="mt-1 text-xs font-bold text-rose-300">🔺 Dentro de área de risco</p>}
            </button>
          );
        })
      )}
    </Gaveta>
  );
}
