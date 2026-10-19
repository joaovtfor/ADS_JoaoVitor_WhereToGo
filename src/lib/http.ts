import { connection, type NextRequest } from "next/server";
import { z } from "./validacao";

/** Erro de negócio/HTTP com código estável para o frontend. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

export const erros = {
  requisicaoInvalida: (mensagem: string, detalhes?: unknown) =>
    new ErroApi(400, "REQUISICAO_INVALIDA", mensagem, detalhes),
  naoAutenticado: (mensagem = "Autenticação necessária.") => new ErroApi(401, "NAO_AUTENTICADO", mensagem),
  semPermissao: (mensagem = "Você não tem permissão para executar esta ação.") =>
    new ErroApi(403, "SEM_PERMISSAO", mensagem),
  naoEncontrado: (recurso: string) => new ErroApi(404, "NAO_ENCONTRADO", `${recurso} não encontrado(a).`),
  conflito: (codigo: string, mensagem: string, detalhes?: unknown) => new ErroApi(409, codigo, mensagem, detalhes),
  regraDeNegocio: (codigo: string, mensagem: string, detalhes?: unknown) =>
    new ErroApi(422, codigo, mensagem, detalhes),
  muitasTentativas: (mensagem: string) => new ErroApi(429, "MUITAS_TENTATIVAS", mensagem),
};

// -----------------------------------------------------------------------------
// Respostas
// -----------------------------------------------------------------------------

/** Envelope padrão de sucesso: `{ "dados": ... }`. */
export function responder(dados: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json({ dados }, { status, headers });
}

export function semConteudo(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers });
}

function responderErro(erro: ErroApi): Response {
  return Response.json(
    { erro: { codigo: erro.codigo, mensagem: erro.message, ...(erro.detalhes ? { detalhes: erro.detalhes } : {}) } },
    { status: erro.status },
  );
}

// -----------------------------------------------------------------------------
// Tradução de erros do PostgreSQL em erros de negócio
// -----------------------------------------------------------------------------

interface ErroPostgres {
  code: string;
  constraint?: string;
  message: string;
}

function ehErroPostgres(erro: unknown): erro is ErroPostgres {
  return typeof erro === "object" && erro !== null && typeof (erro as ErroPostgres).code === "string" && "severity" in erro;
}

const MENSAGENS_UNICIDADE: Record<string, [codigo: string, mensagem: string]> = {
  usuario_email_uk: ["EMAIL_EM_USO", "Já existe um usuário com este e-mail."],
  usuario_google_sub_uk: ["GOOGLE_SUB_EM_USO", "Esta conta Google já está vinculada a outro usuário."],
  abrigado_cpf_uk: ["CPF_JA_CADASTRADO", "Já existe um abrigado com este CPF."],
  abrigado_cpf_presente_uk: ["ABRIGADO_JA_PRESENTE", "Esta pessoa (CPF) já está registrada como presente em um abrigo."],
  item_nome_uk: ["ITEM_DUPLICADO", "Já existe um item com este nome."],
  categoria_item_nome_uk: ["CATEGORIA_DUPLICADA", "Já existe uma categoria com este nome."],
  categoria_item_slug_uk: ["CATEGORIA_DUPLICADA", "Já existe uma categoria com este slug."],
  ocorrencia_infraestrutura_ativa_uk: [
    "OCORRENCIA_JA_ATIVA",
    "Já existe uma ocorrência ativa deste tipo para o abrigo. Resolva-a antes de registrar outra.",
  ],
};

const MENSAGENS_CHECK: Record<string, [status: number, codigo: string, mensagem: string]> = {
  estoque_abrigo_quantidade_ck: [
    409,
    "ESTOQUE_INSUFICIENTE",
    "Quantidade em estoque insuficiente: o estoque não pode ficar negativo.",
  ],
  movimentacao_estoque_resultante_ck: [
    409,
    "ESTOQUE_INSUFICIENTE",
    "Quantidade em estoque insuficiente: o estoque não pode ficar negativo.",
  ],
  abrigo_lotacao_ck: [409, "LOTACAO_INVALIDA", "A lotação do abrigo não pode ficar negativa."],
  abrigo_nao_triados_ck: [409, "NAO_TRIADOS_INVALIDO", "O contador de acolhidos não triados não pode ficar negativo."],
};

