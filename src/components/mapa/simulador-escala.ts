import {
  ROTULO_OCORRENCIA,
  type AbrigoMapa,
  type AlertaMapa,
  type CategoriaPublica,
  type ItemNecessidadePublico,
  type OcupacaoPublica,
  type StatusInfraPublico,
} from "./tipos";

const MIN_SIMULACAO = 10;
const MAX_SIMULACAO = 10_000;

interface PoloRegional {
  cidade: string;
  lat: number;
  lng: number;
  dispersaoLat: number;
  dispersaoLng: number;
  peso: number;
}

const POLO_PASSO_FUNDO: PoloRegional = {
  cidade: "Passo Fundo",
  lat: -28.258,
  lng: -52.406,
  dispersaoLat: 0.045,
  dispersaoLng: 0.055,
  peso: 0.55,
};

const POLOS_VIZINHOS: ReadonlyArray<PoloRegional> = [
  { cidade: "Carazinho", lat: -28.292, lng: -52.786, dispersaoLat: 0.025, dispersaoLng: 0.03, peso: 0.09 },
  { cidade: "Marau", lat: -28.449, lng: -52.2, dispersaoLat: 0.022, dispersaoLng: 0.026, peso: 0.08 },
  { cidade: "Erechim", lat: -27.634, lng: -52.273, dispersaoLat: 0.03, dispersaoLng: 0.035, peso: 0.08 },
  { cidade: "Soledade", lat: -28.818, lng: -52.51, dispersaoLat: 0.025, dispersaoLng: 0.028, peso: 0.05 },
  { cidade: "Cruz Alta", lat: -28.638, lng: -53.606, dispersaoLat: 0.028, dispersaoLng: 0.032, peso: 0.05 },
  { cidade: "Tapejara", lat: -28.068, lng: -52.012, dispersaoLat: 0.018, dispersaoLng: 0.022, peso: 0.04 },
  { cidade: "Lagoa Vermelha", lat: -28.208, lng: -51.525, dispersaoLat: 0.022, dispersaoLng: 0.025, peso: 0.03 },
  { cidade: "Não-Me-Toque", lat: -28.458, lng: -52.82, dispersaoLat: 0.018, dispersaoLng: 0.022, peso: 0.03 },
];

const COORD_COINCIDENTE = { lat: -28.258, lng: -52.406 };
const QUANTIDADE_COINCIDENTES = 4;

const PREFIXOS_ABRIGO = [
  "Ginásio Municipal",
  "Escola Estadual",
  "Salão Paroquial",
  "Centro Comunitário",
  "Pavilhão",
  "Parque de Exposições",
  "Associação",
  "Auditório",
];

const LOGRADOUROS = [
  "Av. Brasil",
  "Rua Teixeira Soares",
  "Av. Presidente Vargas",
  "Rua Morom",
  "Rua Bento Gonçalves",
  "Av. Sete de Setembro",
  "Rua General Osório",
  "Rua Capitão Eleutério",
];

const TIPOS_ALERTA_PONTUAIS = ["VIA_BLOQUEADA", "ALAGAMENTO", "DESLIZAMENTO", "SEM_ENERGIA", "SEM_AGUA", "RISCO_ESTRUTURAL"] as const;

const ITENS_FALLBACK: ReadonlyArray<ItemNecessidadePublico> = [
  { id: 101, nome: "Água mineral", categoria: "agua" },
  { id: 102, nome: "Cesta básica", categoria: "alimentos" },
  { id: 103, nome: "Kit higiene", categoria: "higiene" },
  { id: 104, nome: "Colchonete", categoria: "cama-e-banho" },
  { id: 105, nome: "Fralda infantil", categoria: "infantil" },
  { id: 106, nome: "Ração para cães", categoria: "animais" },
];

