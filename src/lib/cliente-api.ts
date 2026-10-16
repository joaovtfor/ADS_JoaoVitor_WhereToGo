"use client";

export interface DetalheErroApi {
  campo: string | null;
  mensagem: string;
}

export class ErroClienteApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: DetalheErroApi[],
  ) {
    super(mensagem);
    this.name = "ErroClienteApi";
  }
}

/**
 * Cliente HTTP para o painel administrativo. Envia cookies de sessão (`wtg_sessao`),
 * aplica `Content-Type: application/json` automaticamente quando há corpo e
 * desembrulha o envelope `{ dados }` (ou lança `ErroClienteApi` com `{ erro }`).
 */
export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const headers = new Headers(opcoes.headers);
  if (opcoes.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const resposta = await fetch(caminho, {
    ...opcoes,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (resposta.status === 204) {
    return undefined as T;
  }

  let json: { dados?: T; erro?: { codigo?: string; mensagem?: string; detalhes?: DetalheErroApi[] } } | null = null;
  try {
    json = await resposta.json();
  } catch {
    json = null;
  }

  if (!resposta.ok) {
    const codigo = json?.erro?.codigo ?? "ERRO_HTTP";
    const mensagem = json?.erro?.mensagem ?? `Falha na comunicação com o servidor (HTTP ${resposta.status}).`;
    const detalhes = Array.isArray(json?.erro?.detalhes) ? json.erro.detalhes : undefined;
    throw new ErroClienteApi(resposta.status, codigo, mensagem, detalhes);
  }

  return (json && "dados" in json ? json.dados : json) as T;
}

export function mensagemErro(erro: unknown): string {
  if (erro instanceof ErroClienteApi) {
    if (erro.detalhes?.length) {
      return `${erro.message} (${erro.detalhes.map((d) => (d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem)).join("; ")})`;
    }
    return erro.message;
  }
  if (erro instanceof Error) return erro.message;
  return "Ocorreu um erro inesperado.";
}
