"use client";

import { useState } from "react";
import { CircleQuestionMark, LocateFixed, Scan } from "lucide-react";
import { BotaoIcone } from "@/components/ui/botao";
import { SeloStatus } from "@/components/ui/selo-status";

interface PropriedadesBarraResumo {
  totalVagasLivres: number;
  totalAbrigos: number;
  carregando: boolean;
  filtrado: boolean;
  mostrarAlertas: boolean;
  /** "Abrigos perto de mim": sempre vai ao mais próximo (desligar a localização fica no painel de filtros). */
  gps: { ativo: boolean; buscando: boolean; onIrAoMaisProximo: () => void };
  onEnquadrar: () => void;
}

/** Resumo do que o mapa está mostrando e os controles do mapa (legenda, enquadrar, localização). */
export function BarraResumo({ totalVagasLivres, totalAbrigos, carregando, filtrado, mostrarAlertas, gps, onEnquadrar }: PropriedadesBarraResumo) {
  const [legendaAberta, setLegendaAberta] = useState(false);
  const semDados = carregando && totalAbrigos === 0;

  return (
    // No celular fica acima da linha de créditos do mapa, que precisa continuar visível.
    <div className="pointer-events-none absolute inset-x-3 bottom-8 z-[400] flex flex-col gap-2 sm:right-auto sm:bottom-3 sm:w-96">
      {legendaAberta && (
        <div id="legenda-mapa" className="pointer-events-auto space-y-2 rounded-painel border border-borda bg-superficie p-4">
          <h2 className="text-meta font-medium text-texto-3">O número no pino é a quantidade de vagas livres</h2>
          <ul className="space-y-1.5">
            <li>
              <SeloStatus nivel="ok">Com vagas (menos de 70% ocupado)</SeloStatus>
            </li>
            <li>
              <SeloStatus nivel="atencao">Quase cheio (de 70% a 90%)</SeloStatus>
            </li>
            <li>
              <SeloStatus nivel="critico">Lotado ou últimas vagas (acima de 90%)</SeloStatus>
            </li>
            <li className="flex items-center gap-2 text-meta text-texto-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-texto" />
              Ponto branco no pino: alerta de acesso ou infraestrutura
            </li>
            {mostrarAlertas && (
              <li className="flex items-center gap-2 text-meta text-texto-2">
                <span aria-hidden className="size-2 shrink-0 border border-dashed border-critico" />
                Contorno tracejado: área de risco
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-3 rounded-painel border border-borda bg-superficie py-2 pr-2 pl-4">
        {semDados ? (
          <p role="status" className="py-2 text-corpo text-texto-2">
            Carregando abrigos...
          </p>
        ) : (
          <p className="flex min-w-0 items-center gap-3">
            <span className="text-numero font-semibold tabular-nums text-texto">{totalVagasLivres}</span>
            <span className="min-w-0 text-meta text-texto-2">
              {totalVagasLivres === 1 ? "vaga livre" : "vagas livres"}
              <span className="block truncate text-texto-3 tabular-nums">
                em {totalAbrigos} {totalAbrigos === 1 ? "abrigo" : "abrigos"}
                {filtrado ? " com estes filtros" : ""}
              </span>
            </span>
          </p>
        )}

        <div className="ml-auto flex shrink-0 items-center">
          <BotaoIcone
            icone={CircleQuestionMark}
            rotulo="Legenda do mapa"
            aria-expanded={legendaAberta}
            aria-controls="legenda-mapa"
            ligado={legendaAberta}
            onClick={() => setLegendaAberta((v) => !v)}
          />
          <BotaoIcone icone={Scan} rotulo="Enquadrar todos os abrigos" onClick={onEnquadrar} />
          <BotaoIcone
            icone={LocateFixed}
            rotulo={gps.buscando ? "Localizando..." : "Abrigos perto de mim"}
            ligado={gps.ativo}
            disabled={gps.buscando}
            onClick={gps.onIrAoMaisProximo}
            className={gps.buscando ? "animate-pulse" : undefined}
          />
        </div>
      </div>
    </div>
  );
}
