import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { esquemaResolverOcorrencia, resolverOcorrencia } from "@/modules/ocorrencias/ocorrencias.service";

const parametros = z.object({ id: esquemaId, ocorrenciaId: esquemaId });

/** Marca a ocorrência como resolvida (o status do abrigo é recalculado). */
export const POST = rota<{ id: string; ocorrenciaId: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id, ocorrenciaId } = await lerParametros(contexto, parametros);
  return responder(await resolverOcorrencia(ctx, id, ocorrenciaId, await lerCorpo(req, esquemaResolverOcorrencia)));
});
