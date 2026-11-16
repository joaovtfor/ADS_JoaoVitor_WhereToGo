import { FOCO, juntarClasses } from "./classes";

interface PropriedadesAbas<Id extends string> {
  /** Nome do conjunto para leitores de tela. */
  rotulo: string;
  abas: ReadonlyArray<{ id: Id; rotulo: string; contador?: number }>;
  ativa: Id;
  onMudar: (id: Id) => void;
}

/** Abas dentro de uma tela: texto simples, com a aba atual sublinhada em azul. */
export function Abas<Id extends string>({ rotulo, abas, ativa, onMudar }: PropriedadesAbas<Id>) {
  return (
    <div role="tablist" aria-label={rotulo} className="barra-filtros-scroll flex gap-1 border-b border-borda">
      {abas.map((aba) => {
        const selecionada = aba.id === ativa;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={selecionada}
            onClick={() => onMudar(aba.id)}
            className={juntarClasses(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-corpo whitespace-nowrap transition-colors",
              FOCO,
              selecionada ? "border-primaria font-medium text-texto" : "border-transparent text-texto-2 hover:text-texto",
            )}
          >
            {aba.rotulo}
            {aba.contador !== undefined && aba.contador > 0 && (
              <span className="rounded-controle bg-atencao/12 px-1.5 text-meta text-atencao-claro tabular-nums">{aba.contador}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
