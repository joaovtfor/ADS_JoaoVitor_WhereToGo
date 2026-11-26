import { describe, expect, it } from "vitest";
import {
  bboxIntersecta,
  calcularBBoxPoligono,
  criarIndiceAbrigos,
  criarIndiceAlertas,
  MAX_ZOOM_CLUSTER,
  nivelDoCluster,
  RAIO_CLUSTER_ABRIGOS,
  RAIO_CLUSTER_ALERTAS,
  segmentoCruzaPoligono,
  smoothFactorParaZoom,
  type BBoxMapa,
  type PropriedadesClusterAbrigo,
} from "@/components/mapa/cluster-mapa";
import { gerarCenarioSimulado, lerQuantidadeSimulacao } from "@/components/mapa/simulador-escala";
import type { AbrigoMapa, AlertaMapa, CategoriaPublica } from "@/components/mapa/tipos";

const BBOX_PASSO_FUNDO: BBoxMapa = [-53.0, -29.0, -51.5, -27.5];
const BBOX_MUNDO: BBoxMapa = [-180, -85, 180, 85];

function criarAbrigo(id: number, extras: Partial<AbrigoMapa> = {}): AbrigoMapa {
  return {
    id,
    nome: `Abrigo ${id}`,
    endereco: `Rua ${id}`,
    telefone: null,
    latitude: -28.258,
    longitude: -52.406,
    ocupacao: {
      capacidadeMaxima: 100,
      lotacaoAtual: 40,
      vagasDisponiveis: 60,
      percentual: 40,
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

function criarAlerta(id: number, extras: Partial<AlertaMapa> = {}): AlertaMapa {
  return {
    id,
    tipo: "VIA_BLOQUEADA",
    descricaoTipo: "Via de acesso interditada ou bloqueada",
    gravidade: "ALERTA",
    descricao: null,
    latitude: -28.258,
    longitude: -52.406,
    poligono: null,
    localizacaoPropria: true,
    dataRegistro: "2026-11-25T12:00:00Z",
    abrigo: { id: 1, nome: "Abrigo 1" },
    ...extras,
  };
}

describe("Núcleo espacial e clustering", () => {
  it("expõe as constantes esperadas de zoom e raio", () => {
    expect(MAX_ZOOM_CLUSTER).toBe(16);
    expect(RAIO_CLUSTER_ABRIGOS).toBe(56);
    expect(RAIO_CLUSTER_ALERTAS).toBe(48);
  });

  it("classifica o nível do cluster conforme vagas disponíveis e contagem ok/atenção/crítico", () => {
    const base: PropriedadesClusterAbrigo = {
      qtdAbrigos: 3,
      totalVagas: 30,
      qtdOk: 1,
      qtdAtencao: 1,
      qtdCritico: 1,
      temDestaque: false,
      temAviso: false,
      filtroDoacaoAtivo: false,
    };

    expect(nivelDoCluster(base)).toBe("ok");
    expect(nivelDoCluster({ ...base, qtdOk: 0, totalVagas: 15 })).toBe("atencao");
    expect(nivelDoCluster({ ...base, qtdOk: 0, qtdAtencao: 0, totalVagas: 5 })).toBe("atencao");
    expect(nivelDoCluster({ ...base, totalVagas: 0 })).toBe("critico");
    expect(nivelDoCluster({ ...base, qtdOk: 2, totalVagas: 0 })).toBe("critico");
  });

  it("agrega propriedades no cluster de abrigos e expande em zoom alto", () => {
    const abrigos = [
      criarAbrigo(1, {
        latitude: -28.258,
        longitude: -52.406,
        ocupacao: { capacidadeMaxima: 100, lotacaoAtual: 50, vagasDisponiveis: 50, percentual: 50, nivel: "VERDE" },
        destaque: true,
      }),
      criarAbrigo(2, {
        latitude: -28.2582,
        longitude: -52.4062,
        ocupacao: { capacidadeMaxima: 100, lotacaoAtual: 80, vagasDisponiveis: 20, percentual: 80, nivel: "AMARELO" },
        statusInfraestrutura: "ALERTA",
        destaque: false,
      }),
      criarAbrigo(3, {
        latitude: -28.2584,
        longitude: -52.4064,
        ocupacao: { capacidadeMaxima: 100, lotacaoAtual: 100, vagasDisponiveis: 0, percentual: 100, nivel: "VERMELHO" },
        emAreaDeRisco: true,
        destaque: false,
      }),
    ];

    const indice = criarIndiceAbrigos(abrigos, { filtroDoacaoAtivo: true });
    const agrupados = indice.consultar(BBOX_PASSO_FUNDO, 11);

    expect(agrupados).toHaveLength(1);
    expect(agrupados[0]).toMatchObject({
      tipo: "cluster",
      propriedades: {
        qtdAbrigos: 3,
        totalVagas: 70,
        qtdOk: 1,
        qtdAtencao: 1,
        qtdCritico: 1,
        temDestaque: true,
        temAviso: true,
        filtroDoacaoAtivo: true,
      },
    });

    const cluster = agrupados[0];
    if (cluster.tipo !== "cluster") throw new Error("Esperado cluster");

    expect(indice.obterFolhas(cluster.id).map((a) => a.id).sort()).toEqual([1, 2, 3]);
    expect(indice.saoCoincidentes(cluster.id, 11)).toBe(false);

    const zoomExpansao = indice.zoomDeExpansao(cluster.id, 11);
    expect(zoomExpansao).toBeGreaterThan(11);

    const expandidos = indice.consultar(BBOX_PASSO_FUNDO, 18);
    expect(expandidos).toHaveLength(3);
    expect(expandidos.every((item) => item.tipo === "abrigo")).toBe(true);
  });

  it("nunca absorve o abrigo selecionado dentro de um cluster", () => {
    const abrigos = [
      criarAbrigo(10, { latitude: -28.258, longitude: -52.406 }),
      criarAbrigo(11, { latitude: -28.258, longitude: -52.406 }),
      criarAbrigo(12, { latitude: -28.258, longitude: -52.406 }),
    ];

    const indice = criarIndiceAbrigos(abrigos, { idSelecionado: 11 });
    const itens = indice.consultar(BBOX_PASSO_FUNDO, 10);

    const clusters = itens.filter((i) => i.tipo === "cluster");
    const individuais = itens.filter((i) => i.tipo === "abrigo");

    expect(clusters).toHaveLength(1);
    if (clusters[0].tipo === "cluster") {
      expect(clusters[0].propriedades.qtdAbrigos).toBe(2);
    }
    expect(individuais).toHaveLength(1);
    expect(individuais[0].tipo === "abrigo" && individuais[0].abrigo.id).toBe(11);
  });

  it("detecta clusters coincidentes e trata IDs inválidos com fallback seguro", () => {
    const coincidentes = [
      criarAbrigo(1, { latitude: -28.258, longitude: -52.406 }),
      criarAbrigo(2, { latitude: -28.258002, longitude: -52.406002 }),
      criarAbrigo(3, { latitude: -28.258, longitude: -52.406 }),
    ];

    const indice = criarIndiceAbrigos(coincidentes);
    const itens = indice.consultar(BBOX_PASSO_FUNDO, 14);
    expect(itens).toHaveLength(1);
    const cluster = itens[0];
    if (cluster.tipo !== "cluster") throw new Error("Esperado cluster");

    expect(indice.saoCoincidentes(cluster.id, 14)).toBe(true);
    expect(indice.saoCoincidentes(cluster.id, MAX_ZOOM_CLUSTER)).toBe(true);

    expect(indice.zoomDeExpansao(999_999, 13)).toBe(15);
    expect(indice.obterFolhas(999_999)).toEqual([]);
    expect(indice.saoCoincidentes(999_999)).toBe(false);
  });

  it("indexa alertas pontuais com zoom semântico (oculto <= 10) e maior gravidade", () => {
    const alertas = [
      criarAlerta(1, { latitude: -28.258, longitude: -52.406, gravidade: "ALERTA", localizacaoPropria: true }),
      criarAlerta(2, { latitude: -28.2581, longitude: -52.4061, gravidade: "CRITICO", localizacaoPropria: true }),
      // Deve ser ignorado por ser polígono
      criarAlerta(3, {
        latitude: -28.258,
        longitude: -52.406,
        localizacaoPropria: true,
        poligono: [
          { lat: -28.25, lng: -52.41 },
          { lat: -28.26, lng: -52.41 },
          { lat: -28.26, lng: -52.4 },
        ],
      }),
      // Deve ser ignorado por não ter localização própria
      criarAlerta(4, { latitude: -28.258, longitude: -52.406, localizacaoPropria: false }),
    ];

    const indice = criarIndiceAlertas(alertas);
    expect(indice.consultar(BBOX_PASSO_FUNDO, 10)).toEqual([]);

    const emZoom11 = indice.consultar(BBOX_PASSO_FUNDO, 11);
    expect(emZoom11).toHaveLength(1);
    expect(emZoom11[0]).toMatchObject({
      tipo: "cluster",
      qtdAlertas: 2,
      gravidade: "CRITICO",
    });

    const cluster = emZoom11[0];
    if (cluster.tipo !== "cluster") throw new Error("Esperado cluster de alertas");
    expect(indice.zoomDeExpansao(cluster.id, 11)).toBeGreaterThan(11);
    expect(indice.zoomDeExpansao(999_999, 11)).toBe(13);

    const emZoom14 = indice.consultar(BBOX_PASSO_FUNDO, 14);
    expect(emZoom14).toHaveLength(2);
    expect(emZoom14.every((i) => i.tipo === "alerta")).toBe(true);
  });

  it("calcula BBox, interseção, smoothFactor e interseção segmento-polígono corretamente", () => {
    const quadrado = [
      { lat: -28.26, lng: -52.41 },
      { lat: -28.26, lng: -52.4 },
      { lat: -28.25, lng: -52.4 },
      { lat: -28.25, lng: -52.41 },
    ];
    const bbox = calcularBBoxPoligono(quadrado);
    expect(bbox).toEqual([-52.41, -28.26, -52.4, -28.25]);
    expect(calcularBBoxPoligono([])).toEqual([0, 0, 0, 0]);

    expect(bboxIntersecta(bbox, [-52.405, -28.255, -52.39, -28.24])).toBe(true);
    expect(bboxIntersecta(bbox, [-52.39, -28.26, -52.38, -28.25])).toBe(false);

    expect(smoothFactorParaZoom(10)).toBe(2.5);
    expect(smoothFactorParaZoom(12)).toBe(1.5);
    expect(smoothFactorParaZoom(14)).toBe(1.0);

    // Cruza pelo meio
    expect(segmentoCruzaPoligono({ lat: -28.265, lng: -52.405 }, { lat: -28.245, lng: -52.405 }, quadrado, bbox)).toBe(true);
    // Totalmente contido no polígono
    expect(segmentoCruzaPoligono({ lat: -28.256, lng: -52.406 }, { lat: -28.254, lng: -52.404 }, quadrado, bbox)).toBe(true);
    // Fora da BBox
    expect(segmentoCruzaPoligono({ lat: -28.27, lng: -52.42 }, { lat: -28.265, lng: -52.415 }, quadrado, bbox)).toBe(false);

    // Triângulo diagonal: BBox do segmento intersecta BBox do triângulo, mas o segmento não toca o triângulo
    const triangulo = [
      { lat: -28.26, lng: -52.4 },
      { lat: -28.25, lng: -52.4 },
      { lat: -28.25, lng: -52.41 },
    ];
    expect(segmentoCruzaPoligono({ lat: -28.26, lng: -52.41 }, { lat: -28.258, lng: -52.408 }, triangulo)).toBe(false);
    expect(segmentoCruzaPoligono({ lat: -28.26, lng: -52.41 }, { lat: -28.25, lng: -52.4 }, [{ lat: 0, lng: 0 }])).toBe(false);
  });

  it("lê parâmetro de simulação e gera cenário determinístico em escala", () => {
    expect(lerQuantidadeSimulacao("")).toBeNull();
    expect(lerQuantidadeSimulacao("?simular=9")).toBeNull();
    expect(lerQuantidadeSimulacao("?simular=10001")).toBeNull();
    expect(lerQuantidadeSimulacao("?simular=50.5")).toBeNull();
    expect(lerQuantidadeSimulacao("?simular=abc")).toBeNull();
    expect(lerQuantidadeSimulacao("?simular=10")).toBe(10);
    expect(lerQuantidadeSimulacao("?simular=5000")).toBe(5000);
    expect(lerQuantidadeSimulacao("?simular=10000")).toBe(10000);

    const categorias: CategoriaPublica[] = [
      { id: 1, nome: "Água", slug: "agua", itens: [{ id: 10, nome: "Água mineral", unidadeMedida: "L" }] },
      { id: 2, nome: "Alimentos", slug: "alimentos", itens: [{ id: 20, nome: "Cesta básica", unidadeMedida: "un" }] },
    ];

    const cenarioA = gerarCenarioSimulado(100, categorias);
    const cenarioB = gerarCenarioSimulado(100, categorias);
    expect(cenarioA).toEqual(cenarioB);
    expect(cenarioA.abrigos).toHaveLength(100);
    expect(cenarioA.alertas).toHaveLength(12); // max(12, round(100 * 0.1))

    // Verifica os 4 pontos coincidentes
    const coordenadas = new Map<string, number>();
    for (const abrigo of cenarioA.abrigos) {
      const chave = `${abrigo.latitude},${abrigo.longitude}`;
      coordenadas.set(chave, (coordenadas.get(chave) ?? 0) + 1);
    }
    expect(Math.max(...coordenadas.values())).toBeGreaterThanOrEqual(4);

    // Verifica mix de níveis e alertas com polígonos/pontos
    const niveis = new Set(cenarioA.abrigos.map((a) => a.ocupacao.nivel));
    expect(niveis).toEqual(new Set(["VERDE", "AMARELO", "VERMELHO"]));
    expect(cenarioA.alertas.some((a) => Array.isArray(a.poligono) && a.poligono.length >= 3)).toBe(true);
    expect(cenarioA.alertas.some((a) => a.localizacaoPropria && !a.poligono)).toBe(true);
  });

  it("indexa e consulta 5.000 abrigos em menos de 150 ms", () => {
    const categorias: CategoriaPublica[] = [
      { id: 1, nome: "Água", slug: "agua", itens: [{ id: 10, nome: "Água 5 L", unidadeMedida: "un" }] },
    ];
    const { abrigos, alertas } = gerarCenarioSimulado(5000, categorias);
    expect(abrigos).toHaveLength(5000);
    expect(alertas).toHaveLength(250);

    const inicio = performance.now();
    const indice = criarIndiceAbrigos(abrigos, { idSelecionado: 1 });
    const itens = indice.consultar(BBOX_MUNDO, 11);
    const duracaoMs = performance.now() - inicio;

    expect(itens.length).toBeGreaterThan(0);
    expect(itens.some((i) => i.tipo === "abrigo" && i.abrigo.id === 1)).toBe(true);
    expect(duracaoMs).toBeLessThan(150);
  });
});
