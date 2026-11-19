import { ehVisaoGlobal, exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar, type AcaoAuditoria } from "@/lib/auditoria";
import { montarCsv, sha256, type CelulaCsv } from "@/lib/csv";
import { consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";

// Prestação de contas (TCE / CGU / FMPDC) - Etapa 4.
//
// Um CSV com todas as movimentações de estoque do período (doações, consumo,
// perdas, transferências, ajustes e estornos) e os eventos críticos da
// auditoria (mudança de cadastro/PIX de abrigo, estornos, transferências,
// contas, exportações anteriores). O SHA-256 do arquivo entregue é gravado na
// auditoria no momento da exportação: sem esse registro, qualquer um poderia
// editar a planilha e recalcular o hash.

const FUSO = "America/Sao_Paulo";
/** Acima disto o período deve ser dividido (planilha grande demais para conferência). */
export const LIMITE_LINHAS = 50_000;

/** Eventos da auditoria que interessam a quem fiscaliza doações e compras. */
export const ACOES_CRITICAS: readonly AcaoAuditoria[] = [
  "ABRIGO_CRIADO",
  "ABRIGO_ATUALIZADO",
  "ESTOQUE_ESTORNADO",
  "ESTOQUE_TRANSFERIDO",
  "USUARIO_CRIADO",
  "USUARIO_ATUALIZADO",
  "RELATORIO_FIDE_GERADO",
  "PRESTACAO_CONTAS_EXPORTADA",
];

const esquemaData = z.iso.date("Data inválida (use AAAA-MM-DD).");

export const esquemaPrestacaoContas = z
  .object({
    inicio: esquemaData,
    fim: esquemaData,
    idAbrigo: esquemaId.optional(),
  })
  .refine((d) => d.fim >= d.inicio, { message: "O fim não pode ser antes do início.", path: ["fim"] })
  .refine((d) => (Date.parse(d.fim) - Date.parse(d.inicio)) / 86_400_000 <= 366, {
    message: "Exporte no máximo um ano por vez.",
    path: ["fim"],
  });

interface LinhaPrestacao {
  registro: "MOVIMENTACAO" | "AUDITORIA";
  id: string;
  dataHora: string;
  abrigo: string | null;
  tipo: string;
  item: string | null;
  unidade: string | null;
  quantidade: number | null;
  saldo: number | null;
  contraparte: string | null;
  usuario: string | null;
  descricao: string | null;
}

export interface PrestacaoContas {
  csv: string;
  sha256: string;
  linhas: number;
  nomeArquivo: string;
}

export async function gerarPrestacaoContas(ctx: Contexto, filtros: z.infer<typeof esquemaPrestacaoContas>): Promise<PrestacaoContas> {
  exigirPermissao(ctx.usuario, "relatorio:prestacao-contas");
  const idAbrigo = filtros.idAbrigo ?? (ehVisaoGlobal(ctx.usuario) ? undefined : (ctx.usuario.idAbrigo ?? undefined));
  if (idAbrigo !== undefined) exigirPermissao(ctx.usuario, "relatorio:prestacao-contas", idAbrigo);

  const abrigo = idAbrigo !== undefined ? await consultarUm<{ nome: string }>("SELECT nome FROM abrigo WHERE id = $1", [idAbrigo]) : null;
  if (idAbrigo !== undefined && !abrigo) throw erros.naoEncontrado("Abrigo");

  const linhas = await consultar<LinhaPrestacao>(
    `WITH periodo AS (
       SELECT ($1::date)::timestamp AT TIME ZONE '${FUSO}' AS ini,
              (($2::date) + 1)::timestamp AT TIME ZONE '${FUSO}' AS fim
     )
     SELECT * FROM (
       SELECT 'MOVIMENTACAO' AS registro, m.id::text AS id, m.data_hora AS ordem,
              to_char(m.data_hora AT TIME ZONE '${FUSO}', 'YYYY-MM-DD HH24:MI:SS') AS "dataHora",
              a.nome AS abrigo, m.tipo_movimentacao AS tipo, i.nome_micro AS item, i.unidade_medida AS unidade,
              m.quantidade, m.quantidade_resultante AS saldo, ac.nome AS contraparte, u.nome AS usuario,
              NULLIF(concat_ws(' · ', m.observacao,
                CASE WHEN m.id_movimentacao_estornada IS NOT NULL THEN 'estorno da movimentação #' || m.id_movimentacao_estornada END), '') AS descricao
         FROM movimentacao_estoque m
         JOIN abrigo a ON a.id = m.id_abrigo
         JOIN item i ON i.id = m.id_item
         JOIN usuario u ON u.id = m.id_usuario
         LEFT JOIN abrigo ac ON ac.id = m.id_abrigo_contraparte
         CROSS JOIN periodo p
        WHERE m.data_hora >= p.ini AND m.data_hora < p.fim AND ($3::int IS NULL OR m.id_abrigo = $3)
       UNION ALL
       SELECT 'AUDITORIA', l.id::text, l.data_hora,
              to_char(l.data_hora AT TIME ZONE '${FUSO}', 'YYYY-MM-DD HH24:MI:SS'),
              a.nome, l.acao, NULL, NULL, NULL, NULL, NULL, u.nome, l.descricao
         FROM log_auditoria l
         LEFT JOIN abrigo a ON a.id = l.id_abrigo
         LEFT JOIN usuario u ON u.id = l.id_usuario
         CROSS JOIN periodo p
        WHERE l.data_hora >= p.ini AND l.data_hora < p.fim AND l.acao = ANY($4::text[])
          AND ($3::int IS NULL OR l.id_abrigo = $3)
     ) linhas
     ORDER BY ordem, registro, id::bigint
     LIMIT ${LIMITE_LINHAS + 1}`,
    [filtros.inicio, filtros.fim, idAbrigo ?? null, ACOES_CRITICAS],
  );
  if (linhas.length > LIMITE_LINHAS) {
    throw erros.regraDeNegocio("PERIODO_GRANDE_DEMAIS", `O período tem mais de ${LIMITE_LINHAS.toLocaleString("pt-BR")} registros. Exporte em partes menores.`);
  }

  const cabecalho: CelulaCsv[][] = [
    ["WhereToGo · Prestação de contas (movimentações de estoque e eventos críticos da auditoria)"],
    ["Período", `${filtros.inicio} a ${filtros.fim} (horário de Brasília)`],
    ["Escopo", abrigo ? `Abrigo: ${abrigo.nome}` : "Todos os abrigos"],
    ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: FUSO }), "por", ctx.usuario.nome],
    [],
    ["registro", "id", "data_hora", "abrigo", "tipo", "item", "unidade", "quantidade", "saldo_resultante", "abrigo_contraparte", "usuario", "descricao"],
  ];
  const csv = montarCsv([
    ...cabecalho,
    ...linhas.map((l) => [l.registro, l.id, l.dataHora, l.abrigo, l.tipo, l.item, l.unidade, l.quantidade, l.saldo, l.contraparte, l.usuario, l.descricao]),
  ]);
  const hash = sha256(csv);
  const escopo = idAbrigo !== undefined ? `abrigo-${idAbrigo}` : "rede";

  auditar(ctx, {
    acao: "PRESTACAO_CONTAS_EXPORTADA",
    descricao: `Prestação de contas ${filtros.inicio} a ${filtros.fim} (${abrigo ? abrigo.nome : "todos os abrigos"}): ${linhas.length} registro(s), SHA-256 ${hash}`,
    idAbrigo: idAbrigo ?? null,
    detalhes: { inicio: filtros.inicio, fim: filtros.fim, idAbrigo: idAbrigo ?? null, linhas: linhas.length, sha256: hash },
  });

  return { csv, sha256: hash, linhas: linhas.length, nomeArquivo: `prestacao-contas_${escopo}_${filtros.inicio}_${filtros.fim}.csv` };
}
