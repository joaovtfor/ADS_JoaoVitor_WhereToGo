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
  aceitaPets: boolean;
  acessivelPcd: boolean;
  ocorrenciasAtivas: Array<{ tipo: string; gravidade: "ALERTA" | "CRITICO" }>;
  /** Dentro de uma área de risco ativa (PostGIS ST_Covers). */
  emAreaDeRisco: boolean;
  /** Trajeto em linha reta entre o usuário e o abrigo cruza algum polígono de área de risco (PostGIS ST_Intersects). */
  rotaCruzaAreaRisco?: boolean;
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

export type FiltroRapido =
  | "TODOS"
  | "COM_VAGAS"
  | "INFRA_NORMAL"
  | "PRECISA_DOACOES"
  | "ACEITA_PETS"
  | "ACESSIVEL_PCD"
  | "DESTAQUE";

export const PILULAS_FILTRO: ReadonlyArray<{ id: FiltroRapido; rotulo: string }> = [
  { id: "TODOS", rotulo: "Todos" },
  { id: "COM_VAGAS", rotulo: "🟢 Com vagas" },
  { id: "PRECISA_DOACOES", rotulo: "🚨 Precisa de doações" },
  { id: "ACEITA_PETS", rotulo: "🐾 Aceita pets" },
  { id: "ACESSIVEL_PCD", rotulo: "♿ Acessível PCD" },
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

/**
 * Selo de atualização recente (Freshness Badge): indica a confiabilidade temporal
 * do último reporte de lotação/estoque do abrigo ou alerta.
 */
export function obterSeloAtualizacao(iso: string): { icone: string; rotulo: string; classe: string } {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0 || ms <= 2 * 60_000) {
    return {
      icone: "🟢",
      rotulo: "Atualizado agora",
      classe: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  const minutos = Math.round(ms / 60_000);
  if (minutos <= 30) {
    return {
      icone: "🟢",
      rotulo: `Há ${minutos} min`,
      classe: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  const horas = Math.max(1, Math.round(minutos / 60));
  if (horas <= 6) {
    return {
      icone: "🟡",
      rotulo: `Há ${horas}h`,
      classe: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    icone: "🟠",
    rotulo: horas < 24 ? `Há ${horas}h` : `Há ${Math.floor(horas / 24)}d`,
    classe: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  };
}

/** Texto de resumo para compartilhar (WhatsApp, área de transferência). */
export function resumoParaCompartilhar(abrigo: AbrigoMapa, link?: string): string {
  const urgentes =
    abrigo.necessidades.urgentes.length > 0
      ? `\n🚨 Precisa de: ${abrigo.necessidades.urgentes.map((i) => i.nome).join(", ")}`
      : "";
  const tags = [abrigo.aceitaPets ? "🐾 Aceita pets" : null, abrigo.acessivelPcd ? "♿ Acessível PCD" : null]
    .filter(Boolean)
    .join(" • ");
  const linhaTags = tags ? `\n✨ Perfil: ${tags}` : "";
  const vagas = `${abrigo.ocupacao.vagasDisponiveis} (${abrigo.ocupacao.lotacaoAtual}/${abrigo.ocupacao.capacidadeMaxima})`;
  return `📍 *${abrigo.nome}*\n🏠 ${abrigo.endereco}\n🟢 Vagas livres: ${vagas}${linhaTags}${urgentes}${link ? `\n🔗 Mapa ao vivo: ${link}` : ""}`;
}
