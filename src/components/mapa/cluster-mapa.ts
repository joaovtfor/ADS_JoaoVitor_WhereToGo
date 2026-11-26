import type { Feature, Point } from "geojson";
import Supercluster from "supercluster";
import { obterStatusOcupacao, type AbrigoMapa, type AlertaMapa } from "./tipos";

export const MAX_ZOOM_CLUSTER = 16;
export const RAIO_CLUSTER_ABRIGOS = 56;
export const RAIO_CLUSTER_ALERTAS = 48;

const MAX_ZOOM_CLUSTER_ALERTAS = 13;
const ZOOM_MINIMO_ALERTAS_PONTUAIS = 11;
const TOLERANCIA_COORD_COINCIDENTE = 1e-5;

export type BBoxMapa = [oeste: number, sul: number, leste: number, norte: number];

export type NivelCluster = "ok" | "atencao" | "critico";

export type PropriedadesClusterAbrigo = {
  qtdAbrigos: number;
  totalVagas: number;
  qtdOk: number;
  qtdAtencao: number;
  qtdCritico: number;
  temDestaque: boolean;
  temAviso: boolean;
  filtroDoacaoAtivo: boolean;
};

export type ItemMapaAbrigo =
  | {
      tipo: "cluster";
      id: number;
      latitude: number;
      longitude: number;
      propriedades: PropriedadesClusterAbrigo;
    }
  | {
      tipo: "abrigo";
      abrigo: AbrigoMapa;
    };

export type ItemMapaAlerta =
  | {
      tipo: "cluster";
      id: number;
      latitude: number;
      longitude: number;
      qtdAlertas: number;
      gravidade: "ALERTA" | "CRITICO";
    }
  | {
      tipo: "alerta";
      alerta: AlertaMapa;
    };

export interface IndiceAbrigos {
  consultar(bbox: BBoxMapa, zoom: number): ItemMapaAbrigo[];
  zoomDeExpansao(clusterId: number, zoomAtual?: number): number;
  obterFolhas(clusterId: number, limite?: number): AbrigoMapa[];
  saoCoincidentes(clusterId: number, zoomAtual?: number): boolean;
}

export interface IndiceAlertas {
  consultar(bbox: BBoxMapa, zoom: number): ItemMapaAlerta[];
  zoomDeExpansao(clusterId: number, zoomAtual?: number): number;
}

type PontoAbrigoProps = {
  abrigo: AbrigoMapa;
};

type PontoAlertaProps = {
  alerta: AlertaMapa;
};

type PropriedadesClusterAlerta = {
  qtdAlertas: number;
  gravidade: "ALERTA" | "CRITICO";
};

function normalizarZoom(zoom: number): number {
  return Math.max(0, Math.min(20, Math.round(zoom)));
}

function ehCluster<P, C>(
  props: P | (C & { cluster: true; cluster_id: number; point_count: number }),
): props is C & { cluster: true; cluster_id: number; point_count: number } {
  return typeof props === "object" && props !== null && "cluster" in props && props.cluster === true;
}

/** Classifica a cor predominante do cluster conforme vagas disponíveis e estado dos abrigos. */
export function nivelDoCluster(props: PropriedadesClusterAbrigo): NivelCluster {
  if (props.totalVagas > 0 && props.qtdOk > 0) return "ok";
  if (props.totalVagas > 0 && props.qtdOk === 0) return "atencao";
  return "critico";
}

