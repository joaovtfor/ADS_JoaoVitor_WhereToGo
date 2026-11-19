import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { montarAtualizacao } from "@/lib/sql";
import { textoObrigatorio, textoOpcional, z } from "@/lib/validacao";

// Eventos de desastre (Etapa 4): a operação que o COBRADE classifica e que
// define o período dos subsídios para o FIDE. Registrados por ADMIN e Defesa Civil.

const esquemaData = z.iso.date("Data inválida (use AAAA-MM-DD).");
const esquemaCodigoCobrade = z.string().regex(/^[0-9](\.[0-9]){4}$/, "Código COBRADE inválido (ex.: 1.2.1.0.0).");

export const esquemaCriarEvento = z
  .object({
    nome: textoObrigatorio(150),
    cobrade: esquemaCodigoCobrade,
    inicio: esquemaData,
    fim: esquemaData.nullish(),
    decreto: textoOpcional(120),
  })
  .refine((d) => !d.fim || d.fim >= d.inicio, { message: "O fim não pode ser antes do início.", path: ["fim"] });

export const esquemaAtualizarEvento = z
  .object({
    nome: textoObrigatorio(150),
    cobrade: esquemaCodigoCobrade,
    inicio: esquemaData,
    fim: esquemaData.nullable(),
    decreto: textoOpcional(120),
  })
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Informe ao menos um campo para atualizar.");

export interface EventoDesastre {
  id: number;
  nome: string;
  cobrade: string;
  cobradeDescricao: string;
  cobradeGrupo: string;
  /** Datas "AAAA-MM-DD" (o driver devolve DATE como texto). */
  inicio: string;
  fim: string | null;
  decreto: string | null;
  emCurso: boolean;
  registradoPor: string;
  criadoEm: Date;
}

const SELECT_EVENTO = `
  SELECT e.id, e.nome, e.cobrade, c.descricao AS "cobradeDescricao", c.grupo AS "cobradeGrupo",
         e.inicio, e.fim, e.decreto, (e.fim IS NULL) AS "emCurso",
         u.nome AS "registradoPor", e.criado_em AS "criadoEm"
    FROM evento_desastre e
    JOIN cobrade c ON c.codigo = e.cobrade
    JOIN usuario u ON u.id = e.id_usuario_registro`;

/** Códigos COBRADE disponíveis (conferidos na tabela oficial). */
export function listarCobrade() {
  return consultar<{ codigo: string; grupo: string; descricao: string }>(
    "SELECT codigo, grupo, descricao FROM cobrade ORDER BY codigo",
  );
}

export async function listarEventos(ctx: Contexto): Promise<EventoDesastre[]> {
  exigirPermissao(ctx.usuario, "evento:ver");
  return consultar<EventoDesastre>(`${SELECT_EVENTO} ORDER BY (e.fim IS NULL) DESC, e.inicio DESC, e.id DESC`);
}

export async function obterEvento(ctx: Contexto, id: number): Promise<EventoDesastre> {
  exigirPermissao(ctx.usuario, "evento:ver");
  const evento = await consultarUm<EventoDesastre>(`${SELECT_EVENTO} WHERE e.id = $1`, [id]);
  if (!evento) throw erros.naoEncontrado("Evento");
  return evento;
}

async function exigirCobrade(codigo: string) {
  const existe = await consultarUm("SELECT 1 FROM cobrade WHERE codigo = $1", [codigo]);
  if (!existe) {
    throw erros.regraDeNegocio("COBRADE_DESCONHECIDO", `O código ${codigo} não está na lista conferida. Confira na tabela COBRADE vigente antes de cadastrá-lo.`);
  }
}

export async function criarEvento(ctx: Contexto, dados: z.infer<typeof esquemaCriarEvento>): Promise<EventoDesastre> {
  exigirPermissao(ctx.usuario, "evento:gerenciar");
  await exigirCobrade(dados.cobrade);

  const criado = await consultarUm<{ id: number }>(
    `INSERT INTO evento_desastre (nome, cobrade, inicio, fim, decreto, id_usuario_registro)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [dados.nome, dados.cobrade, dados.inicio, dados.fim ?? null, dados.decreto ?? null, ctx.usuario.id],
  );
  const evento = await obterEvento(ctx, criado!.id);

  auditar(ctx, {
    acao: "EVENTO_REGISTRADO",
    descricao: `Evento "${evento.nome}" (COBRADE ${evento.cobrade}) desde ${evento.inicio}`,
    detalhes: { idEvento: evento.id, ...dados },
  });
  return evento;
}

/** Ajusta o evento; `fim` preenchido encerra (o relatório deixa de ir até hoje). */
export async function atualizarEvento(ctx: Contexto, id: number, dados: z.infer<typeof esquemaAtualizarEvento>): Promise<EventoDesastre> {
  exigirPermissao(ctx.usuario, "evento:gerenciar");
  const atual = await obterEvento(ctx, id);
  if (dados.cobrade) await exigirCobrade(dados.cobrade);

  const { sets, valores } = montarAtualizacao(dados, { nome: "nome", cobrade: "cobrade", inicio: "inicio", fim: "fim", decreto: "decreto" }, 2);
  await consultar(`UPDATE evento_desastre SET ${sets.join(", ")} WHERE id = $1`, [id, ...valores]);
  const evento = await obterEvento(ctx, id);

  auditar(ctx, {
    acao: "EVENTO_ATUALIZADO",
    descricao: `Evento "${evento.nome}" atualizado${dados.fim && !atual.fim ? ` e encerrado em ${dados.fim}` : ""}`,
    detalhes: { idEvento: id, campos: Object.keys(dados).filter((c) => dados[c as keyof typeof dados] !== undefined) },
  });
  return evento;
}
