import { responder, rota } from "@/lib/http";
import { listarCategoriasPublicasEmCache } from "@/modules/publico/publico.cache";
import { CACHE_PUBLICO } from "@/modules/publico/publico.service";

/** RF08 - categorias e itens para o menu de filtros rápidos do doador. */
export const GET = rota(async () => {
  return responder(await listarCategoriasPublicasEmCache(), 200, CACHE_PUBLICO);
});
