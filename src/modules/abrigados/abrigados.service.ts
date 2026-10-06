import type { PoolClient } from "pg";
import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { comTransacao, consultar, consultarUm, type Executor } from "@/lib/db";
import { erros } from "@/lib/http";
import { montarAtualizacao } from "@/lib/sql";
import { esquemaId, montarPagina, offset, textoObrigatorio, textoOpcional, z, type Paginacao } from "@/lib/validacao";
import type { StatusAcolhimento } from "../dominio";

// -----------------------------------------------------------------------------
// Validação
// -----------------------------------------------------------------------------

const esquemaCpf = z
  .string()
  .trim()
  .transform(normalizarCpf)
  .refine((cpf) => cpf === "" || cpfValido(cpf), "CPF inválido.")
  .transform((cpf) => (cpf === "" ? null : cpf));

const esquemaDataNascimento = z.iso
  .date("Data de nascimento inválida (use AAAA-MM-DD).")
  .refine((d) => d <= new Date().toISOString().slice(0, 10), "A data de nascimento não pode estar no futuro.");

export const esquemaRegistrarAbrigado = z.object({
  nomeCompleto: textoObrigatorio(150),
  cpf: esquemaCpf.nullish(),
  dataNascimento: esquemaDataNascimento.nullish(),
});

export const esquemaAtualizarAbrigado = esquemaRegistrarAbrigado
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Informe ao menos um campo para atualizar.");

export const esquemaDesligamento = z.object({ motivo: textoOpcional(500) });

export const esquemaTransferenciaAbrigado = z.object({
  idAbrigoDestino: esquemaId,
  motivo: textoObrigatorio(500),
});

export const esquemaFiltroAbrigados = z.object({
  status: z.enum(["PRESENTE", "DESLIGADO", "TODOS"]).default("PRESENTE"),
  busca: z.string().trim().max(150).optional(),
});

// -----------------------------------------------------------------------------
// Consulta e apresentação
// -----------------------------------------------------------------------------

const COLUNAS_ABRIGADO = `
  ab.id, ab.id_abrigo_atual AS "idAbrigoAtual", a.nome AS "abrigoAtual", ab.nome_completo AS "nomeCompleto",
  ab.cpf, ab.data_nascimento AS "dataNascimento", ab.data_entrada AS "dataEntrada", ab.data_saida AS "dataSaida",
  ab.status_acolhimento AS "statusAcolhimento", ab.criado_em AS "criadoEm", ab.atualizado_em AS "atualizadoEm"`;

const FROM_ABRIGADO = "FROM abrigado ab JOIN abrigo a ON a.id = ab.id_abrigo_atual";

export interface Abrigado {
  id: number;
  idAbrigoAtual: number;
  abrigoAtual: string;
  nomeCompleto: string;
  cpf: string | null;
  dataNascimento: string | null;
  dataEntrada: Date;
  dataSaida: Date | null;
  statusAcolhimento: StatusAcolhimento;
  criadoEm: Date;
  atualizadoEm: Date;
}

function buscarAbrigado(id: number, executor?: Executor, bloquear = false): Promise<Abrigado | null> {
  return consultarUm<Abrigado>(
    `SELECT ${COLUNAS_ABRIGADO} ${FROM_ABRIGADO} WHERE ab.id = $1 ${bloquear ? "FOR UPDATE OF ab" : ""}`,
    [id],
    executor,
  );
}

async function obterComPermissao(ctx: Contexto, id: number, permissao: Parameters<typeof exigirPermissao>[1]) {
  const abrigado = await buscarAbrigado(id);
  if (!abrigado) throw erros.naoEncontrado("Abrigado");
  exigirPermissao(ctx.usuario, permissao, abrigado.idAbrigoAtual);
  return abrigado;
}

interface AbrigoParaEntrada {
  id: number;
  nome: string;
  ativo: boolean;
  capacidadeMaxima: number;
  lotacaoAtual: number;
}

/** Bloqueia o abrigo (FOR UPDATE) e valida se ele pode receber mais uma pessoa. */
async function exigirVaga(idAbrigo: number, client: PoolClient): Promise<AbrigoParaEntrada> {
  const abrigo = await consultarUm<AbrigoParaEntrada>(
    `SELECT id, nome, ativo, capacidade_maxima AS "capacidadeMaxima", lotacao_atual AS "lotacaoAtual"
       FROM abrigo WHERE id = $1 FOR UPDATE`,
    [idAbrigo],
    client,
  );
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  if (!abrigo.ativo) throw erros.conflito("ABRIGO_INATIVO", `O abrigo "${abrigo.nome}" está desativado.`);
  if (abrigo.lotacaoAtual >= abrigo.capacidadeMaxima) {
    throw erros.conflito("ABRIGO_LOTADO", `O abrigo "${abrigo.nome}" está lotado (${abrigo.lotacaoAtual}/${abrigo.capacidadeMaxima}).`, {
      capacidadeMaxima: abrigo.capacidadeMaxima,
      lotacaoAtual: abrigo.lotacaoAtual,
    });
  }
  return abrigo;
}

