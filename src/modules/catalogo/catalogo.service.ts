import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { montarAtualizacao } from "@/lib/sql";
import { booleanoQuery, esquemaId, textoObrigatorio, z } from "@/lib/validacao";

/** "Cama e Banho" -> "cama-e-banho" */
export function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const esquemaSlug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens.")
  .max(40);

export const esquemaCriarCategoria = z.object({ nome: textoObrigatorio(60), slug: esquemaSlug.optional() });
export const esquemaAtualizarCategoria = esquemaCriarCategoria
  .partial()
  .refine((d) => d.nome !== undefined || d.slug !== undefined, "Informe ao menos um campo para atualizar.");

export const esquemaCriarItem = z.object({
  idCategoria: esquemaId,
  nome: textoObrigatorio(100),
  unidadeMedida: textoObrigatorio(20),
});
export const esquemaAtualizarItem = esquemaCriarItem
  .extend({ ativo: z.boolean() })
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Informe ao menos um campo para atualizar.");

export const esquemaFiltroItens = z.object({
  categoria: z.string().trim().max(40).optional(),
  ativo: booleanoQuery.optional(),
  busca: z.string().trim().max(100).optional(),
});

const COLUNAS_ITEM = `
  i.id, i.nome_micro AS nome, i.unidade_medida AS "unidadeMedida", i.ativo,
  i.id_categoria AS "idCategoria", c.nome_macro AS categoria, c.slug AS "categoriaSlug"`;

const buscarItem = (id: number) =>
  consultarUm<{ id: number; nome: string }>(
    `SELECT ${COLUNAS_ITEM} FROM item i JOIN categoria_item c ON c.id = i.id_categoria WHERE i.id = $1`,
    [id],
  );

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------

export async function listarCategorias(ctx: Contexto) {
  exigirPermissao(ctx.usuario, "catalogo:ver");
  return consultar(
    `SELECT c.id, c.nome_macro AS nome, c.slug,
            count(i.id) FILTER (WHERE i.ativo) AS "itensAtivos",
            count(i.id) AS "totalItens"
       FROM categoria_item c LEFT JOIN item i ON i.id_categoria = c.id
      GROUP BY c.id
      ORDER BY c.nome_macro`,
  );
}

export async function criarCategoria(ctx: Contexto, dados: z.infer<typeof esquemaCriarCategoria>) {
  exigirPermissao(ctx.usuario, "catalogo:gerenciar");
  const slug = dados.slug ?? gerarSlug(dados.nome);
  if (!slug) throw erros.requisicaoInvalida("Não foi possível gerar o slug: informe o campo \"slug\".");

  const categoria = await consultarUm<{ id: number; nome: string; slug: string }>(
    `INSERT INTO categoria_item (nome_macro, slug) VALUES ($1, $2) RETURNING id, nome_macro AS nome, slug`,
    [dados.nome, slug],
  );
  auditar(ctx, {
    acao: "CATEGORIA_CRIADA",
    descricao: `Categoria "${dados.nome}" criada`,
    detalhes: { idCategoria: categoria!.id, slug },
  });
  return categoria!;
}

export async function atualizarCategoria(ctx: Contexto, id: number, dados: z.infer<typeof esquemaAtualizarCategoria>) {
  exigirPermissao(ctx.usuario, "catalogo:gerenciar");
  const { sets, valores } = montarAtualizacao(dados, { nome: "nome_macro", slug: "slug" }, 2);
  const categoria = await consultarUm<{ id: number; nome: string; slug: string }>(
    `UPDATE categoria_item SET ${sets.join(", ")} WHERE id = $1 RETURNING id, nome_macro AS nome, slug`,
    [id, ...valores],
  );
  if (!categoria) throw erros.naoEncontrado("Categoria");

  auditar(ctx, {
    acao: "CATEGORIA_ATUALIZADA",
    descricao: `Categoria "${categoria.nome}" atualizada`,
    detalhes: { idCategoria: id, ...dados },
  });
  return categoria;
}

// -----------------------------------------------------------------------------
// Itens
// -----------------------------------------------------------------------------

export async function listarItens(ctx: Contexto, filtros: z.infer<typeof esquemaFiltroItens>) {
  exigirPermissao(ctx.usuario, "catalogo:ver");
  return consultar(
    `SELECT ${COLUNAS_ITEM}
       FROM item i JOIN categoria_item c ON c.id = i.id_categoria
      WHERE ($1::text IS NULL OR c.slug = $1)
        AND ($2::boolean IS NULL OR i.ativo = $2)
        AND ($3::text IS NULL OR i.nome_micro ILIKE '%' || $3 || '%')
      ORDER BY c.nome_macro, i.nome_micro`,
    [filtros.categoria || null, filtros.ativo ?? null, filtros.busca || null],
  );
}

export async function criarItem(ctx: Contexto, dados: z.infer<typeof esquemaCriarItem>) {
  exigirPermissao(ctx.usuario, "catalogo:gerenciar");
  const criado = await consultarUm<{ id: number }>(
    `INSERT INTO item (id_categoria, nome_micro, unidade_medida) VALUES ($1, $2, $3) RETURNING id`,
    [dados.idCategoria, dados.nome, dados.unidadeMedida],
  );
  auditar(ctx, { acao: "ITEM_CRIADO", descricao: `Item "${dados.nome}" criado`, detalhes: { idItem: criado!.id, ...dados } });
  return (await buscarItem(criado!.id))!;
}

/** Itens nunca são excluídos (histórico de movimentações); use `ativo: false`. */
export async function atualizarItem(ctx: Contexto, id: number, dados: z.infer<typeof esquemaAtualizarItem>) {
  exigirPermissao(ctx.usuario, "catalogo:gerenciar");
  const { sets, valores } = montarAtualizacao(
    dados,
    { idCategoria: "id_categoria", nome: "nome_micro", unidadeMedida: "unidade_medida", ativo: "ativo" },
    2,
  );
  const atualizado = await consultarUm<{ id: number }>(`UPDATE item SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, [
    id,
    ...valores,
  ]);
  if (!atualizado) throw erros.naoEncontrado("Item");

  const item = (await buscarItem(id))!;
  auditar(ctx, { acao: "ITEM_ATUALIZADO", descricao: `Item "${item.nome}" atualizado`, detalhes: { idItem: id, ...dados } });
  return item;
}