/** Cria o índice espacial de abrigos, mantendo o abrigo selecionado sempre isolado de clusters. */
export function criarIndiceAbrigos(
  abrigos: AbrigoMapa[],
  opcoes?: { idSelecionado?: number | null; filtroDoacaoAtivo?: boolean },
): IndiceAbrigos {
  const idSelecionado = opcoes?.idSelecionado ?? null;
  const filtroDoacaoAtivo = opcoes?.filtroDoacaoAtivo ?? abrigos.some((abrigo) => abrigo.destaque !== null);

  let abrigoSelecionado: AbrigoMapa | null = null;
  const pontos: Array<Feature<Point, PontoAbrigoProps>> = [];

  for (const abrigo of abrigos) {
    if (idSelecionado !== null && abrigo.id === idSelecionado && abrigoSelecionado === null) {
      abrigoSelecionado = abrigo;
      continue;
    }
    pontos.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [abrigo.longitude, abrigo.latitude],
      },
      properties: { abrigo },
    });
  }

  const indice =
    pontos.length > 0
      ? new Supercluster<PontoAbrigoProps, PropriedadesClusterAbrigo>({
          radius: RAIO_CLUSTER_ABRIGOS,
          maxZoom: MAX_ZOOM_CLUSTER,
          minPoints: 2,
          map: (props) => {
            const { abrigo } = props;
            const nivel = obterStatusOcupacao(abrigo.ocupacao).nivel;
            return {
              qtdAbrigos: 1,
              totalVagas: Math.max(0, abrigo.ocupacao.vagasDisponiveis),
              qtdOk: nivel === "ok" ? 1 : 0,
              qtdAtencao: nivel === "atencao" ? 1 : 0,
              qtdCritico: nivel === "critico" ? 1 : 0,
              temDestaque: abrigo.destaque === true,
              temAviso: abrigo.statusInfraestrutura !== "NORMAL" || abrigo.emAreaDeRisco,
              filtroDoacaoAtivo,
            };
          },
          reduce: (acumulado, props) => {
            acumulado.qtdAbrigos += props.qtdAbrigos;
            acumulado.totalVagas += props.totalVagas;
            acumulado.qtdOk += props.qtdOk;
            acumulado.qtdAtencao += props.qtdAtencao;
            acumulado.qtdCritico += props.qtdCritico;
            acumulado.temDestaque = acumulado.temDestaque || props.temDestaque;
            acumulado.temAviso = acumulado.temAviso || props.temAviso;
          },
        }).load(pontos)
      : null;

  const consultar = (bbox: BBoxMapa, zoom: number): ItemMapaAbrigo[] => {
    const itens: ItemMapaAbrigo[] = [];

    if (indice) {
      const zoomInt = normalizarZoom(zoom);
      const encontrados = indice.getClusters(bbox, zoomInt);
      for (const feature of encontrados) {
        const props = feature.properties;
        if (ehCluster<PontoAbrigoProps, PropriedadesClusterAbrigo>(props)) {
          const [longitude, latitude] = feature.geometry.coordinates;
          itens.push({
            tipo: "cluster",
            id: props.cluster_id,
            latitude,
            longitude,
            propriedades: {
              qtdAbrigos: props.qtdAbrigos,
              totalVagas: props.totalVagas,
              qtdOk: props.qtdOk,
              qtdAtencao: props.qtdAtencao,
              qtdCritico: props.qtdCritico,
              temDestaque: props.temDestaque,
              temAviso: props.temAviso,
              filtroDoacaoAtivo: props.filtroDoacaoAtivo,
            },
          });
        } else {
          itens.push({
            tipo: "abrigo",
            abrigo: props.abrigo,
          });
        }
      }
    }

    if (abrigoSelecionado) {
      itens.push({ tipo: "abrigo", abrigo: abrigoSelecionado });
    }

    return itens;
  };

  const zoomDeExpansao = (clusterId: number, zoomAtual = 13): number => {
    const fallback = Math.min(zoomAtual + 2, MAX_ZOOM_CLUSTER + 1);
    if (!indice) return fallback;
    try {
      const expansao = indice.getClusterExpansionZoom(clusterId);
      return expansao >= 0 && expansao <= MAX_ZOOM_CLUSTER + 1 ? expansao : fallback;
    } catch {
      return fallback;
    }
  };

  const obterFolhas = (clusterId: number, limite = 200): AbrigoMapa[] => {
    if (!indice || limite <= 0) return [];
    try {
      return indice.getLeaves(clusterId, limite).map((feature) => feature.properties.abrigo);
    } catch {
      return [];
    }
  };

  const saoCoincidentes = (clusterId: number, zoomAtual?: number): boolean => {
    const folhas = obterFolhas(clusterId);
    const primeira = folhas[0];
    if (!primeira || folhas.length < 2) return false;
    const mesmasCoordenadas = folhas.every(
      (folha) =>
        Math.abs(folha.latitude - primeira.latitude) < TOLERANCIA_COORD_COINCIDENTE &&
        Math.abs(folha.longitude - primeira.longitude) < TOLERANCIA_COORD_COINCIDENTE,
    );
    if (mesmasCoordenadas) return true;
    return zoomAtual !== undefined && zoomAtual >= MAX_ZOOM_CLUSTER && zoomDeExpansao(clusterId, zoomAtual) > MAX_ZOOM_CLUSTER;
  };

  return {
    consultar,
    zoomDeExpansao,
    obterFolhas,
    saoCoincidentes,
  };
}

/** Cria o índice espacial apenas para alertas pontuais com localização própria. */
export function criarIndiceAlertas(alertas: AlertaMapa[]): IndiceAlertas {
  const pontos: Array<Feature<Point, PontoAlertaProps>> = [];

  for (const alerta of alertas) {
    const temPoligono = Array.isArray(alerta.poligono) && alerta.poligono.length >= 3;
    if (!alerta.localizacaoPropria || temPoligono) continue;

    pontos.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [alerta.longitude, alerta.latitude],
      },
      properties: { alerta },
    });
  }

  const indice =
    pontos.length > 0
      ? new Supercluster<PontoAlertaProps, PropriedadesClusterAlerta>({
          radius: RAIO_CLUSTER_ALERTAS,
          maxZoom: MAX_ZOOM_CLUSTER_ALERTAS,
          minPoints: 2,
          map: (props) => ({
            qtdAlertas: 1,
            gravidade: props.alerta.gravidade,
          }),
          reduce: (acumulado, props) => {
            acumulado.qtdAlertas += props.qtdAlertas;
            if (props.gravidade === "CRITICO") {
              acumulado.gravidade = "CRITICO";
            }
          },
        }).load(pontos)
      : null;

  const consultar = (bbox: BBoxMapa, zoom: number): ItemMapaAlerta[] => {
    const zoomInt = normalizarZoom(zoom);
    if (zoomInt < ZOOM_MINIMO_ALERTAS_PONTUAIS || !indice) return [];

    const encontrados = indice.getClusters(bbox, zoomInt);
    const itens: ItemMapaAlerta[] = [];

    for (const feature of encontrados) {
      const props = feature.properties;
      if (ehCluster<PontoAlertaProps, PropriedadesClusterAlerta>(props)) {
        const [longitude, latitude] = feature.geometry.coordinates;
        itens.push({
          tipo: "cluster",
          id: props.cluster_id,
          latitude,
          longitude,
          qtdAlertas: props.qtdAlertas,
          gravidade: props.gravidade,
        });
      } else {
        itens.push({
          tipo: "alerta",
          alerta: props.alerta,
        });
      }
    }

    return itens;
  };

  const zoomDeExpansao = (clusterId: number, zoomAtual = 11): number => {
    const fallback = Math.min(zoomAtual + 2, MAX_ZOOM_CLUSTER_ALERTAS + 1);
    if (!indice) return fallback;
    try {
      const expansao = indice.getClusterExpansionZoom(clusterId);
      return expansao >= 0 && expansao <= MAX_ZOOM_CLUSTER_ALERTAS + 1 ? expansao : fallback;
    } catch {
      return fallback;
    }
  };

  return {
    consultar,
    zoomDeExpansao,
  };
}

