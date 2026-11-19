// Tipos da Visão Geral (resposta de /api/abrigos/:id/dashboard).

import type { NivelOcupacao, StatusInfraestrutura } from "../contexto-admin";

export type StatusNecessidade = "URGENTE" | "NORMAL" | "BLOQUEADO";

export interface SugestaoTransferencia {
  direcao: "RECEBER" | "ENVIAR";
  idItem: number;
  item: string;
  unidadeMedida: string;
  categoria: string;
  idAbrigoParceiro: number;
  abrigoParceiro: string;
  telefoneParceiro: string | null;
  distanciaKm: number;
  quantidadeAtual: number;
  quantidadeParceiro: number;
  quantidadeSugerida: number;
  /** O trajeto em linha reta até o parceiro cruza uma área de risco ativa (vem por último na lista). */
  rotaBloqueada?: boolean;
}

export interface OcorrenciaAtiva {
  id: number;
  tipo: string;
  gravidade: "ALERTA" | "CRITICO";
  descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  dataRegistro: string;
}

export interface ItemCritico {
  idItem: number;
  nome: string;
  unidadeMedida: string;
  categoria: string;
  quantidade: number;
  quantidadeMinima: number;
  statusNecessidade: StatusNecessidade;
  motivo: "URGENTE" | "ABAIXO_DO_MINIMO";
}

export interface MovimentacaoRecente {
  id: number;
  tipo: string;
  quantidade: number;
  quantidadeResultante: number;
  dataHora: string;
  item: string;
  usuario: string;
}

export interface Ocupacao {
  capacidadeMaxima: number;
  lotacaoAtual: number;
  vagasDisponiveis: number;
  percentual: number;
  nivel: NivelOcupacao;
}

export interface FluxoAcolhidos {
  presentes: number;
  naoTriados: number;
  entradas24h: number;
  desligados24h: number;
  recebidas24h: number;
  enviadas24h: number;
}

export interface DadosDashboard {
  abrigo: {
    id: number;
    nome: string;
    ativo: boolean;
    statusInfraestrutura: StatusInfraestrutura;
    aceitaPets?: boolean;
    acessivelPcd?: boolean;
  };
  ocupacao: Ocupacao;
  acolhidos: FluxoAcolhidos;
  estoque: {
    itensEmEstoque: number;
    itensUrgentes: number;
    itensBloqueados: number;
    itensCriticos: ItemCritico[];
  };
  sugestoesTransferencia?: SugestaoTransferencia[];
  reportesPendentes?: number;
  ocorrenciasAtivas: OcorrenciaAtiva[];
  ultimasMovimentacoes: MovimentacaoRecente[];
}

/** Tipos de alerta que podem ser ligados e desligados com um toque. */
export const ALERTAS_RAPIDOS = [
  { tipo: "SEM_ENERGIA", rotulo: "Sem energia" },
  { tipo: "SEM_AGUA", rotulo: "Sem água" },
  { tipo: "SEM_COMUNICACAO", rotulo: "Sem sinal" },
  { tipo: "VIA_BLOQUEADA", rotulo: "Via bloqueada" },
  { tipo: "ALAGAMENTO", rotulo: "Alagamento" },
  { tipo: "DESLIZAMENTO", rotulo: "Deslizamento" },
  { tipo: "RISCO_ESTRUTURAL", rotulo: "Risco no prédio" },
] as const;
