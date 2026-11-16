// Tipos e regras da tela de Infraestrutura (ocorrências do abrigo).

import type { VerticePoligono } from "@/components/seletor-ponto-mapa";
import type { NivelStatus } from "@/components/ui/selo-status";
import { ROTULO_GRAVIDADE } from "../rotulos";

export type Gravidade = "ALERTA" | "CRITICO";

export interface Ocorrencia {
  id: number;
  idAbrigo: number;
  tipo: string;
  gravidade: Gravidade;
  statusValidacao?: "PENDENTE" | "APROVADA" | "REJEITADA";
  relatorNome?: string | null;
  relatorContato?: string | null;
  origemCidada?: boolean;
  descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  poligono: VerticePoligono[] | null;
  dataRegistro: string;
  dataResolucao: string | null;
  registradoPor: string;
  resolvidoPor: string | null;
}

/** Tipos que a coordenação pode registrar, com a gravidade que costuma valer para cada um. */
export const TIPOS_OCORRENCIA: ReadonlyArray<{ tipo: string; gravidadePadrao: Gravidade }> = [
  { tipo: "VIA_BLOQUEADA", gravidadePadrao: "CRITICO" },
  { tipo: "AREA_RISCO", gravidadePadrao: "CRITICO" },
  { tipo: "ALAGAMENTO", gravidadePadrao: "CRITICO" },
  { tipo: "DESLIZAMENTO", gravidadePadrao: "CRITICO" },
  { tipo: "RISCO_ESTRUTURAL", gravidadePadrao: "CRITICO" },
  { tipo: "SEM_ENERGIA", gravidadePadrao: "ALERTA" },
  { tipo: "SEM_AGUA", gravidadePadrao: "ALERTA" },
  { tipo: "SEM_COMUNICACAO", gravidadePadrao: "ALERTA" },
  { tipo: "OUTRO", gravidadePadrao: "ALERTA" },
];

export function estaPendente(ocorrencia: Ocorrencia): boolean {
  return ocorrencia.statusValidacao === "PENDENTE" && !ocorrencia.dataResolucao;
}

export function estaAtiva(ocorrencia: Ocorrencia): boolean {
  return !ocorrencia.dataResolucao && ocorrencia.statusValidacao !== "REJEITADA";
}

/** Em que pé está a ocorrência, em uma palavra. */
export function statusDaOcorrencia(ocorrencia: Ocorrencia): { nivel: NivelStatus; rotulo: string } {
  if (ocorrencia.statusValidacao === "REJEITADA") return { nivel: "neutro", rotulo: "Descartada" };
  if (estaPendente(ocorrencia)) return { nivel: "neutro", rotulo: "Aguardando revisão" };
  if (!estaAtiva(ocorrencia)) return { nivel: "ok", rotulo: "Resolvida" };
  return { nivel: ocorrencia.gravidade === "CRITICO" ? "critico" : "atencao", rotulo: ROTULO_GRAVIDADE[ocorrencia.gravidade] };
}

/**
 * As bordas do contorno, na ordem em que os pontos foram marcados, se cruzam
 * (ex.: cantos clicados em "Z")? Ao publicar, o servidor liga os pontos em
 * volta do centro; aqui só avisamos para a prévia não confundir.
 */
export function bordasSeCruzam(pontos: VerticePoligono[]): boolean {
  const n = pontos.length;
  if (n < 4) return false;
  const lado = (a: VerticePoligono, b: VerticePoligono, c: VerticePoligono) =>
    Math.sign((b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng));
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // arestas vizinhas pelo fechamento do anel
      const [a, b, c, d] = [pontos[i], pontos[(i + 1) % n], pontos[j], pontos[(j + 1) % n]];
      if (lado(a, b, c) * lado(a, b, d) < 0 && lado(c, d, a) * lado(c, d, b) < 0) return true;
    }
  }
  return false;
}
