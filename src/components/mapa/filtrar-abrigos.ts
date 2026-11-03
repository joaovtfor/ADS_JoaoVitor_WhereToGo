import type { AbrigoMapa, FiltroRapido } from "./tipos";

export interface CriteriosMapa {
  termoBusca: string;
  filtroRapido: FiltroRapido;
  ocultarNaoDestaque: boolean;
  categoriaSlug: string | null;
  itemFiltroId: number | null;
}

/**
 * Destaque do doador (mesma regra da API pública): precisa URGENTE de um item
 * da categoria escolhida E, se houver, do item escolhido. Calculado aqui para
 * trocar de filtro sem nova requisição.
 */
export function precisaDoQueDoador(abrigo: AbrigoMapa, categoriaSlug: string | null, itemFiltroId: number | null): boolean | null {
  if (!categoriaSlug && !itemFiltroId) return null;
  return abrigo.necessidades.urgentes.some(
    (item) => (!categoriaSlug || item.categoria === categoriaSlug) && (!itemFiltroId || item.id === itemFiltroId),
  );
}

function atendeBusca(abrigo: AbrigoMapa, busca: string): boolean {
  if (!busca) return true;
  return (
    abrigo.nome.toLowerCase().includes(busca) ||
    abrigo.endereco.toLowerCase().includes(busca) ||
    abrigo.necessidades.urgentes.some((i) => i.nome.toLowerCase().includes(busca))
  );
}

function atendeFiltroRapido(abrigo: AbrigoMapa, filtro: FiltroRapido): boolean {
  switch (filtro) {
    case "COM_VAGAS":
      return abrigo.ocupacao.vagasDisponiveis > 0;
    case "INFRA_NORMAL":
      return abrigo.statusInfraestrutura === "NORMAL";
    case "PRECISA_DOACOES":
      return abrigo.necessidades.urgentes.length > 0;
    default:
      return true;
  }
}

/** Filtros locais do mapa + ordenação (prioritários, depois os mais próximos). */
export function filtrarAbrigos(abrigos: AbrigoMapa[], criterios: CriteriosMapa): AbrigoMapa[] {
  const busca = criterios.termoBusca.trim().toLowerCase();
  const somentePrioritarios = criterios.filtroRapido === "DESTAQUE" || criterios.ocultarNaoDestaque;

  return abrigos
    .map((abrigo) => ({ ...abrigo, destaque: precisaDoQueDoador(abrigo, criterios.categoriaSlug, criterios.itemFiltroId) }))
    .filter(
      (abrigo) =>
        atendeBusca(abrigo, busca) &&
        atendeFiltroRapido(abrigo, criterios.filtroRapido) &&
        (!somentePrioritarios || abrigo.destaque === true),
    )
    .sort(
      (a, b) =>
        Number(b.destaque ?? false) - Number(a.destaque ?? false) ||
        (a.distanciaKm ?? Number.POSITIVE_INFINITY) - (b.distanciaKm ?? Number.POSITIVE_INFINITY) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
}