/** Calcula a bounding box [oeste, sul, leste, norte] de um polígono. */
export function calcularBBoxPoligono(poligono: Array<{ lat: number; lng: number }>): BBoxMapa {
  if (poligono.length === 0) return [0, 0, 0, 0];

  let oeste = poligono[0].lng;
  let sul = poligono[0].lat;
  let leste = poligono[0].lng;
  let norte = poligono[0].lat;

  for (let i = 1; i < poligono.length; i++) {
    const ponto = poligono[i];
    if (ponto.lng < oeste) oeste = ponto.lng;
    if (ponto.lng > leste) leste = ponto.lng;
    if (ponto.lat < sul) sul = ponto.lat;
    if (ponto.lat > norte) norte = ponto.lat;
  }

  return [oeste, sul, leste, norte];
}

/** Verifica se duas bounding boxes [oeste, sul, leste, norte] se intersectam. */
export function bboxIntersecta(a: BBoxMapa, b: BBoxMapa): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Fator de simplificação visual de polígonos adequado ao nível de zoom. */
export function smoothFactorParaZoom(zoom: number): number {
  return zoom <= 10 ? 2.5 : zoom <= 13 ? 1.5 : 1.0;
}

function orientacao(p: { lat: number; lng: number }, q: { lat: number; lng: number }, r: { lat: number; lng: number }): number {
  return (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
}

function pontoNoSegmento(p: { lat: number; lng: number }, q: { lat: number; lng: number }, r: { lat: number; lng: number }): boolean {
  return (
    q.lng <= Math.max(p.lng, r.lng) &&
    q.lng >= Math.min(p.lng, r.lng) &&
    q.lat <= Math.max(p.lat, r.lat) &&
    q.lat >= Math.min(p.lat, r.lat)
  );
}

function segmentosSeInterceptam(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  c: { lat: number; lng: number },
  d: { lat: number; lng: number },
): boolean {
  const o1 = orientacao(a, b, c);
  const o2 = orientacao(a, b, d);
  const o3 = orientacao(c, d, a);
  const o4 = orientacao(c, d, b);

  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    return true;
  }
  if (o1 === 0 && pontoNoSegmento(a, c, b)) return true;
  if (o2 === 0 && pontoNoSegmento(a, d, b)) return true;
  if (o3 === 0 && pontoNoSegmento(c, a, d)) return true;
  if (o4 === 0 && pontoNoSegmento(c, b, d)) return true;
  return false;
}

function pontoDentroDoPoligono(ponto: { lat: number; lng: number }, poligono: Array<{ lat: number; lng: number }>): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const xi = poligono[i].lng;
    const yi = poligono[i].lat;
    const xj = poligono[j].lng;
    const yj = poligono[j].lat;
    const cruza = (yi > ponto.lat) !== (yj > ponto.lat) && ponto.lng < ((xj - xi) * (ponto.lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Verifica se o segmento entre dois pontos cruza ou está contido em um polígono de risco. */
export function segmentoCruzaPoligono(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  poligono: Array<{ lat: number; lng: number }>,
  bboxPoligono?: BBoxMapa,
): boolean {
  if (poligono.length < 3) return false;

  const bboxSegmento: BBoxMapa = [
    Math.min(a.lng, b.lng),
    Math.min(a.lat, b.lat),
    Math.max(a.lng, b.lng),
    Math.max(a.lat, b.lat),
  ];
  const bboxPol = bboxPoligono ?? calcularBBoxPoligono(poligono);
  if (!bboxIntersecta(bboxSegmento, bboxPol)) return false;

  if (pontoDentroDoPoligono(a, poligono) || pontoDentroDoPoligono(b, poligono)) {
    return true;
  }

  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    if (segmentosSeInterceptam(a, b, poligono[j], poligono[i])) {
      return true;
    }
  }

  return false;
}
