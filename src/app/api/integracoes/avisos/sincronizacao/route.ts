import { auditar } from "@/lib/auditoria";
import { exigirPermissao } from "@/lib/auth/rbac";
import { exigirContexto } from "@/lib/auth/sessao";
import { responder, rota } from "@/lib/http";
import { listarAvisosVigentes, obterEstadoIntegracao, sincronizarAvisosInmet } from "@/modules/integracoes/avisos.service";

/**
 * "Consultar agora" (ADMIN): consulta o INMET na hora, ignorando o intervalo
 * mínimo e a pausa por falhas. Por ser POST, o `rota()` invalida o cache do
 * mapa público ao final.
 */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  exigirPermissao(ctx.usuario, "aviso:sincronizar");

  const resultado = await sincronizarAvisosInmet({ forcar: true });
  auditar(ctx, {
    acao: "AVISOS_CONSULTADOS",
    descricao: resultado.situacao === "ok" ? `Consulta ao INMET: ${resultado.doMunicipio} aviso(s) para o município` : `Consulta ao INMET: ${resultado.situacao}`,
    detalhes: { ...resultado },
  });

  const [avisos, estado] = await Promise.all([listarAvisosVigentes(), obterEstadoIntegracao()]);
  return responder({ resultado, avisos, estado });
});
