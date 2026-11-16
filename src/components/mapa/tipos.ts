// Tipos, rótulos e regras de apresentação compartilhados pelo mapa público.

import { Accessibility, Baby, BedDouble, Droplets, HeartHandshake, Package, PawPrint, Pill, Shirt, SprayCan, Utensils, type LucideIcon } from "lucide-react";
import type { NivelStatus } from "@/components/ui/selo-status";

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

export interface OpcaoFiltroRapido {
  id: FiltroRapido;
  rotulo: string;
  /** Versão curta para o atalho no celular. */
  rotuloCurto: string;
  icone?: LucideIcon;
}

/** Filtros de abrigo, na ordem em que aparecem no painel de filtros. */
export const FILTROS_RAPIDOS: ReadonlyArray<OpcaoFiltroRapido> = [
  { id: "COM_VAGAS", rotulo: "Com vagas", rotuloCurto: "Com vagas" },
  { id: "ACEITA_PETS", rotulo: "Aceita pets", rotuloCurto: "Pets", icone: PawPrint },
  { id: "PRECISA_DOACOES", rotulo: "Precisa de doações", rotuloCurto: "Doações", icone: HeartHandshake },
  { id: "ACESSIVEL_PCD", rotulo: "Acessível", rotuloCurto: "Acessível", icone: Accessibility },
  { id: "INFRA_NORMAL", rotulo: "Sem alertas de acesso", rotuloCurto: "Sem alertas" },
];

/** Os três filtros mais usados ficam visíveis como atalho; o resto fica no painel (DESIGN.md §5.1). */
export const ATALHOS_FILTRO: ReadonlyArray<OpcaoFiltroRapido> = FILTROS_RAPIDOS.slice(0, 3);

const ICONE_POR_CATEGORIA: Record<string, LucideIcon> = {
  agua: Droplets,
  alimentos: Utensils,
  higiene: SprayCan,
  medicamentos: Pill,
  roupas: Shirt,
  "cama-e-banho": BedDouble,
  infantil: Baby,
  animais: PawPrint,
};

export function obterIconeCategoria(slug: string): LucideIcon {
  return ICONE_POR_CATEGORIA[slug] ?? Package;
}

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

export interface StatusApresentacao {
  nivel: NivelStatus;
  rotulo: string;
}

/** Estado de lotação: a cor vem do nível; o rótulo diz o mesmo em texto. */
export function obterStatusOcupacao(ocupacao: OcupacaoPublica): StatusApresentacao {
  if (ocupacao.nivel === "VERDE") return { nivel: "ok", rotulo: "Com vagas" };
  if (ocupacao.nivel === "AMARELO") return { nivel: "atencao", rotulo: "Quase cheio" };
  return { nivel: "critico", rotulo: ocupacao.vagasDisponiveis > 0 ? "Últimas vagas" : "Lotado" };
}

export function obterStatusInfra(status: StatusInfraPublico): StatusApresentacao {
  if (status === "CRITICO") return { nivel: "critico", rotulo: "Acesso ou infraestrutura crítica" };
  if (status === "ALERTA") return { nivel: "atencao", rotulo: "Atenção na infraestrutura" };
  return { nivel: "ok", rotulo: "Infraestrutura normal" };
}

export function obterStatusGravidade(gravidade: "ALERTA" | "CRITICO"): StatusApresentacao {
  return gravidade === "CRITICO" ? { nivel: "critico", rotulo: "Crítico" } : { nivel: "atencao", rotulo: "Alerta" };
}

export function formatarHorario(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Há quanto tempo o dado foi atualizado. `desatualizado` (mais de 6 h) é o
 * único caso que merece destaque: vagas e alertas podem ter mudado.
 */
export function obterSeloAtualizacao(iso: string): { rotulo: string; desatualizado: boolean } {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms <= 2 * 60_000) return { rotulo: "Atualizado agora", desatualizado: false };
  const minutos = Math.round(ms / 60_000);
  if (minutos <= 30) return { rotulo: `Há ${minutos} min`, desatualizado: false };
  const horas = Math.max(1, Math.round(minutos / 60));
  return { rotulo: horas < 24 ? `Há ${horas} h` : `Há ${Math.floor(horas / 24)} d`, desatualizado: horas > 6 };
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
