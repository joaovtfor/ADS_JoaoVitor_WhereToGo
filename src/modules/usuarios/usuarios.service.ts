import { randomUUID } from "node:crypto";
import { exigirPermissao, PAPEIS, type Contexto, type Papel } from "@/lib/auth/rbac";
import { gerarHashSenha } from "@/lib/auth/senha";
import { auditar } from "@/lib/auditoria";
import { comTransacao, consultar, consultarUm, type Executor } from "@/lib/db";
import { erros } from "@/lib/http";
import { escaparIlike } from "@/lib/sql";
import { booleanoQuery, esquemaId, montarPagina, offset, textoObrigatorio, z, type Paginacao } from "@/lib/validacao";
import { esquemaSenha } from "../auth/auth.service";

const esquemaEmail = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.").max(255));

export const esquemaCriarUsuario = z.object({
  nome: textoObrigatorio(150),
  email: esquemaEmail,
  senha: esquemaSenha.optional(),
  papel: z.enum(PAPEIS),
  idAbrigo: esquemaId.nullish(),
});

export const esquemaAtualizarUsuario = z
  .object({
    nome: textoObrigatorio(150),
    email: esquemaEmail,
    senha: esquemaSenha,
    papel: z.enum(PAPEIS),
    idAbrigo: esquemaId.nullable(),
    ativo: z.boolean(),
  })
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Informe ao menos um campo para atualizar.");

export const esquemaFiltroUsuarios = z.object({
  papel: z.enum(PAPEIS).optional(),
  idAbrigo: esquemaId.optional(),
  ativo: booleanoQuery.optional(),
  busca: z.string().trim().max(150).optional(),
});

const COLUNAS_USUARIO = `
  u.id, u.nome, u.email, p.nome AS papel, u.id_abrigo AS "idAbrigo", a.nome AS abrigo, u.ativo,
  (u.google_sub IS NOT NULL) AS "possuiGoogle",
  u.criado_em AS "criadoEm", u.atualizado_em AS "atualizadoEm"`;

const FROM_USUARIO = `
  FROM usuario u
  JOIN papel_usuario p ON p.id = u.id_papel
  LEFT JOIN abrigo a ON a.id = u.id_abrigo`;

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  idAbrigo: number | null;
  abrigo: string | null;
  ativo: boolean;
  possuiGoogle: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

const buscarUsuario = (id: number, executor?: Executor) =>
  consultarUm<Usuario>(`SELECT ${COLUNAS_USUARIO} ${FROM_USUARIO} WHERE u.id = $1`, [id], executor);

async function exigirAbrigoAtivo(idAbrigo: number, executor: Executor) {
  const abrigo = await consultarUm<{ ativo: boolean }>("SELECT ativo FROM abrigo WHERE id = $1", [idAbrigo], executor);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  if (!abrigo.ativo) throw erros.conflito("ABRIGO_INATIVO", "Não é possível vincular usuários a um abrigo desativado.");
}

/** COORDENADOR só enxerga/gerencia VOLUNTARIOs do próprio abrigo. */
function exigirGestaoSobre(ctx: Contexto, alvo: Pick<Usuario, "papel" | "idAbrigo">) {
  exigirPermissao(ctx.usuario, "usuario:gerenciar");
  if (ctx.usuario.papel === "ADMIN") return;
  if (alvo.papel !== "VOLUNTARIO" || alvo.idAbrigo !== ctx.usuario.idAbrigo) {
    throw erros.semPermissao("Coordenadores só podem gerenciar voluntários do próprio abrigo.");
  }
}

