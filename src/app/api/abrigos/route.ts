import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerQuery, responder, rota } from "@/lib/http";
import {
  criarAbrigo,
  esquemaCriarAbrigo,
  esquemaFiltroAbrigos,
  listarAbrigos,
} from "@/modules/abrigos/abrigos.service";

/** Lista abrigos (ADMIN: todos; demais: o próprio). Query: ativo, busca */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await listarAbrigos(ctx, lerQuery(req, esquemaFiltroAbrigos)));
});

/** RF10 - cadastro de abrigo (ADMIN). */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await criarAbrigo(ctx, await lerCorpo(req, esquemaCriarAbrigo)), 201);
});
