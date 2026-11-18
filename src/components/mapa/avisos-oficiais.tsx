"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { classesBotao } from "@/components/ui/botao";
import { FOCO, juntarClasses } from "@/components/ui/classes";
import { Icone } from "@/components/ui/icone";
import { SeloStatus } from "@/components/ui/selo-status";
import { avisoEmVigor, descreverPeriodoAviso, obterNivelAviso, type AvisoOficialMapa } from "./tipos";

/**
 * Selo no topo do mapa com o aviso oficial mais importante (em vigor e mais
 * grave primeiro). Não é desenhado como área: cada aviso do INMET cobre
 * centenas de municípios e pintaria o mapa inteiro. Toque abre o painel.
 */
export function SeloAvisoOficial({ avisos, onVer }: { avisos: AvisoOficialMapa[]; onVer: () => void }) {
  const principal = avisos[0];
  if (!principal) return null;
  const outros = avisos.length - 1;
  const resumo = `${principal.rotuloSeveridade} · ${descreverPeriodoAviso(principal)}${outros > 0 ? ` · +${outros}` : ""}`;

  return (
    <button
      type="button"
      onClick={onVer}
      aria-label={`Aviso do INMET: ${principal.evento}, ${resumo}. Ver detalhes`}
      className={juntarClasses(
        "pointer-events-auto flex w-fit max-w-full items-center gap-2 rounded-controle border border-borda bg-superficie px-3 py-1 text-left transition-colors hover:bg-superficie-2",
        FOCO,
      )}
    >
      <SeloStatus nivel={obterNivelAviso(principal.severidade)} className="min-w-0 py-1.5">
        {/* Quebra em vez de cortar: no celular, o horário de fim é a parte que mais importa. */}
        <span className="min-w-0">
          <span className="font-medium text-texto">INMET: {principal.evento}</span> · {resumo}
        </span>
      </SeloStatus>
      <Icone de={ChevronRight} tamanho={16} className="text-texto-3" />
    </button>
  );
}

/** Avisos oficiais no painel de alertas: evento, nível oficial, período, risco, o que fazer e link para o original. */
export function ListaAvisosOficiais({ avisos }: { avisos: AvisoOficialMapa[] }) {
  if (avisos.length === 0) return null;

  return (
    <section aria-labelledby="titulo-avisos-oficiais" className="border-t border-borda pt-4 first:border-t-0">
      <h3 id="titulo-avisos-oficiais" className="text-meta font-medium text-texto-3">
        Avisos meteorológicos oficiais · INMET
      </h3>
      {avisos.map((aviso) => (
        <article key={aviso.id} className="border-b border-borda py-4 last:border-b-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-corpo font-medium text-texto">{aviso.evento}</h4>
            <SeloStatus nivel={obterNivelAviso(aviso.severidade)} forma="preenchido" className="shrink-0">
              {aviso.rotuloSeveridade}
            </SeloStatus>
          </div>
          <p className="mt-1 text-meta text-texto-3">
            {avisoEmVigor(aviso) ? "Em vigor" : "Previsto"} {descreverPeriodoAviso(aviso)}
          </p>
          {aviso.riscos[0] && <p className="mt-1 text-corpo text-texto-2">{aviso.riscos[0]}</p>}
          {aviso.instrucoes.length > 0 && (
            <details className="mt-2">
              <summary className={juntarClasses("w-fit cursor-pointer rounded-controle text-meta font-medium text-texto-2 hover:text-texto", FOCO)}>
                O que fazer
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-corpo text-texto-2">
                {aviso.instrucoes.map((instrucao) => (
                  <li key={instrucao}>{instrucao}</li>
                ))}
              </ul>
            </details>
          )}
          {aviso.link && (
            <a href={aviso.link} target="_blank" rel="noopener noreferrer" className={classesBotao("fantasma", "sm", "-ml-3 mt-2")}>
              <Icone de={ExternalLink} tamanho={16} />
              Aviso completo no INMET
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
