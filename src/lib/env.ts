import { z } from "zod";

const esquemaEnv = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não definida"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().min(1).default("8h"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // O dashboard abre 6 consultas em paralelo: com 10 conexões, poucas abas
  // abertas esgotavam o pool e as requisições caíam em timeout.
  DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
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
