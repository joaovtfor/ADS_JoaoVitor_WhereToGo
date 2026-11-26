import { describe, expect, it } from "vitest";
import { calcularBBoxPoligono } from "@/components/mapa/cluster-mapa";
import {
  abrigoMaisProximo,
  distanciaEmLinhaReta,
  filtrarAbrigos,
  type CriteriosMapa,
  type PoligonoRiscoFiltro,
} from "@/components/mapa/filtrar-abrigos";
import { gerarCenarioSimulado } from "@/components/mapa/simulador-escala";
import type { AbrigoMapa, CategoriaPublica } from "@/components/mapa/tipos";

function criarAbrigo(id: number, extras: Partial<AbrigoMapa> = {}): AbrigoMapa {
  return {
    id,
    nome: `Abrigo ${id}`,
    endereco: `Rua Teste ${id}`,
    telefone: null,
    latitude: -28.258,
    longitude: -52.406,
    ocupacao: {
      capacidadeMaxima: 50,
      lotacaoAtual: 10,
      vagasDisponiveis: 40,
      percentual: 20,
      nivel: "VERDE",
    },
    statusInfraestrutura: "NORMAL",
    aceitaPets: false,
    acessivelPcd: false,
    ocorrenciasAtivas: [],
    emAreaDeRisco: false,
    rotaCruzaAreaRisco: false,
    necessidades: { urgentes: [], bloqueados: [] },
    destaque: null,
    distanciaKm: null,
    atualizadoEm: "2026-11-25T12:00:00Z",
    ...extras,
  };
}

const CRITERIOS_BASE: CriteriosMapa = {
  termoBusca: "",
  filtroRapido: "TODOS",
  ocultarNaoDestaque: false,
  categoriaSlug: null,
  itemFiltroId: null,
};

describe("Filtros e cálculos espaciais de abrigos", () => {
  it("calcula distância haversine em linha reta com precisão esperada", () => {
    const passoFundo = { lat: -28.258, lng: -52.406 };
    const mesmoPonto = criarAbrigo(1, { latitude: -28.258, longitude: -52.406 });
    expect(distanciaEmLinhaReta(passoFundo, mesmoPonto)).toBe(0);

    // ~1 grau de latitude equivale a ~111,19 km
    const umGrauSul = criarAbrigo(2, { latitude: -29.258, longitude: -52.406 });
    const dist = distanciaEmLinhaReta(passoFundo, umGrauSul);
    expect(dist).toBeGreaterThan(110.5);
    expect(dist).toBeLessThan(112.0);
  });

  it("preserva identidade referencial quando sem filtro de doação e sem posição do usuário", () => {
    const a1 = criarAbrigo(1, { nome: "Ginásio Central", destaque: null });
    const a2 = criarAbrigo(2, { nome: "Escola Bairro", destaque: null });

    const resultado = filtrarAbrigos([a1, a2], CRITERIOS_BASE);
    expect(resultado).toHaveLength(2);
    // Ordenado alfabeticamente em pt-BR
    expect(resultado[0]).toBe(a2);
    expect(resultado[1]).toBe(a1);

    // Se havia destaque anterior e o filtro de doação foi removido, limpa para null
    const comDestaqueAntigo = criarAbrigo(3, { destaque: true });
    const limpo = filtrarAbrigos([comDestaqueAntigo], CRITERIOS_BASE);
    expect(limpo[0]).not.toBe(comDestaqueAntigo);
    expect(limpo[0].destaque).toBeNull();
  });

  it("ordena corretamente usando Intl.Collator pt-BR com acentos e busca normalizada em cache", () => {
    const a1 = criarAbrigo(1, { nome: "Zéfiro" });
    const a2 = criarAbrigo(2, { nome: "Água Boa", endereco: "Av. Principal", necessidades: { urgentes: [{ id: 1, nome: "Cobertor", categoria: "cama-e-banho" }], bloqueados: [] } });
    const a3 = criarAbrigo(3, { nome: "Abrigo Sul" });

    const ordenados = filtrarAbrigos([a1, a2, a3], CRITERIOS_BASE);
    expect(ordenados.map((a) => a.nome)).toEqual(["Abrigo Sul", "Água Boa", "Zéfiro"]);

    expect(filtrarAbrigos([a1, a2, a3], { ...CRITERIOS_BASE, termoBusca: "  COBERTOR " }).map((a) => a.id)).toEqual([2]);
    expect(filtrarAbrigos([a1, a2, a3], { ...CRITERIOS_BASE, termoBusca: "principal" }).map((a) => a.id)).toEqual([2]);
  });

  it("calcula distanciaKm, filtra por raioKm e detecta rotaCruzaAreaRisco no cliente", () => {
    const usuario = { lat: -28.258, lng: -52.406 };
    const pertoSeguro = criarAbrigo(1, { latitude: -28.258, longitude: -52.39 }); // ~1.57 km Leste
    const pertoComRisco = criarAbrigo(2, { latitude: -28.258, longitude: -52.43 }); // ~2.35 km Oeste (cruza polígono)
    const longe = criarAbrigo(3, { latitude: -28.358, longitude: -52.406 }); // ~11.12 km Sul

    const verticesRisco = [
      { lat: -28.262, lng: -52.42 },
      { lat: -28.262, lng: -52.412 },
      { lat: -28.254, lng: -52.412 },
      { lat: -28.254, lng: -52.42 },
    ];
    const poligonosRisco: PoligonoRiscoFiltro[] = [
      { vertices: verticesRisco, bbox: calcularBBoxPoligono(verticesRisco) },
    ];

    const filtrados = filtrarAbrigos([longe, pertoComRisco, pertoSeguro], {
      ...CRITERIOS_BASE,
      posicaoUsuario: usuario,
      raioKm: 5,
      poligonosRisco,
    });

    expect(filtrados.map((a) => a.id)).toEqual([1, 2]);
    expect(filtrados[0].distanciaKm).toBeCloseTo(Math.round(distanciaEmLinhaReta(usuario, pertoSeguro) * 100) / 100, 2);
    expect(filtrados[0].rotaCruzaAreaRisco).toBe(false);
    expect(filtrados[1].rotaCruzaAreaRisco).toBe(true);

    expect(abrigoMaisProximo(filtrados, usuario)?.id).toBe(1);
  });

  it("filtra e ordena 5.000 abrigos com posição e polígonos de risco em menos de 150 ms", () => {
    const categorias: CategoriaPublica[] = [
      { id: 1, nome: "Água", slug: "agua", itens: [{ id: 10, nome: "Água mineral", unidadeMedida: "L" }] },
    ];
    const { abrigos, alertas } = gerarCenarioSimulado(5000, categorias);
    const poligonosRisco: PoligonoRiscoFiltro[] = alertas
      .filter((a) => Array.isArray(a.poligono) && a.poligono.length >= 3)
      .map((a) => ({ vertices: a.poligono!, bbox: calcularBBoxPoligono(a.poligono!) }));

    const inicio = performance.now();
    const resultado = filtrarAbrigos(abrigos, {
      termoBusca: "",
      filtroRapido: "COM_VAGAS",
      ocultarNaoDestaque: false,
      categoriaSlug: "agua",
      itemFiltroId: null,
      posicaoUsuario: { lat: -28.258, lng: -52.406 },
      raioKm: 50,
      poligonosRisco,
    });
    const duracaoMs = performance.now() - inicio;

    expect(resultado.length).toBeGreaterThan(0);
    expect(duracaoMs).toBeLessThan(150);
  });
});
