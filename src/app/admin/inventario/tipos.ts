// Tipos e rótulos da tela de Estoque.

import type { NivelStatus } from "@/components/ui/selo-status";

export type StatusNecessidade = "URGENTE" | "NORMAL" | "BLOQUEADO";

export interface ItemEstoque {
  idItem: number;
  nome: string;
  unidadeMedida: string;
  itemAtivo: boolean;
  idCategoria: number;
  categoria: string;
  categoriaSlug: string;
  quantidade: number;
  quantidadeMinima: number;
  statusNecessidade: StatusNecessidade;
  atualizadoEm: string | null;
  critico: boolean;
}

export interface MovimentacaoEstoque {
  id: number;
  tipo: string;
  quantidade: number;
  quantidadeResultante: number;
  dataHora: string;
  observacao: string | null;
  idItem: number;
  item: string;
  unidadeMedida: string;
  idUsuario: number;
  usuario: string;
  idAbrigoContraparte: number | null;
  abrigoContraparte: string | null;
  /** Já foi desfeita (existe um ESTORNO apontando para ela). */
  estornada: boolean;
}

export interface PaginaMovimentacoes {
  itens: MovimentacaoEstoque[];
  paginacao: { pagina: number; tamanho: number; total: number; totalPaginas: number };
}

/** Lançamento feito nesta sessão, que ainda pode ser desfeito com um toque. */
export interface ToqueRecente {
  uid: string;
  /** Movimentação gravada no servidor (o "Desfazer" estorna exatamente ela). */
  idMovimentacao: number;
  idItem: number;
  nomeItem: string;
  delta: number;
  horario: string;
  desfeito: boolean;
}

export interface RespostaMovimento {
  quantidadeAtual: number;
  statusNecessidade: StatusNecessidade;
  movimentacao: { id: number } | null;
}

/** Lançamento que não chegou ao servidor por falta de rede e espera reenvio. */
export interface MovimentoOffline {
  uid: string;
  idAbrigo: number;
  idItem: number;
  nomeItem: string;
  delta: number;
  corpo: Record<string, unknown>;
  criadoEm: string;
}

export interface FeedbackItem {
  pendentes: number;
  ultimoDelta: number | null;
}

export type ModoSaida = "SAIDA_CONSUMO" | "PERDA";
export type FiltroStatusEstoque = "TODOS" | "CRITICOS" | "URGENTE" | "BLOQUEADO" | "COM_SALDO";

export const MOTIVOS_LOTE = [
  "Chegada de caminhão de doações",
  "Remessa da Defesa Civil",
  "Distribuição coletiva no abrigo",
  "Montagem de kits familiares",
] as const;

export function abaixoDoMinimo(item: ItemEstoque): boolean {
  return item.quantidade < item.quantidadeMinima;
}

export function emAlerta(item: ItemEstoque): boolean {
  return item.statusNecessidade === "URGENTE" || abaixoDoMinimo(item);
}

/** Estado do item em uma palavra. `null` quando está tudo normal: linha normal não leva selo. */
export function statusDoItem(item: ItemEstoque): { nivel: NivelStatus; rotulo: string } | null {
  if (item.statusNecessidade === "URGENTE") return { nivel: "critico", rotulo: "Urgente" };
  if (item.statusNecessidade === "BLOQUEADO") return { nivel: "neutro", rotulo: "Doações bloqueadas" };
  if (abaixoDoMinimo(item)) return { nivel: "atencao", rotulo: "Abaixo do mínimo" };
  return null;
}

export function formatarDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
