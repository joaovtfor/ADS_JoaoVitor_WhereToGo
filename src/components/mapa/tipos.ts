// Tipos, rótulos e regras de apresentação compartilhados pelo mapa público.

export type NivelOcupacaoPublico = "VERDE" | "AMARELO" | "VERMELHO";
export type StatusInfraPublico = "NORMAL" | "ALERTA" | "CRITICO";

export interface ItemNecessidadePublico {
  id: number;
  nome: string;
  categoria: string;
}

export interface OcupacaoPublica {
  capacidadeMaxima: number;
  lotacaoAtual: number;
  vagasDisponiveis: number;
  percentual: number;
  nivel: NivelOcupacaoPublico;
}

export interface AbrigoMapa {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  latitude: number;
  longitude: number;
  ocupacao: OcupacaoPublica;
  statusInfraestrutura: StatusInfraPublico;
  ocorrenciasAtivas: Array<{ tipo: string; gravidade: "ALERTA" | "CRITICO" }>;
  /** Dentro de uma área de risco ativa (PostGIS ST_Covers). */
  emAreaDeRisco: boolean;
  necessidades: {
    urgentes: ItemNecessidadePublico[];
    bloqueados: ItemNecessidadePublico[];
  };
  /** Precisa URGENTE do que o doador filtrou (null = sem filtro de doação). */
  destaque: boolean | null;
  distanciaKm: number | null;
  atualizadoEm: string;
}

export interface AlertaMapa {
  id: number;
  tipo: string;
  descricaoTipo: string;
  gravidade: "ALERTA" | "CRITICO";
  descricao: string | null;
  latitude: number;
  longitude: number;
  poligono?: Array<{ lat: number; lng: number }> | null;
  localizacaoPropria: boolean;
  dataRegistro: string;
  abrigo: { id: number; nome: string };
}

export interface CategoriaPublica {
  id: number;
  nome: string;
  slug: string;
  itens: Array<{ id: number; nome: string; unidadeMedida: string }>;
}

export interface DetalheAbrigoPublico {
  id: number;
  rotas: { googleMaps: string; waze: string };
  pix: { chave: string; titular: string | null; brCode: string } | null;
  ocorrenciasAtivas: Array<{
    id: number;
    tipo: string;
    descricao: string | null;
    poligono?: Array<{ lat: number; lng: number }> | null;
    dataRegistro: string;
  }>;
}

export type FiltroRapido = "TODOS" | "COM_VAGAS" | "INFRA_NORMAL" | "PRECISA_DOACOES" | "DESTAQUE";

export const PILULAS_FILTRO: ReadonlyArray<{ id: FiltroRapido; rotulo: string }> = [
  { id: "TODOS", rotulo: "Todos" },
  { id: "COM_VAGAS", rotulo: "🟢 Com vagas" },
  { id: "PRECISA_DOACOES", rotulo: "🚨 Precisa de doações" },
  { id: "INFRA_NORMAL", rotulo: "🛣️ Acesso normal" },
  { id: "DESTAQUE", rotulo: "⭐ Prioritários" },
];

export const ICONE_CATEGORIA: Record<string, string> = {
  agua: "💧",
  alimentos: "🍲",
  higiene: "🧼",
  medicamentos: "💊",
  roupas: "🧥",
  "cama-e-banho": "🛏️",
  infantil: "🍼",
  animais: "🐾",
};

export const ROTULO_OCORRENCIA: Record<string, string> = {
  AREA_RISCO: "Área de risco demarcada no entorno",
  SEM_ENERGIA: "Queda de energia elétrica",
  SEM_AGUA: "Interrupção no abastecimento de água",
  SEM_COMUNICACAO: "Sem internet ou telefone",
  VIA_BLOQUEADA: "Via de acesso interditada ou bloqueada",
  ALAGAMENTO: "Alagamento próximo ao abrigo",
  DESLIZAMENTO: "Risco de deslizamento de terra",
  RISCO_ESTRUTURAL: "Risco ou dano estrutural no local",
  OUTRO: "Alerta operacional no abrigo",
};

/** Semáforo de lotação (cor sempre acompanhada de símbolo e rótulo). */
export function obterEstiloNivel(nivel: NivelOcupacaoPublico) {
  if (nivel === "VERDE") {
    return {
      simbolo: "●",
      rotulo: "Livre",
      badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      barra: "bg-emerald-500",
    };
  }
  if (nivel === "AMARELO") {
    return {
      simbolo: "▲",
      rotulo: "Atenção",
      badge: "border-amber-500/40 bg-amber-500/15 text-amber-300",
      barra: "bg-amber-500",
    };
  }
  return {
    simbolo: "■",
    rotulo: "Lotado / Crítico",
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    barra: "bg-rose-500",
  };
}

export function obterEstiloInfra(status: StatusInfraPublico) {
  if (status === "CRITICO") {
    return { icone: "🚨", rotulo: "Acesso ou infraestrutura crítica", classe: "border-rose-500/40 bg-rose-500/15 text-rose-300" };
  }
  if (status === "ALERTA") {
    return { icone: "⚡", rotulo: "Atenção na infraestrutura", classe: "border-amber-500/40 bg-amber-500/15 text-amber-300" };
  }
  return { icone: "✅", rotulo: "Infraestrutura normal", classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
}

export function formatarHorario(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Texto de resumo para compartilhar (WhatsApp, área de transferência). */
export function resumoParaCompartilhar(abrigo: AbrigoMapa, link?: string): string {
  const urgentes =
    abrigo.necessidades.urgentes.length > 0
      ? `\n🚨 Precisa de: ${abrigo.necessidades.urgentes.map((i) => i.nome).join(", ")}`
      : "";
  const vagas = `${abrigo.ocupacao.vagasDisponiveis} (${abrigo.ocupacao.lotacaoAtual}/${abrigo.ocupacao.capacidadeMaxima})`;
  return `📍 *${abrigo.nome}*\n🏠 ${abrigo.endereco}\n🟢 Vagas livres: ${vagas}${urgentes}${link ? `\n🔗 Mapa ao vivo: ${link}` : ""}`;
}
