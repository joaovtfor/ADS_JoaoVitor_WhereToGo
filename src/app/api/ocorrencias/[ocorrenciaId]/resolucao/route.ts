import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { esquemaResolverOcorrencia, resolverOcorrenciaRegional } from "@/modules/ocorrencias/ocorrencias.service";

const parametros = z.object({ ocorrenciaId: esquemaId });

/** Encerra uma ocorrência regional (sai do mapa público). */
export const POST = rota<{ ocorrenciaId: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { ocorrenciaId } = await lerParametros(contexto, parametros);
  return responder(await resolverOcorrenciaRegional(ctx, ocorrenciaId, await lerCorpo(req, esquemaResolverOcorrencia)));
});
