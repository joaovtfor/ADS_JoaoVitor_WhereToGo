export type NivelOcupacao = "VERDE" | "AMARELO" | "VERMELHO";

export interface ResumoOcupacao {
  capacidadeMaxima: number;
  lotacaoAtual: number;
  vagasDisponiveis: number;
  /** Percentual com uma casa decimal. */
  percentual: number;
  nivel: NivelOcupacao;
}

/**
 * RF04 / RF06 - taxa de lotação = lotação / capacidade * 100.
 * Verde: < 70% | Amarelo: 70% a 90% | Vermelho: > 90% (ou lotado).
 */
export function resumirOcupacao(lotacaoAtual: number, capacidadeMaxima: number): ResumoOcupacao {
  const proporcao = capacidadeMaxima > 0 ? lotacaoAtual / capacidadeMaxima : 1;
  const nivel: NivelOcupacao = proporcao > 0.9 ? "VERMELHO" : proporcao >= 0.7 ? "AMARELO" : "VERDE";

  return {
    capacidadeMaxima,
    lotacaoAtual,
    vagasDisponiveis: Math.max(0, capacidadeMaxima - lotacaoAtual),
    percentual: Math.round(proporcao * 1000) / 10,
    nivel,
  };
}

/** Deep links de navegação usados nos cards do mapa público (RF07). */
export function linksNavegacao(latitude: number, longitude: number) {
  const destino = `${latitude},${longitude}`;
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${destino}`,
    waze: `https://waze.com/ul?ll=${destino}&navigate=yes`,
  };
}