/** PRNG determinístico Mulberry32. */
function criarMulberry32(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escolherPolo(sortear: () => number): PoloRegional {
  const r = sortear();
  if (r < POLO_PASSO_FUNDO.peso) return POLO_PASSO_FUNDO;
  let acumulado = POLO_PASSO_FUNDO.peso;
  for (const polo of POLOS_VIZINHOS) {
    acumulado += polo.peso;
    if (r < acumulado) return polo;
  }
  return POLO_PASSO_FUNDO;
}

function montarOcupacao(sortear: () => number): OcupacaoPublica {
  const capacidadeMaxima = 40 + Math.floor(sortear() * 21) * 10;
  const faixa = sortear();

  let proporcao: number;
  if (faixa < 0.55) {
    // VERDE (< 70%)
    proporcao = 0.1 + sortear() * 0.55;
  } else if (faixa < 0.8) {
    // AMARELO (70% a 90%)
    proporcao = 0.72 + sortear() * 0.17;
  } else if (faixa < 0.9) {
    // VERMELHO com últimas vagas (> 90%, < 100%)
    proporcao = 0.92 + sortear() * 0.06;
  } else {
    // VERMELHO lotado (100%)
    proporcao = 1;
  }

  const lotacaoAtual = Math.min(capacidadeMaxima, Math.round(capacidadeMaxima * proporcao));
  const vagasDisponiveis = Math.max(0, capacidadeMaxima - lotacaoAtual);
  const taxa = capacidadeMaxima > 0 ? lotacaoAtual / capacidadeMaxima : 1;
  const nivel = taxa > 0.9 ? "VERMELHO" : taxa >= 0.7 ? "AMARELO" : "VERDE";

  return {
    capacidadeMaxima,
    lotacaoAtual,
    vagasDisponiveis,
    percentual: Math.round(taxa * 1000) / 10,
    nivel,
  };
}

function extrairItensDisponiveis(categorias: CategoriaPublica[]): ItemNecessidadePublico[] {
  const itens: ItemNecessidadePublico[] = [];
  for (const categoria of categorias) {
    for (const item of categoria.itens) {
      itens.push({ id: item.id, nome: item.nome, categoria: categoria.slug });
    }
  }
  return itens.length > 0 ? itens : [...ITENS_FALLBACK];
}

function arredondarCoord(valor: number): number {
  return Math.round(valor * 1_000_000) / 1_000_000;
}

/**
 * Lê `?simular=N` da query string, retornando um inteiro entre 10 e 10000 ou `null`.
 */
export function lerQuantidadeSimulacao(search: string): number | null {
  const bruto = new URLSearchParams(search).get("simular")?.trim();
  if (!bruto || !/^\d+$/.test(bruto)) return null;
  const quantidade = Number(bruto);
  return Number.isInteger(quantidade) && quantidade >= MIN_SIMULACAO && quantidade <= MAX_SIMULACAO ? quantidade : null;
}

/**
 * Gera cenário determinístico em escala (abrigos e alertas) centrado em Passo Fundo/RS
 * e polos vizinhos, incluindo 4 abrigos coincidentes para validar o comportamento de clusters.
 */
export function gerarCenarioSimulado(
  quantidade: number,
  categorias: CategoriaPublica[],
): { abrigos: AbrigoMapa[]; alertas: AlertaMapa[] } {
  if (quantidade <= 0) return { abrigos: [], alertas: [] };

  const sortear = criarMulberry32(0x57544700 ^ quantidade);
  const catalogoItens = extrairItensDisponiveis(categorias);
  const baseTimestamp = Date.parse("2026-11-25T15:00:00Z");

  const abrigos: AbrigoMapa[] = [];
  for (let i = 0; i < quantidade; i++) {
    const id = i + 1;
    const coincidente = quantidade >= QUANTIDADE_COINCIDENTES && i < QUANTIDADE_COINCIDENTES;
    const polo = coincidente ? POLO_PASSO_FUNDO : escolherPolo(sortear);

    const latitude = coincidente
      ? COORD_COINCIDENTE.lat
      : arredondarCoord(polo.lat + (sortear() - 0.5) * 2 * polo.dispersaoLat);
    const longitude = coincidente
      ? COORD_COINCIDENTE.lng
      : arredondarCoord(polo.lng + (sortear() - 0.5) * 2 * polo.dispersaoLng);

    const ocupacao = montarOcupacao(sortear);
    const prefixo = PREFIXOS_ABRIGO[i % PREFIXOS_ABRIGO.length];
    const logradouro = LOGRADOUROS[Math.floor(sortear() * LOGRADOUROS.length)];
    const numero = 100 + Math.floor(sortear() * 1900);

    const rInfra = sortear();
    const statusInfraestrutura: StatusInfraPublico = rInfra < 0.08 ? "CRITICO" : rInfra < 0.22 ? "ALERTA" : "NORMAL";
    const emAreaDeRisco = sortear() < 0.07;

    const qtdUrgentes = sortear() < 0.65 ? 1 + Math.floor(sortear() * 3) : 0;
    const urgentes: ItemNecessidadePublico[] = [];
    const idsUsados = new Set<number>();
    for (let u = 0; u < qtdUrgentes && idsUsados.size < catalogoItens.length; u++) {
      const escolhido = catalogoItens[Math.floor(sortear() * catalogoItens.length)];
      if (!idsUsados.has(escolhido.id)) {
        idsUsados.add(escolhido.id);
        urgentes.push(escolhido);
      }
    }

    const ocorrenciasAtivas: Array<{ tipo: string; gravidade: "ALERTA" | "CRITICO" }> = [];
    if (statusInfraestrutura !== "NORMAL") {
      const tipo = TIPOS_ALERTA_PONTUAIS[Math.floor(sortear() * TIPOS_ALERTA_PONTUAIS.length)];
      ocorrenciasAtivas.push({
        tipo,
        gravidade: statusInfraestrutura === "CRITICO" ? "CRITICO" : "ALERTA",
      });
    }

    abrigos.push({
      id,
      nome: coincidente ? `${prefixo} Central ${id}` : `${prefixo} ${polo.cidade} #${id}`,
      endereco: `${logradouro}, ${numero} - ${polo.cidade}/RS`,
      telefone: i % 3 === 0 ? null : `(54) 3311-${String(1000 + (id % 9000)).padStart(4, "0")}`,
      latitude,
      longitude,
      ocupacao,
      statusInfraestrutura,
      aceitaPets: sortear() < 0.45,
      acessivelPcd: sortear() < 0.55,
      ocorrenciasAtivas,
      emAreaDeRisco,
      rotaCruzaAreaRisco: false,
      necessidades: { urgentes, bloqueados: [] },
      destaque: null,
      distanciaKm: null,
      atualizadoEm: new Date(baseTimestamp - Math.floor(sortear() * 180) * 60_000).toISOString(),
    });
  }

  const totalAlertas = Math.min(250, Math.max(12, Math.round(quantidade * 0.1)));
  const alertas: AlertaMapa[] = [];

  for (let i = 0; i < totalAlertas; i++) {
    const id = i + 1;
    const ehPoligono = i % 4 === 0;
    const polo = i < 4 ? POLO_PASSO_FUNDO : escolherPolo(sortear);
    const latCentro = arredondarCoord(polo.lat + (sortear() - 0.5) * 2 * polo.dispersaoLat * 0.8);
    const lngCentro = arredondarCoord(polo.lng + (sortear() - 0.5) * 2 * polo.dispersaoLng * 0.8);
    const gravidade: "ALERTA" | "CRITICO" = sortear() < 0.35 ? "CRITICO" : "ALERTA";
    const abrigoVinculado = sortear() < 0.75 ? abrigos[Math.floor(sortear() * abrigos.length)] : null;
    const dataRegistro = new Date(baseTimestamp - Math.floor(sortear() * 240) * 60_000).toISOString();

    if (ehPoligono) {
      const vertices = 5;
      const raioLat = 0.004 + sortear() * 0.006;
      const raioLng = 0.005 + sortear() * 0.008;
      const poligono: Array<{ lat: number; lng: number }> = [];
      for (let v = 0; v < vertices; v++) {
        const angulo = (v / vertices) * Math.PI * 2;
        const variacao = 0.75 + sortear() * 0.45;
        poligono.push({
          lat: arredondarCoord(latCentro + Math.sin(angulo) * raioLat * variacao),
          lng: arredondarCoord(lngCentro + Math.cos(angulo) * raioLng * variacao),
        });
      }

      alertas.push({
        id,
        tipo: "AREA_RISCO",
        descricaoTipo: ROTULO_OCORRENCIA.AREA_RISCO,
        gravidade,
        descricao: `Área monitorada em ${polo.cidade}`,
        latitude: latCentro,
        longitude: lngCentro,
        poligono,
        localizacaoPropria: true,
        dataRegistro,
        abrigo: abrigoVinculado ? { id: abrigoVinculado.id, nome: abrigoVinculado.nome } : null,
      });
      continue;
    }

    const tipo = TIPOS_ALERTA_PONTUAIS[Math.floor(sortear() * TIPOS_ALERTA_PONTUAIS.length)];
    alertas.push({
      id,
      tipo,
      descricaoTipo: ROTULO_OCORRENCIA[tipo] ?? ROTULO_OCORRENCIA.OUTRO,
      gravidade,
      descricao: `Ocorrência simulada na região de ${polo.cidade}`,
      latitude: latCentro,
      longitude: lngCentro,
      poligono: null,
      localizacaoPropria: true,
      dataRegistro,
      abrigo: abrigoVinculado ? { id: abrigoVinculado.id, nome: abrigoVinculado.nome } : null,
    });
  }

  return { abrigos, alertas };
}
