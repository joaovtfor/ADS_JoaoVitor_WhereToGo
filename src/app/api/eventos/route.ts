import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, responder, rota } from "@/lib/http";
import { criarEvento, esquemaCriarEvento, listarCobrade, listarEventos } from "@/modules/relatorios/eventos.service";

/** Eventos de desastre (com o COBRADE) e a lista de códigos COBRADE conferidos. */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  const [eventos, cobrade] = await Promise.all([listarEventos(ctx), listarCobrade()]);
  return responder({ eventos, cobrade });
});

/** Registra um evento (ADMIN e Defesa Civil): `{ nome, cobrade, inicio, fim?, decreto? }`. */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await criarEvento(ctx, await lerCorpo(req, esquemaCriarEvento)), 201);
});
