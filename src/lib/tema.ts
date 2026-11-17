/**
 * Tema claro/escuro (DESIGN.md §8). Sem "use client": o layout raiz (servidor)
 * usa o script e as constantes; o hook `useTema` (cliente) usa as mesmas.
 */

/** O que a pessoa pode escolher. "sistema" segue o claro/escuro do aparelho. */
export const TEMAS = ["sistema", "claro", "escuro"] as const;
export type Tema = (typeof TEMAS)[number];
export type TemaEfetivo = "claro" | "escuro";

/** Onde a escolha fica guardada neste aparelho. */
export const CHAVE_TEMA = "wtg:tema";

/**
 * Tema de quem nunca escolheu: o do aparelho (DESIGN.md §8). O servidor já
 * escreve este valor no `<html>`, então sem JavaScript o app também segue o aparelho.
 */
export const TEMA_PADRAO: Tema = "sistema";

/** Cor da barra do navegador e do app instalado (`theme-color`): a superfície de cada tema. */
export const COR_BARRA: Record<TemaEfetivo, string> = {
  claro: "#ffffff",
  escuro: "#0b0d12",
};

export function ehTema(valor: unknown): valor is Tema {
  return typeof valor === "string" && (TEMAS as readonly string[]).includes(valor);
}

/**
 * Roda no `<head>`, durante a leitura do HTML e antes da primeira pintura:
 * põe no `<html>` o `data-tema` salvo. Sem ele (ou sem `localStorage`), fica
 * o padrão que o servidor já escreveu. Ver o guia "Preventing flash before
 * hydration" em `node_modules/next/dist/docs`.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});if(${JSON.stringify(TEMAS)}.indexOf(t)>=0)document.documentElement.setAttribute("data-tema",t)}catch(e){}})()`;
