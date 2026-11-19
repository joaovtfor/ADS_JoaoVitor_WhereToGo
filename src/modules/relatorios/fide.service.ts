import { ehVisaoGlobal, exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { montarCsv, sha256, type CelulaCsv } from "@/lib/csv";
import { consultar, consultarUm } from "@/lib/db";
import { env } from "@/lib/env";
import { erros } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { CAMPO_FIDE_POR_TIPO_OCORRENCIA, DESCRICAO_TIPO_OCORRENCIA, type TipoOcorrencia } from "../dominio";
import { obterEvento, type EventoDesastre } from "./eventos.service";

// Subsídios para o FIDE (Formulário de Informações do Desastre, no S2iD) - Etapa 4.
//
// O que o WhereToGo pode afirmar: quantos DESABRIGADOS (pessoas em abrigo
// público) houve no evento, a assistência humanitária distribuída e as
// ocorrências registradas. Desalojados, feridos, mortos, enfermos e
// desaparecidos vêm de outras fontes: por isso é "subsídio", não "FIDE pronto".
//
// LGPD: só números agregados. Faixa etária com 1 a 4 pessoas sai como "menos
// de 5" (num abrigo pequeno, identificaria alguém). Nenhum nome ou CPF.

/** Contagens de 1 a 4 numa faixa etária são suprimidas. */
export const MINIMO_PARA_EXIBIR = 5;
const FUSO = "America/Sao_Paulo";

export const esquemaFiltroFide = z.object({
  idEvento: esquemaId,
  idAbrigo: esquemaId.optional(),
  formato: z.enum(["json", "csv"]).default("json"),
});

const FAIXAS = [
  { chave: "criancas", rotulo: "0 a 11 anos" },
  { chave: "adolescentes", rotulo: "12 a 17 anos" },
  { chave: "adultos", rotulo: "18 a 59 anos" },
  { chave: "idosos", rotulo: "60 anos ou mais" },
  { chave: "naoInformado", rotulo: "Idade não informada" },
] as const;

type ChaveFaixa = (typeof FAIXAS)[number]["chave"];

/** 0 ou 5+ aparecem; 1 a 4 viram `null` (suprimido). */
function suprimir(valor: number): number | null {
  return valor > 0 && valor < MINIMO_PARA_EXIBIR ? null : valor;
}

/** Período do relatório: o do evento, até hoje se ele ainda está em curso. */
async function periodoDoEvento(evento: EventoDesastre): Promise<{ inicio: string; fim: string }> {
  if (evento.fim) return { inicio: evento.inicio, fim: evento.fim };
  const hoje = await consultarUm<{ hoje: string }>(`SELECT (now() AT TIME ZONE '${FUSO}')::date AS hoje`);
  // Evento com início no futuro: o período é só o primeiro dia.
  return { inicio: evento.inicio, fim: hoje!.hoje < evento.inicio ? evento.inicio : hoje!.hoje };
}

// [inicio 00:00, fim + 1 dia 00:00) no horário de Brasília. $1 = início, $2 = fim (DATE).
const PERIODO = `
  periodo AS (
    SELECT ($1::date)::timestamp AT TIME ZONE '${FUSO}' AS ini,
           (($2::date) + 1)::timestamp AT TIME ZONE '${FUSO}' AS fim
  )`;

// Estadias que tocam o período, no escopo ($3 = abrigo ou nulo para todos).
// No escopo de um abrigo, conta quem está nele ou foi transferido de/para ele
// no período (aproximação: o histórico de transferências é a única trilha).
const ESTADIAS = `
  estadias AS (
    SELECT ab.id, COALESCE(ab.cpf, 'registro-' || ab.id) AS pessoa, ab.data_nascimento
      FROM abrigado ab, periodo p
     WHERE ab.data_entrada < p.fim AND (ab.data_saida IS NULL OR ab.data_saida >= p.ini)
       AND (
         $3::int IS NULL OR ab.id_abrigo_atual = $3 OR EXISTS (
           SELECT 1 FROM transferencia_abrigado t
            WHERE t.id_abrigado = ab.id AND $3 IN (t.id_abrigo_origem, t.id_abrigo_destino)
              AND t.data_transferencia >= p.ini AND t.data_transferencia < p.fim
         )
       )
  )`;

export interface SubsidiosFide {
  geradoEm: Date;
  geradoPor: string;
  municipio: { codigoIbge: string };
  evento: Pick<EventoDesastre, "id" | "nome" | "cobrade" | "cobradeDescricao" | "cobradeGrupo" | "decreto" | "emCurso">;
  periodo: { inicio: string; fim: string };
  escopo: { abrigo: { id: number; nome: string } | null; abrigosAtivos: number };
  danosHumanos: {
    /** Pessoas distintas (por CPF; sem CPF, por cadastro) abrigadas em algum momento do período. */
    desabrigados: number;
    presentesAgora: number;
    /** Chegaram e ainda não foram cadastradas (sem identificação; fora das demais contagens). */
    semCadastroAgora: number;
    /** Maior número de pessoas cadastradas presentes ao fim de um dia do período (só no consolidado). */
    pico: { data: string; pessoas: number } | null;
    /** Planejamento interno (fraldas, fórmula, medicamentos), não é campo do FIDE. `null` = menos de 5. */
    faixasEtarias: Array<{ chave: ChaveFaixa; rotulo: string; pessoas: number | null }>;
  };
  assistenciaHumanitaria: Array<{
    categoria: string;
    item: string;
    unidade: string;
    /** Saídas por consumo/distribuição, descontados os estornos. */
    distribuido: number;
    doacoesRecebidas: number;
    perdas: number;
  }>;
  ocorrencias: Array<{
    tipo: TipoOcorrencia;
    descricao: string;
    campoFide: string;
    registradas: number;
    aindaAtivas: number;
    abrigosAfetados: number;
    regionais: number;
  }>;
}

/**
 * Monta os subsídios do evento, no consolidado da rede (ADMIN, Defesa Civil)
 * ou de um abrigo (coordenação: sempre o próprio).
 */
export async function gerarSubsidiosFide(ctx: Contexto, filtros: { idEvento: number; idAbrigo?: number }): Promise<SubsidiosFide> {
  exigirPermissao(ctx.usuario, "relatorio:fide");
  // Coordenação só gera o do próprio abrigo, mesmo sem pedir um.
  const idAbrigo = filtros.idAbrigo ?? (ehVisaoGlobal(ctx.usuario) ? undefined : (ctx.usuario.idAbrigo ?? undefined));
  if (idAbrigo !== undefined) exigirPermissao(ctx.usuario, "relatorio:fide", idAbrigo);

  const evento = await obterEvento(ctx, filtros.idEvento);
  const { inicio, fim } = await periodoDoEvento(evento);
  const abrigo = idAbrigo !== undefined ? await consultarUm<{ id: number; nome: string }>("SELECT id, nome FROM abrigo WHERE id = $1", [idAbrigo]) : null;
  if (idAbrigo !== undefined && !abrigo) throw erros.naoEncontrado("Abrigo");
  const parametros = [inicio, fim, idAbrigo ?? null];

  const [humanos, agora, pico, assistencia, ocorrencias] = await Promise.all([
    consultarUm<{ desabrigados: number } & Record<ChaveFaixa, number>>(
      `WITH ${PERIODO}, ${ESTADIAS},
            pessoas AS (
              SELECT pessoa, max(data_nascimento) AS nascimento FROM estadias GROUP BY pessoa
            )
       SELECT count(*)::int AS desabrigados,
              count(*) FILTER (WHERE extract(year FROM age($2::date, nascimento)) < 12)::int AS criancas,
              count(*) FILTER (WHERE extract(year FROM age($2::date, nascimento)) BETWEEN 12 AND 17)::int AS adolescentes,
              count(*) FILTER (WHERE extract(year FROM age($2::date, nascimento)) BETWEEN 18 AND 59)::int AS adultos,
              count(*) FILTER (WHERE extract(year FROM age($2::date, nascimento)) >= 60)::int AS idosos,
              count(*) FILTER (WHERE nascimento IS NULL)::int AS "naoInformado"
         FROM pessoas`,
      parametros,
    ),
    consultarUm<{ presentes: number; semCadastro: number; abrigosAtivos: number }>(
      `SELECT (SELECT count(*) FROM abrigado WHERE status_acolhimento = 'PRESENTE' AND ($1::int IS NULL OR id_abrigo_atual = $1))::int AS presentes,
              (SELECT COALESCE(sum(acolhidos_nao_triados), 0) FROM abrigo WHERE $1::int IS NULL OR id = $1)::int AS "semCadastro",
              (SELECT count(*) FROM abrigo WHERE ativo AND ($1::int IS NULL OR id = $1))::int AS "abrigosAtivos"`,
      [idAbrigo ?? null],
    ),
    // Pico só no consolidado: num abrigo, as transferências tornam a série diária imprecisa.
    idAbrigo !== undefined
      ? Promise.resolve(null)
      : consultarUm<{ data: string; pessoas: number }>(
          `SELECT dia::date::text AS data,
                  count(DISTINCT COALESCE(ab.cpf, 'registro-' || ab.id))::int AS pessoas
             FROM generate_series($1::date, $2::date, interval '1 day') AS dia
             LEFT JOIN abrigado ab
               ON ab.data_entrada < (dia::date + 1)::timestamp AT TIME ZONE '${FUSO}'
              AND (ab.data_saida IS NULL OR ab.data_saida >= (dia::date + 1)::timestamp AT TIME ZONE '${FUSO}')
            GROUP BY dia
            ORDER BY pessoas DESC, dia
            LIMIT 1`,
          [inicio, fim],
        ),
    consultar<SubsidiosFide["assistenciaHumanitaria"][number]>(
      `WITH ${PERIODO}
       SELECT c.nome_macro AS categoria, i.nome_micro AS item, i.unidade_medida AS unidade,
              COALESCE(-sum(m.quantidade) FILTER (WHERE COALESCE(o.tipo_movimentacao, m.tipo_movimentacao) = 'SAIDA_CONSUMO'), 0)::int AS distribuido,
              COALESCE(sum(m.quantidade) FILTER (WHERE COALESCE(o.tipo_movimentacao, m.tipo_movimentacao) = 'ENTRADA_DOACAO'), 0)::int AS "doacoesRecebidas",
              COALESCE(-sum(m.quantidade) FILTER (WHERE COALESCE(o.tipo_movimentacao, m.tipo_movimentacao) = 'PERDA'), 0)::int AS perdas
         FROM movimentacao_estoque m
         -- Estorno conta contra o tipo da movimentação que desfez (desfazer um consumo devolve ao estoque).
         LEFT JOIN movimentacao_estoque o ON o.id = m.id_movimentacao_estornada
         JOIN item i ON i.id = m.id_item
         JOIN categoria_item c ON c.id = i.id_categoria
         CROSS JOIN periodo p
        WHERE m.data_hora >= p.ini AND m.data_hora < p.fim
          AND ($3::int IS NULL OR m.id_abrigo = $3)
          AND COALESCE(o.tipo_movimentacao, m.tipo_movimentacao) IN ('SAIDA_CONSUMO', 'ENTRADA_DOACAO', 'PERDA')
        GROUP BY c.nome_macro, i.nome_micro, i.unidade_medida
       HAVING sum(abs(m.quantidade)) > 0
        ORDER BY c.nome_macro, i.nome_micro`,
      parametros,
    ),
    consultar<{ tipo: TipoOcorrencia; registradas: number; aindaAtivas: number; abrigosAfetados: number; regionais: number }>(
      `WITH ${PERIODO}
       SELECT o.tipo, count(*)::int AS registradas,
              count(*) FILTER (WHERE o.data_resolucao IS NULL)::int AS "aindaAtivas",
              count(DISTINCT o.id_abrigo)::int AS "abrigosAfetados",
              count(*) FILTER (WHERE o.id_abrigo IS NULL)::int AS regionais
         FROM ocorrencia_infraestrutura o CROSS JOIN periodo p
        WHERE o.data_registro >= p.ini AND o.data_registro < p.fim
          AND o.status_validacao = 'APROVADA'
          AND ($3::int IS NULL OR o.id_abrigo = $3)
        GROUP BY o.tipo
        ORDER BY registradas DESC, o.tipo`,
      parametros,
    ),
  ]);

  // Distribuído, doado e perdido zerados ao mesmo tempo (estorno de tudo) não interessam.
  const itens = assistencia.filter((a) => a.distribuido !== 0 || a.doacoesRecebidas !== 0 || a.perdas !== 0);

  const relatorio: SubsidiosFide = {
    geradoEm: new Date(),
    geradoPor: ctx.usuario.nome,
    municipio: { codigoIbge: env().MUNICIPIO_CODIGO_IBGE },
    evento: {
      id: evento.id,
      nome: evento.nome,
      cobrade: evento.cobrade,
      cobradeDescricao: evento.cobradeDescricao,
      cobradeGrupo: evento.cobradeGrupo,
      decreto: evento.decreto,
      emCurso: evento.emCurso,
    },
    periodo: { inicio, fim },
    escopo: { abrigo, abrigosAtivos: agora!.abrigosAtivos },
    danosHumanos: {
      desabrigados: humanos!.desabrigados,
      presentesAgora: agora!.presentes,
      semCadastroAgora: agora!.semCadastro,
      pico: pico && pico.pessoas > 0 ? pico : null,
      faixasEtarias: FAIXAS.map((faixa) => ({ ...faixa, pessoas: suprimir(humanos![faixa.chave]) })),
    },
    assistenciaHumanitaria: itens,
    ocorrencias: ocorrencias.map((o) => ({
      ...o,
      descricao: DESCRICAO_TIPO_OCORRENCIA[o.tipo],
      campoFide: CAMPO_FIDE_POR_TIPO_OCORRENCIA[o.tipo],
    })),
  };
  return relatorio;
}

const formatarData = (data: string) => data.split("-").reverse().join("/");

/** CSV para anexar ao processo no S2iD (planilha em português, separador ";"). */
export function montarCsvFide(r: SubsidiosFide): string {
  const linhas: CelulaCsv[][] = [
    ["WhereToGo · Subsídios para o FIDE (S2iD)"],
    ["Evento", r.evento.nome],
    ["COBRADE", `${r.evento.cobrade} ${r.evento.cobradeDescricao}`],
    ["Decreto", r.evento.decreto ?? "não informado"],
    ["Período", `${formatarData(r.periodo.inicio)} a ${formatarData(r.periodo.fim)}${r.evento.emCurso ? " (evento em curso)" : ""}`],
    ["Município (código IBGE)", r.municipio.codigoIbge],
    ["Escopo", r.escopo.abrigo ? `Abrigo: ${r.escopo.abrigo.nome}` : `Todos os abrigos (${r.escopo.abrigosAtivos} ativos)`],
    ["Gerado em", r.geradoEm.toLocaleString("pt-BR", { timeZone: FUSO }), "por", r.geradoPor],
    [],
    ["Danos humanos: só desabrigados (pessoas em abrigo público)", "Pessoas"],
    ["Desabrigados no período (pessoas distintas)", r.danosHumanos.desabrigados],
    ["Presentes agora", r.danosHumanos.presentesAgora],
    ["Chegaram e ainda sem cadastro (agora)", r.danosHumanos.semCadastroAgora],
    ...(r.danosHumanos.pico
      ? [["Pico de desabrigados presentes", r.danosHumanos.pico.pessoas, "em", formatarData(r.danosHumanos.pico.data)] as CelulaCsv[]]
      : []),
    [],
    ["Faixa etária (planejamento interno, não é campo do FIDE)", "Pessoas"],
    ...r.danosHumanos.faixasEtarias.map((f) => [f.rotulo, f.pessoas ?? `menos de ${MINIMO_PARA_EXIBIR}`]),
    [],
    ["Assistência humanitária"],
    ["Categoria", "Item", "Unidade", "Distribuído", "Doações recebidas", "Perdas"],
    ...(r.assistenciaHumanitaria.length > 0
      ? r.assistenciaHumanitaria.map((a) => [a.categoria, a.item, a.unidade, a.distribuido, a.doacoesRecebidas, a.perdas])
      : [["Nenhuma movimentação no período"]]),
    [],
    ["Ocorrências aprovadas no período"],
    ["Tipo", "Campo sugerido no FIDE", "Registradas", "Ainda ativas", "Abrigos afetados", "Regionais"],
    ...(r.ocorrencias.length > 0
      ? r.ocorrencias.map((o) => [o.descricao, o.campoFide, o.registradas, o.aindaAtivas, o.abrigosAfetados, o.regionais])
      : [["Nenhuma ocorrência no período"]]),
    [],
    ["Observações"],
    ["Desalojados, feridos, enfermos, mortos e desaparecidos não são registrados no WhereToGo: vêm de outras fontes da Defesa Civil."],
    [`Faixas etárias com 1 a ${MINIMO_PARA_EXIBIR - 1} pessoas aparecem como "menos de ${MINIMO_PARA_EXIBIR}" (LGPD).`],
    ["Os campos sugeridos no FIDE e os códigos COBRADE devem ser conferidos no formulário vigente do S2iD."],
  ];
  return montarCsv(linhas);
}

/** Registra a geração (quem, evento, escopo, formato e, no CSV, o hash do arquivo). */
export function auditarGeracaoFide(ctx: Contexto, r: SubsidiosFide, formato: "json" | "csv", csv?: string) {
  auditar(ctx, {
    acao: "RELATORIO_FIDE_GERADO",
    descricao: `Subsídios FIDE do evento "${r.evento.nome}" (${r.escopo.abrigo ? r.escopo.abrigo.nome : "todos os abrigos"}, ${formato.toUpperCase()})`,
    idAbrigo: r.escopo.abrigo?.id ?? null,
    detalhes: { idEvento: r.evento.id, periodo: r.periodo, formato, ...(csv ? { sha256: sha256(csv) } : {}) },
  });
}
