import { z } from "@/lib/validacao";

// Leitura dos avisos meteorológicos do INMET (https://apiprevmet3.inmet.gov.br/avisos/ativos).
// Funções puras, sem banco nem rede, para testar com um retorno real gravado.
//
// Formato conferido em 17/11/2026: { hoje: Aviso[], futuro: Aviso[] }, ~550 KB,
// sem gzip, ETag nem CORS. Cada aviso cobre centenas ou milhares de municípios
// (campo `geocodes`, códigos IBGE separados por vírgula). `inicio` e `fim` vêm
// em hora de Brasília SEM fuso ("2026-11-17 09:00"); o CAP do mesmo aviso usa -03:00.

export const FONTE_INMET = "INMET";

export const SEVERIDADES_AVISO = ["MODERADA", "SEVERA", "EXTREMA"] as const;
export type SeveridadeAviso = (typeof SEVERIDADES_AVISO)[number];

/** Aviso pronto para gravar: só os campos que o WhereToGo usa. */
export interface AvisoNormalizado {
  /** id_aviso do INMET: estável entre atualizações do mesmo aviso. */
  idExterno: string;
  sequencia: number;
  identificadorCap: string;
  evento: string;
  severidade: SeveridadeAviso;
  /** Texto do INMET ("Perigo Potencial", "Perigo", "Grande Perigo"). */
  rotuloSeveridade: string;
  cor: string | null;
  inicio: Date;
  fim: Date;
  riscos: string[];
  instrucoes: string[];
  link: string;
  /** O INMET marcou o aviso como encerrado antes do fim previsto. */
  encerrado: boolean;
}

export interface LeituraAvisos {
  /** Avisos que incluem o município, um por id_aviso (a sequência mais recente). */
  avisos: AvisoNormalizado[];
  /** Avisos no retorno (todo o país). */
  total: number;
  /** Itens com formato inesperado, ignorados. */
  descartados: number;
}

/** O retorno inteiro não tem o formato esperado (mudança na API, página de erro...). */
export class ErroFormatoInmet extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroFormatoInmet";
  }
}

const esquemaItem = z.object({
  id: z.number().int().positive(),
  id_aviso: z.number().int().positive(),
  id_sequencia: z.number().int().min(0).nullish(),
  codigo: z.string().trim().min(1).max(120),
  descricao: z.string().trim().min(1).max(80),
  severidade: z.string().trim().min(1).max(40),
  aviso_cor: z.string().nullish(),
  inicio: z.string(),
  fim: z.string(),
  geocodes: z.string(),
  riscos: z.array(z.string()).nullish(),
  instrucoes: z.array(z.string()).nullish(),
  encerrado: z.boolean().nullish(),
});

const esquemaResposta = z.object({
  hoje: z.array(z.unknown()).default([]),
  futuro: z.array(z.unknown()).default([]),
});

const HORA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "2026-11-17 09:00" (hora de Brasília, sem fuso) -> Date. O Brasil não tem
 * horário de verão desde 2019, então o deslocamento é sempre -03:00.
 */
