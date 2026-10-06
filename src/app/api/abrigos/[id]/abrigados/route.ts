import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, lerQuery, responder, rota } from "@/lib/http";
import { esquemaPaginacao, parametrosId } from "@/lib/validacao";
import {
  esquemaFiltroAbrigados,
  esquemaRegistrarAbrigado,
  listarAbrigados,
  registrarEntrada,
} from "@/modules/abrigados/abrigados.service";

/** RF12 - abrigados do abrigo. Query: status=PRESENTE|DESLIGADO|TODOS, busca (nome/CPF), pagina, tamanho */
export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  const filtros = lerQuery(req, esquemaFiltroAbrigados.extend(esquemaPaginacao.shape));
  return responder(await listarAbrigados(ctx, id, filtros, filtros), 200, { "Cache-Control": "no-store" });
});

/** RF12 - registra a entrada (check-in) de uma pessoa no abrigo. */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  const resultado = await registrarEntrada(ctx, id, await lerCorpo(req, esquemaRegistrarAbrigado));
  return responder(resultado, resultado.reentrada ? 200 : 201);
});
