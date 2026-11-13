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
  "min-h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs sm:text-sm font-bold text-slate-200 transition hover:bg-slate-800 sm:px-3";

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
    <header className="z-30 shrink-0 border-b border-slate-800/90 bg-slate-950/95 px-2.5 py-2 backdrop-blur sm:px-4">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-2.5">
        {/* Marca e contador de vagas */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-slate-950 sm:h-10 sm:w-10 sm:text-base">
            W
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-none tracking-tight text-white sm:text-lg">WhereToGo</h1>
            <p className="mt-0.5 truncate text-[11px] font-bold text-emerald-300 tabular-nums sm:mt-1 sm:text-xs">
              ● {totalVagasLivres} vagas livres
            </p>
          </div>
        </div>

        {/* Linha 2 no Mobile / Centro no Desktop: Busca + Controle de GPS (Perto de mim) */}
        <div className="order-last flex w-full items-center gap-1.5 sm:order-none sm:max-w-lg sm:flex-1 sm:gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type="search"
              value={termoBusca}
              onChange={(e) => onBuscar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirmarBusca();
              }}
              placeholder="Buscar abrigo, bairro ou item..."
              aria-label="Buscar abrigo, bairro ou item para doar"
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3 text-sm text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Controle unificado de GPS: quando ativo, inclui o ✕ dentro da mesma pílula para não deslocar o cabeçalho */}
          <div
            className={`inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl border transition ${
              gps.ativo
                ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            <button
              type="button"
              onClick={gps.onAtivar}
              disabled={gps.buscando}
              className="inline-flex h-full items-center gap-1 px-2.5 text-xs font-bold whitespace-nowrap disabled:opacity-60 sm:px-3 sm:text-sm"
            >
              <span>📍</span>
              <span>{gps.buscando ? "Localizando..." : "Perto de mim"}</span>
            </button>
            {gps.ativo && (
              <button
                type="button"
                onClick={gps.onLimpar}
                aria-label="Remover minha localização"
                title="Remover minha localização"
                className="inline-flex h-full w-8 items-center justify-center border-l border-sky-500/40 bg-sky-500/20 text-xs font-black text-sky-200 hover:bg-sky-500/35 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Ações fixas à direita (Linha 1 no Mobile): largura estável, nunca empurra o botão Equipe para fora */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onAlternarBuscaFamiliar}
            aria-pressed={buscaFamiliarAberta}
            title="Encontrar familiar acolhido em algum abrigo"
            className={`${BOTAO_NEUTRO} inline-flex ${buscaFamiliarAberta ? "border-teal-500 bg-teal-500/20 text-teal-300" : ""}`}
          >
            🔍 <span className="ml-1 hidden lg:inline">Encontrar familiar</span>
          </button>

          <button
            type="button"
            onClick={onAlternarLista}
            aria-pressed={listaAberta}
            className={`${BOTAO_NEUTRO} inline-flex tabular-nums ${listaAberta ? "border-amber-500 bg-amber-500/20 text-amber-300" : ""}`}
          >
            📋 <span className="ml-1 hidden md:inline">Abrigos</span>{" "}
            <span className="ml-0.5">({totalAbrigos})</span>
          </button>

          <button
            type="button"
            onClick={onAtualizar}
            aria-label="Atualizar dados do mapa"
            className={`${BOTAO_NEUTRO} hidden w-10 px-0 sm:inline-flex`}
          >
            ↻
          </button>

          <Link href="/admin/dashboard" prefetch={false} className={`${BOTAO_NEUTRO} hidden xl:inline-flex`}>
            Painel operacional
          </Link>

          <Link
            href="/login"
            prefetch={false}
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-amber-500 px-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400 sm:px-3.5 sm:text-sm"
          >
            <span className="sm:hidden">Equipe →</span>
            <span className="hidden sm:inline">Acesso equipe →</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
