import { exigirPermissao } from "@/lib/auth/rbac";
import { exigirContexto } from "@/lib/auth/sessao";
import { responder, rota } from "@/lib/http";
import { agendarSincronizacaoAvisos } from "@/modules/integracoes/avisos.agendamento";
import { listarAvisosVigentes, obterEstadoIntegracao } from "@/modules/integracoes/avisos.service";

/** Painel: avisos do INMET e a situação da consulta (última, falhas, pausa). */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  exigirPermissao(ctx.usuario, "aviso:ver");
  agendarSincronizacaoAvisos();
  const [avisos, estado] = await Promise.all([listarAvisosVigentes(), obterEstadoIntegracao()]);
  return responder({ avisos, estado }, 200, { "Cache-Control": "no-store" });
});
