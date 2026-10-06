import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { consultar, consultarUm } from "@/lib/db";
import { dataHoraQuery, esquemaId, montarPagina, offset, z, type Paginacao } from "@/lib/validacao";

export const esquemaFiltroAuditoria = z.object({
  idUsuario: esquemaId.optional(),
  idAbrigo: esquemaId.optional(),
  acao: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z_]+$/, "Código de ação inválido.")
    .optional(),
  de: dataHoraQuery.optional(),
  ate: dataHoraQuery.optional(),
});

/**
 * RF13 / RNF03 - consulta aos logs imutáveis. ADMIN vê tudo; COORDENADOR vê
 * apenas eventos do próprio abrigo.
 */
export async function listarLogs(ctx: Contexto, filtros: z.infer<typeof esquemaFiltroAuditoria>, paginacao: Paginacao) {
  exigirPermissao(ctx.usuario, "auditoria:ver");
  const idAbrigo = ctx.usuario.papel === "ADMIN" ? (filtros.idAbrigo ?? null) : ctx.usuario.idAbrigo;

  const where = `($1::int IS NULL OR l.id_abrigo = $1)
    AND ($2::int IS NULL OR l.id_usuario = $2)
    AND ($3::text IS NULL OR l.acao = $3)
    AND ($4::timestamptz IS NULL OR l.data_hora >= $4)
    AND ($5::timestamptz IS NULL OR l.data_hora < $5)`;
  const parametros = [idAbrigo, filtros.idUsuario ?? null, filtros.acao ?? null, filtros.de ?? null, filtros.ate ?? null];

  const [linhas, total] = await Promise.all([
    consultar<{
      id: number;
      dataHora: Date;
      acao: string;
      descricao: string;
      detalhes: unknown;
      enderecoIp: string | null;
      idUsuario: number | null;
      usuario: string | null;
      idAbrigo: number | null;
      abrigo: string | null;
    }>(
      `SELECT l.id, l.data_hora AS "dataHora", l.acao, l.descricao, l.detalhes, l.endereco_ip AS "enderecoIp",
              l.id_usuario AS "idUsuario", u.nome AS usuario, l.id_abrigo AS "idAbrigo", a.nome AS abrigo
         FROM log_auditoria l
         LEFT JOIN usuario u ON u.id = l.id_usuario
         LEFT JOIN abrigo a ON a.id = l.id_abrigo
        WHERE ${where}
        ORDER BY l.data_hora DESC, l.id DESC
        LIMIT $6 OFFSET $7`,
      [...parametros, paginacao.tamanho, offset(paginacao)],
    ),
    consultarUm<{ total: number }>(`SELECT count(*) AS total FROM log_auditoria l WHERE ${where}`, parametros),
  ]);

  const itens = linhas.map(({ idUsuario, usuario, idAbrigo: idDoAbrigo, abrigo, ...log }) => ({
    ...log,
    usuario: idUsuario ? { id: idUsuario, nome: usuario } : null,
    abrigo: idDoAbrigo ? { id: idDoAbrigo, nome: abrigo } : null,
  }));
  return montarPagina(itens, total?.total ?? 0, paginacao);
}
