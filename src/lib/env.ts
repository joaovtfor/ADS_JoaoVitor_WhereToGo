import { z } from "zod";

const esquemaEnv = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não definida"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().min(1).default("8h"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // O dashboard abre 6 consultas em paralelo: com 10 conexões, poucas abas
  // abertas esgotavam o pool e as requisições caíam em timeout.
  DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
  // Em bancos PostgreSQL gerenciados na nuvem (Render, Neon, Supabase, RDS),
  // defina DATABASE_SSL=true (ou no-verify para certificados autoassinados).
  DATABASE_SSL: z.enum(["false", "true", "require", "no-verify"]).default("false"),

  // Avisos meteorológicos do INMET (.specs/plano-integracao-defesa-civil.md §4.1).
  // Ligado por padrão: o MVP atende Passo Fundo. "false" para de consultar o
  // INMET; os avisos já salvos continuam no mapa até vencer.
  INTEGRACAO_AVISOS_INMET: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((valor) => valor === "true" || valor === "1"),
  /** Município dos avisos (código IBGE de 7 dígitos). 4314100 = Passo Fundo/RS. */
  MUNICIPIO_CODIGO_IBGE: z.string().regex(/^\d{7}$/, "MUNICIPIO_CODIGO_IBGE deve ter 7 dígitos").default("4314100"),
  /** Intervalo mínimo entre consultas ao INMET, em minutos. */
  INTERVALO_AVISOS_MIN: z.coerce.number().int().min(5).max(180).default(10),
  INMET_AVISOS_URL: z.url().default("https://apiprevmet3.inmet.gov.br/avisos/ativos"),

  // Mapa público em tempo real (SSE, /api/public/mapa/eventos). "false" desliga:
  // o mapa volta a consultar /api/public/mapa a cada 30 s a 2 min, com a CDN na
  // frente. Chave de segurança para a cota da Vercel (vale no próximo deploy).
  MAPA_TEMPO_REAL: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((valor) => valor === "true" || valor === "1"),
});

export type Env = z.infer<typeof esquemaEnv>;

let envValidado: Env | null = null;

/**
 * Variáveis de ambiente validadas. A validação é preguiçosa (no primeiro uso)
 * para não quebrar o `next build`, que importa as rotas sem acesso ao banco.
 */
export function env(): Env {
  if (!envValidado) {
    const resultado = esquemaEnv.safeParse(process.env);
    if (!resultado.success) {
      const problemas = resultado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Variáveis de ambiente inválidas: ${problemas}`);
    }
    envValidado = resultado.data;
  }
  return envValidado;
}
