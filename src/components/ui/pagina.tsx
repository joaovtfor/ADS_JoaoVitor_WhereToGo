import type { ReactNode } from "react";
import { juntarClasses } from "./classes";

interface PropriedadesCabecalhoPagina {
  titulo: string;
  /** Uma linha de contexto, quando o título sozinho não basta. */
  descricao?: ReactNode;
  /** Ações da página: no máximo uma primária (DESIGN.md §5.2). */
  children?: ReactNode;
}

/** Título da tela e suas ações, na mesma linha. */
export function CabecalhoPagina({ titulo, descricao, children }: PropriedadesCabecalhoPagina) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-titulo font-semibold text-texto">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-meta text-texto-3">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

interface PropriedadesSecao {
  titulo: string;
  descricao?: ReactNode;
  /** Ações da seção, à direita do título. */
  acoes?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Bloco de uma tela: título discreto e conteúdo, separado do anterior por espaço, sem caixa. */
export function Secao({ titulo, descricao, acoes, className, children }: PropriedadesSecao) {
  return (
    <section className={juntarClasses("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-corpo font-semibold text-texto">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-meta text-texto-3">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/** Texto para lista vazia, carregamento ou falta de seleção. */
export function EstadoVazio({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-corpo text-texto-2">{children}</p>;
}

/**
 * Faixa de aviso persistente (sem conexão, somente leitura, fila pendente).
 * `atencao` é o padrão; `critico` só quando impede o trabalho.
 */
export function Faixa({ nivel = "atencao", acoes, children }: { nivel?: "atencao" | "critico" | "ok"; acoes?: ReactNode; children: ReactNode }) {
  const cores = {
    atencao: "bg-atencao/12 text-atencao-claro",
    critico: "bg-critico/12 text-critico-claro",
    ok: "bg-ok/12 text-ok-claro",
  }[nivel];
  return (
    <div role="status" className={juntarClasses("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-controle p-3 text-meta", cores)}>
      <div className="min-w-0 flex-1">{children}</div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
