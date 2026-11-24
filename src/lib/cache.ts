import { revalidateTag } from "next/cache";

/**
 * Tag dos dados exibidos no mapa público (abrigos, necessidades, alertas e
 * catálogo). Toda escrita bem-sucedida na API a invalida (ver `rota()`), então
 * o cache do servidor nunca atrasa uma mudança de status (RF03).
 */
export const TAG_DADOS_PUBLICOS = "dados-publicos";

type OuvinteMudanca = () => void;

// No globalThis para sobreviver ao recarregamento de módulos do `next dev`.
const globalComOuvintes = globalThis as typeof globalThis & { __wtgOuvintesDadosPublicos?: Set<OuvinteMudanca> };

function ouvintes(): Set<OuvinteMudanca> {
  globalComOuvintes.__wtgOuvintesDadosPublicos ??= new Set();
  return globalComOuvintes.__wtgOuvintesDadosPublicos;
}

/**
 * Algo do mapa público mudou (escrita na API, sincronização do INMET): invalida
 * o cache do servidor e avisa o mapa em tempo real DESTA instância, que confere
 * o banco na hora em vez de esperar a próxima verificação. As outras instâncias
 * percebem a mudança na verificação delas (ver `publico.tempo-real.ts`).
 */
export function invalidarDadosPublicos(): void {
  revalidateTag(TAG_DADOS_PUBLICOS, { expire: 0 });
  for (const ouvinte of ouvintes()) {
    try {
      ouvinte();
    } catch (erro) {
      console.error("[cache] falha ao avisar mudança nos dados públicos", erro);
    }
  }
}

/** Registra quem quer saber de `invalidarDadosPublicos`. Devolve a função que cancela o registro. */
export function aoInvalidarDadosPublicos(ouvinte: OuvinteMudanca): () => void {
  ouvintes().add(ouvinte);
  return () => ouvintes().delete(ouvinte);
}