// -----------------------------------------------------------------------------
// Casos de uso
// -----------------------------------------------------------------------------

export async function listarAbrigados(
  ctx: Contexto,
  idAbrigo: number,
  filtros: z.infer<typeof esquemaFiltroAbrigados>,
  paginacao: Paginacao,
) {
  exigirPermissao(ctx.usuario, "abrigado:ver", idAbrigo);

  const cpfBusca = filtros.busca ? normalizarCpf(filtros.busca) : "";
  const where = `ab.id_abrigo_atual = $1
    AND ($2::text = 'TODOS' OR ab.status_acolhimento = $2)
    AND ($3::text IS NULL OR ab.nome_completo ILIKE '%' || $3 || '%' OR ($4::text <> '' AND ab.cpf LIKE $4 || '%'))`;
  const parametros = [idAbrigo, filtros.status, filtros.busca || null, cpfBusca];

  const [itens, total] = await Promise.all([
    consultar<Abrigado>(
      `SELECT ${COLUNAS_ABRIGADO} ${FROM_ABRIGADO} WHERE ${where}
        ORDER BY ab.nome_completo LIMIT $5 OFFSET $6`,
      [...parametros, paginacao.tamanho, offset(paginacao)],
    ),
    consultarUm<{ total: number }>(`SELECT count(*) AS total FROM abrigado ab WHERE ${where}`, parametros),
  ]);
  return montarPagina(itens, total?.total ?? 0, paginacao);
}

export function obterAbrigado(ctx: Contexto, id: number): Promise<Abrigado> {
  return obterComPermissao(ctx, id, "abrigado:ver");
}

/**
 * Check-in no abrigo. Se o CPF já pertence a alguém DESLIGADO, o cadastro é
 * reaproveitado (reentrada); se a pessoa já está PRESENTE em algum abrigo, a
 * entrada é recusada. Abrigo lotado ou desativado não recebe novas pessoas.
 */
export async function registrarEntrada(ctx: Contexto, idAbrigo: number, dados: z.infer<typeof esquemaRegistrarAbrigado>) {
  exigirPermissao(ctx.usuario, "abrigado:registrar", idAbrigo);

  const { abrigado, reentrada, abrigo } = await comTransacao(async (client) => {
    const abrigo = await exigirVaga(idAbrigo, client);

    if (dados.cpf) {
      const existente = await consultarUm<{ id: number; status: StatusAcolhimento }>(
        `SELECT id, status_acolhimento AS status FROM abrigado WHERE cpf = $1 FOR UPDATE`,
        [dados.cpf],
        client,
      );
      if (existente?.status === "PRESENTE") {
        throw erros.conflito("ABRIGADO_JA_PRESENTE", "Esta pessoa (CPF) já está registrada como presente em um abrigo.");
      }
      if (existente) {
        await client.query(
          `UPDATE abrigado
              SET id_abrigo_atual = $2, status_acolhimento = 'PRESENTE', data_entrada = now(), data_saida = NULL,
                  nome_completo = $3, data_nascimento = COALESCE($4, data_nascimento)
            WHERE id = $1`,
          [existente.id, idAbrigo, dados.nomeCompleto, dados.dataNascimento ?? null],
        );
        return { abrigado: (await buscarAbrigado(existente.id, client))!, reentrada: true, abrigo };
      }
    }

    const novo = await consultarUm<{ id: number }>(
      `INSERT INTO abrigado (id_abrigo_atual, nome_completo, cpf, data_nascimento) VALUES ($1, $2, $3, $4) RETURNING id`,
      [idAbrigo, dados.nomeCompleto, dados.cpf ?? null, dados.dataNascimento ?? null],
      client,
    );
    return { abrigado: (await buscarAbrigado(novo!.id, client))!, reentrada: false, abrigo };
  });

  auditar(ctx, {
    acao: "ABRIGADO_REGISTRADO",
    descricao: `${reentrada ? "Reentrada" : "Entrada"} de ${abrigado.nomeCompleto} em "${abrigo.nome}"`,
    idAbrigo,
    detalhes: { idAbrigado: abrigado.id, reentrada },
  });
  return { abrigado, reentrada };
}

const COLUNAS_EDITAVEIS = { nomeCompleto: "nome_completo", cpf: "cpf", dataNascimento: "data_nascimento" };

export async function atualizarAbrigado(ctx: Contexto, id: number, dados: z.infer<typeof esquemaAtualizarAbrigado>) {
  const atual = await obterComPermissao(ctx, id, "abrigado:editar");
  const { sets, valores } = montarAtualizacao(dados, COLUNAS_EDITAVEIS, 2);
  await consultar(`UPDATE abrigado SET ${sets.join(", ")} WHERE id = $1`, [id, ...valores]);
  const atualizado = (await buscarAbrigado(id))!;

  auditar(ctx, {
    acao: "ABRIGADO_ATUALIZADO",
    descricao: `Cadastro de ${atualizado.nomeCompleto} atualizado`,
    idAbrigo: atual.idAbrigoAtual,
    detalhes: { idAbrigado: id, campos: Object.keys(dados).filter((c) => dados[c as keyof typeof dados] !== undefined) },
  });
  return atualizado;
}

