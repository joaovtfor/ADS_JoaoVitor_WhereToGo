import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { esquemaModerarOcorrencia, moderarOcorrencia } from "@/modules/ocorrencias/ocorrencias.service";

const parametros = z.object({ id: esquemaId, ocorrenciaId: esquemaId });

/** Modera reporte cidadão (APROVAR publica no mapa; REJEITAR descarta). */
export const POST = rota<{ id: string; ocorrenciaId: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id, ocorrenciaId } = await lerParametros(contexto, parametros);
  return responder(await moderarOcorrencia(ctx, id, ocorrenciaId, await lerCorpo(req, esquemaModerarOcorrencia)));
});
