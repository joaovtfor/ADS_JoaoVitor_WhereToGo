import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerQuery, responder, rota } from "@/lib/http";
import { criarItem, esquemaCriarItem, esquemaFiltroItens, listarItens } from "@/modules/catalogo/catalogo.service";

/** Catálogo de itens. Query: categoria (slug), ativo, busca */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await listarItens(ctx, lerQuery(req, esquemaFiltroItens)));
});

/** Cria item micro (ADMIN). */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await criarItem(ctx, await lerCorpo(req, esquemaCriarItem)), 201);
});
