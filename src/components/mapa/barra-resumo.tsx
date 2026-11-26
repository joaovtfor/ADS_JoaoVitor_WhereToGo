"use client";

import { useRef, useState, type TouchEvent } from "react";
import { ChevronDown, ChevronUp, CircleQuestionMark, LocateFixed, Scan } from "lucide-react";
import { BotaoIcone } from "@/components/ui/botao";
import { FOCO, juntarClasses } from "@/components/ui/classes";
import { Icone } from "@/components/ui/icone";
import { SeloStatus } from "@/components/ui/selo-status";

interface PropriedadesBarraResumo {
  totalVagasLivres: number;
  totalAbrigos: number;
  carregando: boolean;
  filtrado: boolean;
  mostrarAlertas: boolean;
  /** O resumo é a porta da lista de abrigos (o painel abre logo acima dele). */
  lista: { aberta: boolean; onAlternar: () => void };
  /** "Abrigos perto de mim": sempre vai ao mais próximo (desligar a localização fica no painel de filtros). */
  gps: { ativo: boolean; buscando: boolean; onIrAoMaisProximo: () => void };
  onEnquadrar: () => void;
}

/**
 * Resumo do que o mapa está mostrando, a porta da lista e os controles do mapa
 * (legenda, enquadrar, localização). No celular é a "alça" da folha: tocar no
 * resumo ou puxá-lo para cima abre a lista, ao alcance do polegar.
 */
export function BarraResumo({ totalVagasLivres, totalAbrigos, carregando, filtrado, mostrarAlertas, lista, gps, onEnquadrar }: PropriedadesBarraResumo) {
  const [legendaAberta, setLegendaAberta] = useState(false);
  const inicioToqueRef = useRef<number | null>(null);
  const semDados = carregando && totalAbrigos === 0;

  function iniciarToque(e: TouchEvent<HTMLDivElement>) {
    inicioToqueRef.current = e.touches.length === 1 ? e.touches[0].clientY : null;
  }

  /** Puxar o resumo para cima abre a lista, como se ele fosse a borda da folha. */
  function finalizarToque(e: TouchEvent<HTMLDivElement>) {
    const inicio = inicioToqueRef.current;
    inicioToqueRef.current = null;
    if (inicio === null || lista.aberta || semDados) return;
    if (e.changedTouches[0].clientY - inicio < -30) lista.onAlternar();
  }

  return (
    // No celular fica acima da linha de créditos do mapa, que precisa continuar visível.
    // No desktop fica embaixo do painel, com a mesma largura, e por cima dele (a legenda abre para cima).
    <div className="pointer-events-none absolute inset-x-3 bottom-8 z-[400] flex flex-col gap-2 sm:right-auto sm:bottom-3 sm:z-[460] sm:w-[400px]">
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
              Ponto no canto do pino: alerta de acesso ou infraestrutura
            </li>
            <li className="flex items-center gap-2 text-meta text-texto-2">
              <span aria-hidden className="wtg-cluster--ok shrink-0">
                <span className="wtg-cluster__corpo">
                  <span className="wtg-cluster__vagas">12</span>
                  <span className="wtg-cluster__qtd">3</span>
                </span>
              </span>
              <span>Grupo de abrigos: soma de vagas e total de locais (toque para aproximar)</span>
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

      <div
        onTouchStart={iniciarToque}
        onTouchEnd={finalizarToque}
        className="pointer-events-auto rounded-painel border border-borda bg-superficie py-2 pr-2 pl-2 max-sm:pt-1"
      >
        {/* Alça: diz que o resumo é a borda de uma folha que sobe. */}
        <span aria-hidden className="mx-auto mb-1 block h-1 w-9 rounded-full bg-borda-forte sm:hidden" />

        <div className="flex items-center gap-1">
          {semDados ? (
            <p role="status" className="px-2 py-2 text-corpo text-texto-2">
              Carregando abrigos...
            </p>
          ) : (
            <button
              type="button"
              onClick={lista.onAlternar}
              aria-expanded={lista.aberta}
              className={juntarClasses(
                "flex min-w-0 flex-1 items-center gap-3 rounded-controle px-2 py-1 text-left transition-colors hover:bg-superficie-2",
                FOCO,
              )}
            >
              <span className="sr-only">{lista.aberta ? "Fechar a lista de abrigos: " : "Ver a lista de abrigos: "}</span>
              <span className="text-numero font-semibold tabular-nums text-texto">{totalVagasLivres}</span>
              <span className="min-w-0 text-meta text-texto-2">
                {totalVagasLivres === 1 ? "vaga livre" : "vagas livres"}
                <span className="flex items-center gap-0.5 font-medium text-primaria-clara tabular-nums">
                  <span className="truncate">
                    em {totalAbrigos} {totalAbrigos === 1 ? "abrigo" : "abrigos"}
                    {filtrado ? " com estes filtros" : ""}
                  </span>
                  <Icone de={lista.aberta ? ChevronDown : ChevronUp} tamanho={16} className="shrink-0" />
                </span>
              </span>
            </button>
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
    </div>
  );
}
