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
