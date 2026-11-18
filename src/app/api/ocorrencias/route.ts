import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerQuery, responder, rota } from "@/lib/http";
import {
  esquemaFiltroOcorrencias,
  esquemaRegistrarOcorrenciaRegional,
  listarOcorrenciasRegionais,
  registrarOcorrenciaRegional,
} from "@/modules/ocorrencias/ocorrencias.service";

/** Ocorrências regionais (do território, sem abrigo). Query: ativas=true|false */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await listarOcorrenciasRegionais(ctx, lerQuery(req, esquemaFiltroOcorrencias)));
});

/** Registra ocorrência regional (ADMIN e DEFESA_CIVIL): via interditada, área de risco, alagamento... */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await registrarOcorrenciaRegional(ctx, await lerCorpo(req, esquemaRegistrarOcorrenciaRegional)), 201);
});
