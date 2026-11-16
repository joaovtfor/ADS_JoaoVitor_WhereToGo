import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { FOCO, juntarClasses } from "./classes";
import { Icone } from "./icone";

export type VarianteBotao = "primaria" | "secundaria" | "fantasma" | "perigo";
export type TamanhoBotao = "md" | "sm";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-controle font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTES: Record<VarianteBotao, string> = {
  /** No máximo uma por tela ou painel: a ação que o usuário veio fazer. */
  primaria: "bg-primaria text-white hover:bg-primaria-forte",
  secundaria: "border border-borda-forte bg-superficie-2 text-texto hover:bg-superficie-3",
  fantasma: "text-texto-2 hover:bg-superficie-2 hover:text-texto",
  /** Só para ações destrutivas (dar saída, desativar, revogar). */
  perigo: "border border-critico/50 text-critico-claro hover:bg-critico/10",
};

/** Botão de alternância ligado (ex.: lista aberta, localização ativa): azul, como todo "selecionado". */
const LIGADO = "bg-primaria/15 text-primaria-clara";

const TAMANHOS: Record<TamanhoBotao, string> = {
  md: "min-h-11 px-4 text-corpo",
  sm: "min-h-9 px-3 text-meta",
};

const TAMANHOS_ICONE: Record<TamanhoBotao, string> = {
  md: "size-11",
  sm: "size-9",
};

/**
 * Classes de botão para elementos que não são `<button>` (ex.: `<Link>` e `<a>`).
 * `className` extra serve para layout (largura, margem); cor e tamanho vêm da variante.
 */
export function classesBotao(variante: VarianteBotao = "secundaria", tamanho: TamanhoBotao = "md", className?: string): string {
  return juntarClasses(BASE, FOCO, VARIANTES[variante], TAMANHOS[tamanho], className);
}

/** O mesmo, para um link quadrado só com ícone. Dê um `aria-label` ao elemento. */
export function classesBotaoIcone(variante: VarianteBotao = "fantasma", tamanho: TamanhoBotao = "md", className?: string): string {
  return juntarClasses(BASE, FOCO, VARIANTES[variante], TAMANHOS_ICONE[tamanho], className);
}

interface PropriedadesBotao extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  icone?: LucideIcon;
  /** Para botões de alternância: define `aria-pressed` e pinta de azul quando ligado. */
  ligado?: boolean;
}

export function Botao({ variante = "secundaria", tamanho = "md", icone, ligado, className, children, type = "button", ...resto }: PropriedadesBotao) {
  return (
    <button
      type={type}
      aria-pressed={ligado}
      className={juntarClasses(BASE, FOCO, ligado ? LIGADO : VARIANTES[variante], TAMANHOS[tamanho], className)}
      {...resto}
    >
      {icone && <Icone de={icone} tamanho={tamanho === "sm" ? 16 : 18} />}
      {children}
    </button>
  );
}

interface PropriedadesBotaoIcone extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "aria-pressed"> {
  icone: LucideIcon;
  /** Obrigatório: é o nome do botão para leitores de tela e o texto da dica. */
  rotulo: string;
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** Para botões de alternância: define `aria-pressed` e pinta de azul quando ligado. */
  ligado?: boolean;
}

/** Botão quadrado só com ícone. */
export function BotaoIcone({ icone, rotulo, variante = "fantasma", tamanho = "md", ligado, className, type = "button", ...resto }: PropriedadesBotaoIcone) {
  return (
    <button
      type={type}
      aria-label={rotulo}
      aria-pressed={ligado}
      title={rotulo}
      className={juntarClasses(BASE, FOCO, ligado ? LIGADO : VARIANTES[variante], TAMANHOS_ICONE[tamanho], className)}
      {...resto}
    >
      <Icone de={icone} tamanho={tamanho === "sm" ? 18 : 20} />
    </button>
  );
}
