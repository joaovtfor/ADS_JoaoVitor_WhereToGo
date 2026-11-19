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
  "ESTORNO",
] as const;
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

/** Tipos aceitos no endpoint de movimentação; transferências e estornos têm endpoints próprios. */
export const TIPOS_MOVIMENTACAO_MANUAL = ["ENTRADA_DOACAO", "SAIDA_CONSUMO", "PERDA", "AJUSTE"] as const;
export type TipoMovimentacaoManual = (typeof TIPOS_MOVIMENTACAO_MANUAL)[number];

/** Tipos que o "Desfazer" do Fast-CRUD pode estornar. */
export const TIPOS_MOVIMENTACAO_ESTORNAVEIS = ["ENTRADA_DOACAO", "SAIDA_CONSUMO", "PERDA"] as const;

export const DESCRICAO_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  ENTRADA_DOACAO: "Entrada por doação",
  SAIDA_CONSUMO: "Saída por consumo/distribuição",
  PERDA: "Perda (avaria, vencimento, extravio)",
  TRANSFERENCIA_ENTRADA: "Entrada por transferência de outro abrigo",
  TRANSFERENCIA_SAIDA: "Saída por transferência para outro abrigo",
  AJUSTE: "Ajuste de inventário (contagem física)",
  ESTORNO: "Estorno de lançamento (desfazer)",
};

export const TIPOS_OCORRENCIA = [
  "SEM_ENERGIA",
  "SEM_AGUA",
  "SEM_COMUNICACAO",
  "VIA_BLOQUEADA",
  "ALAGAMENTO",
  "DESLIZAMENTO",
  "RISCO_ESTRUTURAL",
  "AREA_RISCO",
  "OUTRO",
] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

/**
 * Tipos que podem ser registrados como ocorrência regional (sem abrigo): dizem
 * respeito ao território. Falta de energia/água/comunicação e risco estrutural
 * são da edificação e exigem um abrigo. Espelha `ocorrencia_infraestrutura_regional_ck`.
 */
export const TIPOS_OCORRENCIA_REGIONAL = ["VIA_BLOQUEADA", "AREA_RISCO", "ALAGAMENTO", "DESLIZAMENTO", "OUTRO"] as const satisfies readonly TipoOcorrencia[];
export type TipoOcorrenciaRegional = (typeof TIPOS_OCORRENCIA_REGIONAL)[number];

/** Rótulo de uma ocorrência regional: sem "no abrigo", que não se aplica ao território. */
export const DESCRICAO_TIPO_OCORRENCIA_REGIONAL: Record<TipoOcorrenciaRegional, string> = {
  VIA_BLOQUEADA: "Via interditada",
  AREA_RISCO: "Área de risco",
  ALAGAMENTO: "Alagamento",
  DESLIZAMENTO: "Deslizamento de terra",
  OUTRO: "Ocorrência no município",
};

/**
 * Onde cada tipo de ocorrência ajuda no FIDE (Etapa 4). O COBRADE classifica o
 * evento; as ocorrências são danos e prejuízos dele. Falta de energia, água,
 * comunicação e via bloqueada correspondem aos serviços essenciais dos
 * "prejuízos econômicos públicos" do formulário. É uma sugestão para quem
 * preenche: confirmar no formulário vigente do S2iD.
 */
export const CAMPO_FIDE_POR_TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  SEM_ENERGIA: "Prejuízos públicos: geração e distribuição de energia elétrica",
  SEM_AGUA: "Prejuízos públicos: abastecimento de água potável",
  SEM_COMUNICACAO: "Prejuízos públicos: telecomunicações",
  VIA_BLOQUEADA: "Prejuízos públicos: transportes locais, regionais e de longo curso",
  RISCO_ESTRUTURAL: "Danos materiais: instalações públicas usadas como abrigo",
  ALAGAMENTO: "Caracterização do evento e das áreas afetadas",
  DESLIZAMENTO: "Caracterização do evento e das áreas afetadas",
  AREA_RISCO: "Caracterização do evento e das áreas afetadas",
  OUTRO: "A classificar pela Defesa Civil",
};

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
  AREA_RISCO: "Área de risco demarcada no entorno",
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
  AREA_RISCO: "CRITICO",
  OUTRO: "ALERTA",
};

export const STATUS_INFRAESTRUTURA = ["NORMAL", "ALERTA", "CRITICO"] as const;
export type StatusInfraestrutura = (typeof STATUS_INFRAESTRUTURA)[number];

export const STATUS_ACOLHIMENTO = ["PRESENTE", "DESLIGADO"] as const;
export type StatusAcolhimento = (typeof STATUS_ACOLHIMENTO)[number];