export async function listarUsuarios(ctx: Contexto, filtros: z.infer<typeof esquemaFiltroUsuarios>, paginacao: Paginacao) {
  exigirPermissao(ctx.usuario, "usuario:ver");
  const idAbrigo = ctx.usuario.papel === "ADMIN" ? (filtros.idAbrigo ?? null) : ctx.usuario.idAbrigo;
  const termo = filtros.busca ? escaparIlike(filtros.busca) : null;

  const where = `($1::int IS NULL OR u.id_abrigo = $1)
    AND ($2::text IS NULL OR p.nome = $2)
    AND ($3::boolean IS NULL OR u.ativo = $3)
    AND ($4::text IS NULL OR u.nome ILIKE '%' || $4 || '%' OR u.email ILIKE '%' || $4 || '%')`;
  const parametros = [idAbrigo, filtros.papel ?? null, filtros.ativo ?? null, termo];

  const [itens, total] = await Promise.all([
    consultar<Usuario>(
      `SELECT ${COLUNAS_USUARIO} ${FROM_USUARIO} WHERE ${where} ORDER BY u.ativo ASC, u.nome ASC LIMIT $5 OFFSET $6`,
      [...parametros, paginacao.tamanho, offset(paginacao)],
    ),
    consultarUm<{ total: number }>(`SELECT count(*) AS total ${FROM_USUARIO} WHERE ${where}`, parametros),
  ]);
  return montarPagina(itens, total?.total ?? 0, paginacao);
}

export async function obterUsuario(ctx: Contexto, id: number): Promise<Usuario> {
  exigirPermissao(ctx.usuario, "usuario:ver");
  const usuario = await buscarUsuario(id);
  if (!usuario || (ctx.usuario.papel !== "ADMIN" && usuario.idAbrigo !== ctx.usuario.idAbrigo)) {
    throw erros.naoEncontrado("Usuário");
  }
  return usuario;
}

/**
 * ADMIN cria qualquer perfil (ADMIN sem abrigo; demais com abrigo ativo).
 * COORDENADOR cria apenas VOLUNTARIOs, sempre vinculados ao próprio abrigo.
 */
export async function criarUsuario(ctx: Contexto, dados: z.infer<typeof esquemaCriarUsuario>): Promise<Usuario> {
  const idAbrigo =
    ctx.usuario.papel === "COORDENADOR" ? (dados.idAbrigo ?? ctx.usuario.idAbrigo) : dados.papel === "ADMIN" ? null : dados.idAbrigo;
  exigirGestaoSobre(ctx, { papel: dados.papel, idAbrigo: idAbrigo ?? null });

  if (dados.papel === "ADMIN" && dados.idAbrigo) {
    throw erros.regraDeNegocio("VINCULO_INVALIDO", "Usuários ADMIN não podem ser vinculados a um abrigo.");
  }
  if (dados.papel !== "ADMIN" && !idAbrigo) {
    throw erros.regraDeNegocio("VINCULO_INVALIDO", `Usuários ${dados.papel} devem ser vinculados a um abrigo (idAbrigo).`);
  }

  const senhaBruta = dados.senha ?? `${randomUUID()}-${randomUUID()}`;
  const senhaHash = await gerarHashSenha(senhaBruta);
  const usuario = await comTransacao(async (client) => {
    if (idAbrigo) await exigirAbrigoAtivo(idAbrigo, client);
    const criado = await consultarUm<{ id: number }>(
      `INSERT INTO usuario (id_papel, id_abrigo, nome, email, senha_hash)
       VALUES ((SELECT id FROM papel_usuario WHERE nome = $1), $2, $3, $4, $5) RETURNING id`,
      [dados.papel, idAbrigo ?? null, dados.nome, dados.email, senhaHash],
      client,
    );
    return (await buscarUsuario(criado!.id, client))!;
  });

  auditar(ctx, {
    acao: "USUARIO_CRIADO",
    descricao: `Usuário ${usuario.email} (${usuario.papel}) criado`,
    idAbrigo: usuario.idAbrigo,
    detalhes: { idUsuarioAlvo: usuario.id, papel: usuario.papel },
  });
  return usuario;
}

const CAMPOS_COORDENADOR = new Set(["nome", "senha", "ativo"]);