/** Saída definitiva do abrigo (retorno para casa, familiares etc.). */
export async function desligarAbrigado(ctx: Contexto, id: number, dados: z.infer<typeof esquemaDesligamento>) {
  const atual = await obterComPermissao(ctx, id, "abrigado:desligar");

  const desligado = await comTransacao(async (client) => {
    const travado = await buscarAbrigado(id, client, true);
    if (travado!.statusAcolhimento !== "PRESENTE") {
      throw erros.conflito("ABRIGADO_JA_DESLIGADO", "Este abrigado já foi desligado.");
    }
    await client.query(
      "UPDATE abrigado SET status_acolhimento = 'DESLIGADO', data_saida = now() WHERE id = $1",
      [id],
    );
    return (await buscarAbrigado(id, client))!;
  });

  auditar(ctx, {
    acao: "ABRIGADO_DESLIGADO",
    descricao: `Saída de ${desligado.nomeCompleto} de "${desligado.abrigoAtual}"`,
    idAbrigo: atual.idAbrigoAtual,
    detalhes: { idAbrigado: id, motivo: dados.motivo ?? null },
  });
  return desligado;
}

/** Transfere um abrigado PRESENTE para outro abrigo com vaga, registrando o histórico. */
export async function transferirAbrigado(ctx: Contexto, id: number, dados: z.infer<typeof esquemaTransferenciaAbrigado>) {
  const atual = await obterComPermissao(ctx, id, "abrigado:transferir");
  if (dados.idAbrigoDestino === atual.idAbrigoAtual) {
    throw erros.requisicaoInvalida("O abrigado já está neste abrigo.");
  }

  const resultado = await comTransacao(async (client) => {
    const travado = (await buscarAbrigado(id, client, true))!;
    if (travado.statusAcolhimento !== "PRESENTE") {
      throw erros.conflito("ABRIGADO_JA_DESLIGADO", "Somente abrigados presentes podem ser transferidos.");
    }
    if (travado.idAbrigoAtual !== atual.idAbrigoAtual) {
      throw erros.conflito("ABRIGADO_MOVIDO", "O abrigado foi movido por outra operação. Recarregue e tente novamente.");
    }

    // Bloqueia os dois abrigos sempre na mesma ordem (menor id primeiro) para evitar deadlock.
    await client.query("SELECT id FROM abrigo WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE", [
      [travado.idAbrigoAtual, dados.idAbrigoDestino],
    ]);
    const destino = await exigirVaga(dados.idAbrigoDestino, client);

    const transferencia = await consultarUm<{ id: number; dataTransferencia: Date }>(
      `INSERT INTO transferencia_abrigado (id_abrigado, id_abrigo_origem, id_abrigo_destino, id_usuario, motivo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, data_transferencia AS "dataTransferencia"`,
      [id, travado.idAbrigoAtual, destino.id, ctx.usuario.id, dados.motivo],
      client,
    );

    return {
      transferencia: {
        id: transferencia!.id,
        dataTransferencia: transferencia!.dataTransferencia,
        origem: { id: travado.idAbrigoAtual, nome: travado.abrigoAtual },
        destino: { id: destino.id, nome: destino.nome },
        motivo: dados.motivo,
      },
      abrigado: (await buscarAbrigado(id, client))!,
    };
  });

  auditar(ctx, {
    acao: "ABRIGADO_TRANSFERIDO",
    descricao: `${resultado.abrigado.nomeCompleto} transferido(a) de "${resultado.transferencia.origem.nome}" para "${resultado.transferencia.destino.nome}"`,
    idAbrigo: resultado.transferencia.origem.id,
    detalhes: {
      idAbrigado: id,
      idTransferencia: resultado.transferencia.id,
      idAbrigoDestino: resultado.transferencia.destino.id,
      motivo: dados.motivo,
    },
  });
  return resultado;
}

export async function listarTransferencias(ctx: Contexto, id: number) {
  await obterComPermissao(ctx, id, "abrigado:ver");
  return consultar(
    `SELECT t.id, t.data_transferencia AS "dataTransferencia", t.motivo,
            t.id_abrigo_origem AS "idAbrigoOrigem", ao.nome AS "abrigoOrigem",
            t.id_abrigo_destino AS "idAbrigoDestino", ad.nome AS "abrigoDestino",
            t.id_usuario AS "idUsuario", u.nome AS usuario
       FROM transferencia_abrigado t
       JOIN abrigo ao ON ao.id = t.id_abrigo_origem
       JOIN abrigo ad ON ad.id = t.id_abrigo_destino
       JOIN usuario u ON u.id = t.id_usuario
      WHERE t.id_abrigado = $1
      ORDER BY t.data_transferencia DESC, t.id DESC`,
    [id],
  );
}
