import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, lerQuery, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import {
  esquemaFiltroOcorrencias,
  esquemaRegistrarOcorrencia,
  listarOcorrencias,
  registrarOcorrencia,
} from "@/modules/ocorrencias/ocorrencias.service";

/** RF05 - ocorrências de infraestrutura do abrigo. Query: ativas=true|false */
export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await listarOcorrencias(ctx, id, lerQuery(req, esquemaFiltroOcorrencias)));
});

/** RF05 - reporta incidente (energia, água, via colapsada...). */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await registrarOcorrencia(ctx, id, await lerCorpo(req, esquemaRegistrarOcorrencia)), 201);
});