export function lerHoraDeBrasilia(texto: string): Date | null {
  const partes = HORA_LOCAL.exec(texto.trim());
  if (!partes) return null;
  const [, ano, mes, dia, hora, minuto, segundo = "00"] = partes;
  const data = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-03:00`);
  return Number.isNaN(data.getTime()) ? null : data;
}

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Severidade do INMET na escala CAP: "Perigo Potencial" (amarelo) = Moderate,
 * "Perigo" (laranja) = Severe, "Grande Perigo" (vermelho) = Extreme. Um rótulo
 * novo cai na faixa mais próxima pelo texto; o rótulo original segue para a tela.
 */
export function normalizarSeveridade(rotulo: string): SeveridadeAviso {
  const texto = semAcento(rotulo);
  if (texto.includes("grande")) return "EXTREMA";
  if (texto.includes("potencial")) return "MODERADA";
  if (texto.includes("perigo")) return "SEVERA";
  return "MODERADA";
}

const LIMITE_TEXTO = 600;
const LIMITE_ITENS = 10;

function limparLista(itens: string[] | null | undefined): string[] {
  return (itens ?? [])
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, LIMITE_ITENS)
    .map((item) => item.slice(0, LIMITE_TEXTO));
}

function incluiMunicipio(geocodes: string, codigoIbge: string): boolean {
  return geocodes.split(",").some((codigo) => codigo.trim() === codigoIbge);
}

/**
 * Lê o retorno de `avisos/ativos` e devolve os avisos do município. Um item com
 * formato inesperado é descartado sozinho; o retorno inteiro fora do formato
 * lança `ErroFormatoInmet` (conta como falha da integração).
 */
export function lerAvisosInmet(json: unknown, codigoIbge: string): LeituraAvisos {
  const resposta = esquemaResposta.safeParse(json);
  if (!resposta.success) throw new ErroFormatoInmet("Resposta do INMET fora do formato esperado ({ hoje, futuro }).");

  const itens = [...resposta.data.hoje, ...resposta.data.futuro];
  const porAviso = new Map<string, { idInmet: number; aviso: AvisoNormalizado }>();
  let descartados = 0;

  for (const bruto of itens) {
    const lido = esquemaItem.safeParse(bruto);
    const inicio = lido.success ? lerHoraDeBrasilia(lido.data.inicio) : null;
    const fim = lido.success ? lerHoraDeBrasilia(lido.data.fim) : null;
    if (!lido.success || !inicio || !fim || fim <= inicio) {
      descartados++;
      continue;
    }

    const item = lido.data;
    if (!incluiMunicipio(item.geocodes, codigoIbge)) continue;

    const aviso: AvisoNormalizado = {
      idExterno: String(item.id_aviso),
      sequencia: item.id_sequencia ?? 1,
      identificadorCap: item.codigo,
      evento: item.descricao,
      severidade: normalizarSeveridade(item.severidade),
      rotuloSeveridade: item.severidade,
      cor: item.aviso_cor && /^#[0-9A-Fa-f]{6}$/.test(item.aviso_cor) ? item.aviso_cor.toUpperCase() : null,
      inicio,
      fim,
      riscos: limparLista(item.riscos),
      instrucoes: limparLista(item.instrucoes),
      link: `https://avisos.inmet.gov.br/${item.id}`,
      encerrado: item.encerrado === true,
    };

    // O mesmo aviso pode vir mais de uma vez (nova sequência após uma alteração): fica a mais recente.
    const anterior = porAviso.get(aviso.idExterno);
    if (
      !anterior ||
      aviso.sequencia > anterior.aviso.sequencia ||
      (aviso.sequencia === anterior.aviso.sequencia && item.id > anterior.idInmet)
    ) {
      porAviso.set(aviso.idExterno, { idInmet: item.id, aviso });
    }
  }

  const avisos = [...porAviso.values()].map((entrada) => entrada.aviso);
  return { avisos, total: itens.length, descartados };
}

/** O maior retorno visto foi ~550 KB; acima disto algo está errado. */
const LIMITE_RESPOSTA_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8_000;

/** Baixa o JSON de avisos do INMET (timeout curto: quem chama nunca é o visitante). */
export async function baixarAvisosInmet(url: string): Promise<unknown> {
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "WhereToGo/1.0 (mapa de abrigos emergenciais)" },
  });
  if (!resposta.ok) throw new Error(`INMET respondeu HTTP ${resposta.status}.`);

  const texto = await resposta.text();
  if (texto.length > LIMITE_RESPOSTA_BYTES) throw new ErroFormatoInmet("Resposta do INMET maior que o esperado.");
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroFormatoInmet("Resposta do INMET não é um JSON válido.");
  }
}
