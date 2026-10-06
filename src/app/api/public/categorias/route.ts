import { responder, rota } from "@/lib/http";
import { listarCategoriasPublicas } from "@/modules/publico/publico.service";

/** RF08 - categorias e itens para o menu de filtros rápidos do doador. */
export const GET = rota(async () => {
  return responder(await listarCategoriasPublicas(), 200, { "Cache-Control": "public, max-age=300" });
});
