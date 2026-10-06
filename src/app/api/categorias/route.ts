import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, responder, rota } from "@/lib/http";
import { criarCategoria, esquemaCriarCategoria, listarCategorias } from "@/modules/catalogo/catalogo.service";

export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await listarCategorias(ctx));
});

/** Cria categoria macro (ADMIN). O slug é gerado a partir do nome se omitido. */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await criarCategoria(ctx, await lerCorpo(req, esquemaCriarCategoria)), 201);
});