export async function atualizarUsuario(ctx: Contexto, id: number, dados: z.infer<typeof esquemaAtualizarUsuario>) {
  const alvo = await obterUsuario(ctx, id);
  exigirGestaoSobre(ctx, alvo);

  const campos = Object.keys(dados).filter((c) => dados[c as keyof typeof dados] !== undefined);
  if (ctx.usuario.papel === "COORDENADOR" && campos.some((c) => !CAMPOS_COORDENADOR.has(c))) {
    throw erros.semPermissao("Coordenadores só podem alterar nome, senha e status (ativo) de voluntários.");
  }

  const ehProprioUsuario = id === ctx.usuario.id;
  if (ehProprioUsuario && (dados.ativo === false || (dados.papel && dados.papel !== alvo.papel))) {
    throw erros.regraDeNegocio("AUTOALTERACAO_BLOQUEADA", "Você não pode desativar nem alterar o papel da sua própria conta.");
  }

  const papelFinal = dados.papel ?? alvo.papel;
  // Promovido a ADMIN: o vínculo com abrigo deixa de existir.
  const idAbrigoFinal = papelFinal === "ADMIN" ? null : dados.idAbrigo !== undefined ? dados.idAbrigo : alvo.idAbrigo;
  if (papelFinal !== "ADMIN" && !idAbrigoFinal) {
    throw erros.regraDeNegocio("VINCULO_INVALIDO", `Usuários ${papelFinal} devem ser vinculados a um abrigo (idAbrigo).`);
  }

  const usuario = await comTransacao(async (client) => {
    if (idAbrigoFinal && idAbrigoFinal !== alvo.idAbrigo) await exigirAbrigoAtivo(idAbrigoFinal, client);

    // Garante que sempre reste ao menos um ADMIN ativo.
    const deixaDeSerAdminAtivo = alvo.papel === "ADMIN" && alvo.ativo && (papelFinal !== "ADMIN" || dados.ativo === false);
    if (deixaDeSerAdminAtivo) {
      const outros = await consultarUm<{ total: number }>(
        `SELECT count(*) AS total FROM usuario u JOIN papel_usuario p ON p.id = u.id_papel
          WHERE p.nome = 'ADMIN' AND u.ativo AND u.id <> $1`,
        [id],
        client,
      );
      if (!outros?.total) {
        throw erros.regraDeNegocio("ULTIMO_ADMIN", "O sistema precisa de ao menos um administrador ativo.");
      }
    }

    const sets: string[] = [];
    const valores: unknown[] = [id];
    const definir = (coluna: string, valor: unknown, expressao = "$n") => {
      valores.push(valor);
      sets.push(`${coluna} = ${expressao.replace("$n", `$${valores.length}`)}`);
    };
    if (dados.nome !== undefined) definir("nome", dados.nome);
    if (dados.email !== undefined) definir("email", dados.email);
    if (dados.senha !== undefined) definir("senha_hash", await gerarHashSenha(dados.senha));
    if (dados.ativo !== undefined) definir("ativo", dados.ativo);
    if (dados.papel !== undefined) definir("id_papel", dados.papel, "(SELECT id FROM papel_usuario WHERE nome = $n)");
    if (dados.papel !== undefined || dados.idAbrigo !== undefined) definir("id_abrigo", idAbrigoFinal);

    await client.query(`UPDATE usuario SET ${sets.join(", ")} WHERE id = $1`, valores);
    return (await buscarUsuario(id, client))!;
  });

  auditar(ctx, {
    acao: "USUARIO_ATUALIZADO",
    descricao: `Usuário ${usuario.email} atualizado (${campos.join(", ")})`,
    idAbrigo: usuario.idAbrigo,
    detalhes: {
      idUsuarioAlvo: id,
      campos,
      ...(dados.papel ? { papel: { de: alvo.papel, para: usuario.papel } } : {}),
      ...(dados.ativo !== undefined ? { ativo: { de: alvo.ativo, para: usuario.ativo } } : {}),
    },
  });
  return usuario;
}
