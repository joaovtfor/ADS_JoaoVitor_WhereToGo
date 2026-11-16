// Rótulos em linguagem humana para códigos internos (DESIGN.md §1.1: a
// interface nunca mostra códigos de engenharia como ENTRADA_DOACAO).

export const ROTULO_TIPO_MOVIMENTACAO: Record<string, string> = {
  ENTRADA_DOACAO: "Entrada (doação)",
  SAIDA_CONSUMO: "Saída (consumo)",
  PERDA: "Perda / avaria",
  AJUSTE: "Ajuste de contagem",
  TRANSFERENCIA_ENTRADA: "Recebido de outro abrigo",
  TRANSFERENCIA_SAIDA: "Enviado a outro abrigo",
  ESTORNO: "Desfeito (estorno)",
};

export const ROTULO_PAPEL: Record<string, string> = {
  ADMIN: "Administração Geral",
  COORDENADOR: "Coordenador",
  VOLUNTARIO: "Voluntário",
};

export const ROTULO_STATUS_INFRA: Record<string, string> = {
  NORMAL: "Normal",
  ALERTA: "Alerta",
  CRITICO: "Crítico",
};

export const ROTULO_OCORRENCIA: Record<string, string> = {
  SEM_ENERGIA: "Sem energia elétrica",
  SEM_AGUA: "Sem abastecimento de água",
  SEM_COMUNICACAO: "Sem internet ou telefone",
  VIA_BLOQUEADA: "Via de acesso bloqueada",
  ALAGAMENTO: "Alagamento no entorno",
  DESLIZAMENTO: "Risco de deslizamento",
  RISCO_ESTRUTURAL: "Risco estrutural no prédio",
  AREA_RISCO: "Área de risco demarcada",
  OUTRO: "Outra ocorrência",
};

/** Nome da ocorrência em linguagem humana; nunca o código interno. */
export function rotuloOcorrencia(tipo: string): string {
  return ROTULO_OCORRENCIA[tipo] ?? "Ocorrência";
}

export const ROTULO_NECESSIDADE: Record<string, string> = {
  URGENTE: "Urgente",
  NORMAL: "Normal",
  BLOQUEADO: "Bloqueado",
};

export const ROTULO_GRAVIDADE: Record<string, string> = {
  ALERTA: "Alerta",
  CRITICO: "Crítico",
};
