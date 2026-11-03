import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { ajustarNaoTriados, esquemaAjusteTriagem } from "@/modules/abrigos/abrigos.service";

/** RF04 - fila de triagem em massa: `{ "delta": 1 }` ou `{ "delta": -1 }`, somado no banco. */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await ajustarNaoTriados(ctx, id, await lerCorpo(req, esquemaAjusteTriagem)));
});
