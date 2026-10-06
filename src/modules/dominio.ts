// Domínios de valores do sistema (espelham os CHECKs/tabelas de referência do banco).

export const STATUS_NECESSIDADE = ["URGENTE", "NORMAL", "BLOQUEADO"] as const;
export type StatusNecessidade = (typeof STATUS_NECESSIDADE)[number];

export const TIPOS_MOVIMENTACAO = [
  "ENTRADA_DOACAO",
  "SAIDA_CONSUMO",
  "PERDA",
  "TRANSFERENCIA_ENTRADA",
  "TRANSFERENCIA_SAIDA",
  "AJUSTE",
] as const;
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

/** Tipos aceitos no endpoint de movimentação; transferências têm endpoint próprio. */
export const TIPOS_MOVIMENTACAO_MANUAL = ["ENTRADA_DOACAO", "SAIDA_CONSUMO", "PERDA", "AJUSTE"] as const;
export type TipoMovimentacaoManual = (typeof TIPOS_MOVIMENTACAO_MANUAL)[number];

export const DESCRICAO_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  ENTRADA_DOACAO: "Entrada por doação",
  SAIDA_CONSUMO: "Saída por consumo/distribuição",
  PERDA: "Perda (avaria, vencimento, extravio)",
  TRANSFERENCIA_ENTRADA: "Entrada por transferência de outro abrigo",
  TRANSFERENCIA_SAIDA: "Saída por transferência para outro abrigo",
  AJUSTE: "Ajuste de inventário (contagem física)",
};

export const TIPOS_OCORRENCIA = [
  "SEM_ENERGIA",
  "SEM_AGUA",
  "SEM_COMUNICACAO",
  "VIA_BLOQUEADA",
  "ALAGAMENTO",
  "DESLIZAMENTO",
  "RISCO_ESTRUTURAL",
  "OUTRO",
] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

export const GRAVIDADES = ["ALERTA", "CRITICO"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export const DESCRICAO_TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  SEM_ENERGIA: "Sem energia elétrica",
  SEM_AGUA: "Abastecimento de água interrompido",
  SEM_COMUNICACAO: "Sem telefone/internet",
  VIA_BLOQUEADA: "Via de acesso colapsada ou bloqueada",
  ALAGAMENTO: "Alagamento no acesso ou no abrigo",
  DESLIZAMENTO: "Deslizamento de terra próximo",
  RISCO_ESTRUTURAL: "Risco estrutural na edificação",
  OUTRO: "Outra ocorrência",
};

/** Gravidade sugerida por tipo (o coordenador pode informar outra). */
export const GRAVIDADE_PADRAO: Record<TipoOcorrencia, Gravidade> = {
  SEM_ENERGIA: "ALERTA",
  SEM_AGUA: "ALERTA",
  SEM_COMUNICACAO: "ALERTA",
  VIA_BLOQUEADA: "CRITICO",
  ALAGAMENTO: "CRITICO",
  DESLIZAMENTO: "CRITICO",
  RISCO_ESTRUTURAL: "CRITICO",
  OUTRO: "ALERTA",
};

export const STATUS_INFRAESTRUTURA = ["NORMAL", "ALERTA", "CRITICO"] as const;
export type StatusInfraestrutura = (typeof STATUS_INFRAESTRUTURA)[number];

export const STATUS_ACOLHIMENTO = ["PRESENTE", "DESLIGADO"] as const;
export type StatusAcolhimento = (typeof STATUS_ACOLHIMENTO)[number];
