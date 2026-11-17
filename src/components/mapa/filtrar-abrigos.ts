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
    case "ACEITA_PETS":
      return abrigo.aceitaPets === true;
    case "ACESSIVEL_PCD":
      return abrigo.acessivelPcd === true;
    default:
      return true;
  }
}

/** Distância em linha reta (haversine), em km. Mesma medida que o servidor usa no PostGIS. */
function distanciaEmLinhaReta(origem: { lat: number; lng: number }, abrigo: AbrigoMapa): number {
  const rad = (graus: number) => (graus * Math.PI) / 180;
  const dLat = rad(abrigo.latitude - origem.lat);
  const dLng = rad(abrigo.longitude - origem.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(origem.lat)) * Math.cos(rad(abrigo.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * O abrigo mais próximo de fato, só pela distância (sem a prioridade de doação
 * da ordenação da lista). Usa a distância do servidor e, se ela ainda não veio
 * (sem rede, por exemplo), calcula aqui.
 */
export function abrigoMaisProximo(abrigos: AbrigoMapa[], origem: { lat: number; lng: number }): AbrigoMapa | null {
  let maisProximo: AbrigoMapa | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;
  for (const abrigo of abrigos) {
    const distancia = abrigo.distanciaKm ?? distanciaEmLinhaReta(origem, abrigo);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      maisProximo = abrigo;
    }
  }
  return maisProximo;
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
