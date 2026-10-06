import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { desligarAbrigado, esquemaDesligamento } from "@/modules/abrigados/abrigados.service";

/** Registra a saída definitiva do abrigado (libera a vaga). */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await desligarAbrigado(ctx, id, await lerCorpo(req, esquemaDesligamento)));
});