export function traduzirErroBanco(erro: unknown): ErroApi | null {
  if (!ehErroPostgres(erro)) return null;

  switch (erro.code) {
    case "23505": {
      const [codigo, mensagem] = MENSAGENS_UNICIDADE[erro.constraint ?? ""] ?? [
        "REGISTRO_DUPLICADO",
        "Registro duplicado.",
      ];
      return erros.conflito(codigo, mensagem);
    }
    case "23514": {
      const mapeado = MENSAGENS_CHECK[erro.constraint ?? ""];
      if (mapeado) return new ErroApi(mapeado[0], mapeado[1], mapeado[2]);
      return erros.regraDeNegocio("VIOLACAO_DE_REGRA", `Dados violam uma regra do banco (${erro.constraint}).`);
    }
    case "23503":
      return erros.regraDeNegocio("REFERENCIA_INVALIDA", "Registro relacionado inexistente ou ainda em uso.");
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
      return erros.requisicaoInvalida("Valor em formato inválido.");
    case "WTG01":
      return erros.conflito("REGISTRO_IMUTAVEL", erro.message);
    case "WTG02":
      return erros.regraDeNegocio("VINCULO_INVALIDO", erro.message);
    case "WTG03":
      return erros.conflito("TRANSFERENCIA_INVALIDA", erro.message);
    default:
      return null;
  }
}

/** Converte qualquer erro lançado em um `ErroApi` (desconhecidos viram 500). */
export function normalizarErro(erro: unknown): ErroApi {
  if (erro instanceof ErroApi) return erro;
  const doBanco = traduzirErroBanco(erro);
  if (doBanco) return doBanco;
  console.error("[api] erro não tratado", erro);
  return new ErroApi(500, "ERRO_INTERNO", "Erro interno no servidor.");
}

// -----------------------------------------------------------------------------
// Wrapper de Route Handlers
// -----------------------------------------------------------------------------

type ContextoRota<P> = { params: Promise<P> };

/**
 * Envolve um Route Handler: garante execução no momento da requisição (nunca
 * pré-renderizado no build com Cache Components) e converte erros no envelope
 * `{ "erro": { codigo, mensagem, detalhes? } }`.
 */
export function rota<P extends Record<string, string> = Record<string, string>>(
  handler: (req: NextRequest, contexto: ContextoRota<P>) => Promise<Response>,
) {
  return async (req: NextRequest, contexto: ContextoRota<P>): Promise<Response> => {
    // Fora do try: no build, `connection()` rejeita de propósito para o Next
    // interromper a pré-renderização - essa rejeição precisa chegar ao Next.
    await connection();
    try {
      return await handler(req, contexto);
    } catch (erro) {
      return responderErro(normalizarErro(erro));
    }
  };
}

// -----------------------------------------------------------------------------
// Leitura e validação da entrada
// -----------------------------------------------------------------------------

function formatarIssues(erro: z.ZodError) {
  return erro.issues.map((issue) => ({ campo: issue.path.join(".") || null, mensagem: issue.message }));
}

export function validar<S extends z.ZodType>(schema: S, dados: unknown): z.infer<S> {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) throw erros.requisicaoInvalida("Dados inválidos.", formatarIssues(resultado.error));
  return resultado.data;
}

export async function lerCorpo<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const contentType = req.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw erros.requisicaoInvalida("Cabeçalho Content-Type deve ser application/json.");
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw erros.requisicaoInvalida("O corpo da requisição deve ser um JSON válido.");
  }
  return validar(schema, json);
}

export function lerQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  return validar(schema, Object.fromEntries(req.nextUrl.searchParams));
}

export async function lerParametros<S extends z.ZodType>(
  contexto: ContextoRota<Record<string, string>>,
  schema: S,
): Promise<z.infer<S>> {
  const params = await contexto.params;
  const resultado = schema.safeParse(params);
  if (!resultado.success) throw erros.requisicaoInvalida("Parâmetros de rota inválidos.", formatarIssues(resultado.error));
  return resultado.data;
}

// -----------------------------------------------------------------------------
// Requisição
// -----------------------------------------------------------------------------

/**
 * IP de origem. Atrás de proxy reverso (Apache/.htaccess, Vercel, Render) o IP
 * real vem em X-Forwarded-For; o primeiro valor é o cliente original.
 */
export function obterIp(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = encaminhado || req.headers.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 45) : null;
}
