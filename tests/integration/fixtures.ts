import { randomUUID } from "node:crypto";
import type { Contexto, Papel } from "@/lib/auth/rbac";
import { gerarHashSenha } from "@/lib/auth/senha";
import { aguardarAuditoriasPendentes } from "@/lib/auditoria";
import { consultar, consultarUm } from "@/lib/db";
import { erros, normalizarErro, type ErroApi } from "@/lib/http";

export const SENHA_TESTE = "SenhaDeTeste@123";
let hashSenhaTeste: Promise<string> | null = null;

const sufixo = () => randomUUID().slice(0, 8);

export async function criarAbrigo(dados: Partial<{ nome: string; capacidade: number; latitude: number; longitude: number; ativo: boolean }> = {}) {
  const linha = await consultarUm<{ id: number; nome: string }>(
    `INSERT INTO abrigo (nome, endereco, latitude, longitude, capacidade_maxima, ativo)
     VALUES ($1, 'Endereço de teste', $2, $3, $4, $5) RETURNING id, nome`,
    [
      dados.nome ?? `Abrigo Teste ${sufixo()}`,
      dados.latitude ?? -28.26,
      dados.longitude ?? -52.4,
      dados.capacidade ?? 100,
      dados.ativo ?? true,
    ],
  );
  return linha!;
}

export async function criarUsuario(papel: Papel, idAbrigo: number | null, extras: Partial<{ ativo: boolean }> = {}) {
  hashSenhaTeste ??= gerarHashSenha(SENHA_TESTE);
  const email = `${papel.toLowerCase()}.${sufixo()}@teste.local`;
  const linha = await consultarUm<{ id: number }>(
    `INSERT INTO usuario (id_papel, id_abrigo, nome, email, senha_hash, ativo)
     VALUES ((SELECT id FROM papel_usuario WHERE nome = $1), $2, $3, $4, $5, $6) RETURNING id`,
    [papel, idAbrigo, `Usuário ${papel} ${sufixo()}`, email, await hashSenhaTeste, extras.ativo ?? true],
  );
  return { id: linha!.id, email, papel, idAbrigo };
}

/** Contexto de requisição autenticada (o que as rotas passam aos services). */
export function contexto(usuario: { id: number; email: string; papel: Papel; idAbrigo: number | null }): Contexto {
  return { usuario: { ...usuario, nome: "Teste" }, ip: "127.0.0.1" };
}

/** Cenário padrão: um abrigo com ADMIN, COORDENADOR e VOLUNTARIO. */
export async function criarCenario(opcoes: { capacidade?: number } = {}) {
  const abrigo = await criarAbrigo({ capacidade: opcoes.capacidade });
  const admin = await criarUsuario("ADMIN", null);
  const coordenador = await criarUsuario("COORDENADOR", abrigo.id);
  const voluntario = await criarUsuario("VOLUNTARIO", abrigo.id);
  return {
    abrigo,
    admin: contexto(admin),
    coordenador: contexto(coordenador),
    voluntario: contexto(voluntario),
    usuarios: { admin, coordenador, voluntario },
  };
}

export async function idItem(nome: string): Promise<number> {
  const linha = await consultarUm<{ id: number }>("SELECT id FROM item WHERE nome_micro = $1", [nome]);
  if (!linha) throw new Error(`Item ${nome} não existe`);
  return linha.id;
}

/** Executa e devolve o erro da API (falha o teste se não lançar). */
export async function capturarErro(promessa: Promise<unknown>): Promise<ErroApi> {
  try {
    await promessa;
  } catch (erro) {
    return normalizarErro(erro);
  }
  throw erros.requisicaoInvalida("Era esperado um erro, mas a operação foi concluída.");
}

export async function logsDoUsuario(idUsuario: number) {
  await aguardarAuditoriasPendentes();
  return consultar<{ acao: string; descricao: string; detalhes: Record<string, unknown> | null; endereco_ip: string | null; id_abrigo: number | null }>(
    "SELECT acao, descricao, detalhes, endereco_ip, id_abrigo FROM log_auditoria WHERE id_usuario = $1 ORDER BY id",
    [idUsuario],
  );
}
