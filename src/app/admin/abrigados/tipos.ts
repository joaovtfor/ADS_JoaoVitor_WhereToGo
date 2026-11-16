// Tipos e formatação da tela de Acolhidos.

export interface Abrigado {
  id: number;
  idAbrigoAtual: number;
  abrigoAtual: string;
  nomeCompleto: string;
  cpf: string | null;
  dataNascimento: string | null;
  dataEntrada: string;
  dataSaida: string | null;
  statusAcolhimento: "PRESENTE" | "DESLIGADO";
}

export interface PaginaAbrigados {
  itens: Abrigado[];
  paginacao: { pagina: number; tamanho: number; total: number; totalPaginas: number };
}

export interface TransferenciaHistorico {
  id: number;
  dataTransferencia: string;
  motivo: string;
  idAbrigoOrigem: number;
  abrigoOrigem: string;
  idAbrigoDestino: number;
  abrigoDestino: string;
  usuario: string;
}

export type FiltroAcolhimento = "PRESENTE" | "DESLIGADO" | "TODOS";

export const MOTIVOS_SAIDA = ["Retorno para residência", "Acolhido por familiares", "Encaminhamento hospitalar ou social"] as const;

export function formatarCpf(cpf: string | null): string {
  if (!cpf) return "Sem documento";
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** "2019-03-07" -> "07/03/2019", sem passar por Date (evita trocar o dia por fuso horário). */
export function formatarNascimento(data: string): string {
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

export function formatarMomento(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
