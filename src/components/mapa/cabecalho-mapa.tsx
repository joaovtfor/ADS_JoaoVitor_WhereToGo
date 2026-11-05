"use client";

import Link from "next/link";

interface PropriedadesCabecalhoMapa {
  totalVagasLivres: number;
  totalAbrigos: number;
  termoBusca: string;
  onBuscar: (termo: string) => void;
  onConfirmarBusca: () => void;
  listaAberta: boolean;
  onAlternarLista: () => void;
  buscaFamiliarAberta: boolean;
  onAlternarBuscaFamiliar: () => void;
  gps: { ativo: boolean; buscando: boolean; onAtivar: () => void; onLimpar: () => void };
  onAtualizar: () => void;
}

const BOTAO_NEUTRO =
  "min-h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800 sm:min-h-10";

export function CabecalhoMapa({
  totalVagasLivres,
  totalAbrigos,
  termoBusca,
  onBuscar,
  onConfirmarBusca,
  listaAberta,
  onAlternarLista,
  buscaFamiliarAberta,
  onAlternarBuscaFamiliar,
  gps,
  onAtualizar,
}: PropriedadesCabecalhoMapa) {
  return (
    <header className="z-30 shrink-0 border-b border-slate-800/90 bg-slate-950/95 px-3 py-2 backdrop-blur sm:px-4">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-base font-black text-slate-950">
            W
          </span>
          <div>
            <h1 className="text-lg font-bold leading-none tracking-tight text-white">WhereToGo</h1>
            <p className="mt-1 text-xs font-bold text-emerald-300 tabular-nums">● {totalVagasLivres} vagas livres</p>
          </div>
        </div>

        <div className="relative order-last w-full sm:order-none sm:max-w-md sm:flex-1">
          <input
            type="search"
            value={termoBusca}
            onChange={(e) => onBuscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmarBusca();
            }}
            placeholder="Buscar abrigo, bairro ou item para doar..."
            aria-label="Buscar abrigo, bairro ou item para doar"
            className="h-12 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3 text-base text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none sm:h-10 sm:text-sm"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAlternarBuscaFamiliar}
            aria-pressed={buscaFamiliarAberta}
            title="Encontrar familiar acolhido em algum abrigo"
            className={`${BOTAO_NEUTRO} inline-flex ${buscaFamiliarAberta ? "border-teal-500 bg-teal-500/20 text-teal-300" : ""}`}
          >
            🔍 <span className="ml-1 hidden md:inline">Encontrar familiar</span>
          </button>

          <button
            type="button"
            onClick={onAlternarLista}
            aria-pressed={listaAberta}
            className={`${BOTAO_NEUTRO} inline-flex tabular-nums ${listaAberta ? "border-amber-500 bg-amber-500/20 text-amber-300" : ""}`}
          >
            📋 <span className="ml-1 hidden sm:inline">Abrigos</span> ({totalAbrigos})
          </button>

          <button
            type="button"
            onClick={gps.onAtivar}
            disabled={gps.buscando}
            className={`${BOTAO_NEUTRO} inline-flex disabled:opacity-60 ${gps.ativo ? "border-sky-500/50 bg-sky-500/15 text-sky-300" : ""}`}
          >
            {gps.buscando ? "Localizando..." : "📍 Perto de mim"}
          </button>
          {gps.ativo && (
            <button type="button" onClick={gps.onLimpar} aria-label="Remover minha localização" className={`${BOTAO_NEUTRO} inline-flex w-12 px-0 sm:w-10`}>
              ✕
            </button>
          )}

          <button type="button" onClick={onAtualizar} aria-label="Atualizar dados do mapa" className={`${BOTAO_NEUTRO} hidden w-10 px-0 sm:inline-flex`}>
            ↻
          </button>

          <Link href="/admin/dashboard" prefetch={false} className={`${BOTAO_NEUTRO} hidden xl:inline-flex`}>
            Painel operacional
          </Link>
          <Link
            href="/login"
            prefetch={false}
            className="inline-flex min-h-12 items-center rounded-xl bg-amber-500 px-3.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 sm:min-h-10"
          >
            <span className="sm:hidden">Equipe →</span>
            <span className="hidden sm:inline">Acesso equipe →</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
