import type { PoolClient } from "pg";
import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { comTransacao, consultar, consultarUm, type Executor } from "@/lib/db";
import { erros } from "@/lib/http";
import {
  booleanoQuery,
  dataHoraQuery,
  esquemaId,
  montarPagina,
  offset,
  textoObrigatorio,
  textoOpcional,
  z,
  type Paginacao,
} from "@/lib/validacao";
import {
  STATUS_NECESSIDADE,
  TIPOS_MOVIMENTACAO,
  TIPOS_MOVIMENTACAO_MANUAL,
  type StatusNecessidade,
  type TipoMovimentacao,
} from "../dominio";

const LIMITE_QUANTIDADE = 100_000;

// -----------------------------------------------------------------------------
// Validação
// -----------------------------------------------------------------------------

export const esquemaFiltroEstoque = z.object({
  categoria: z.string().trim().max(40).optional(),
  incluirCatalogo: booleanoQuery.optional(),
});

/**
 * Fast-CRUD: `{ "quantidade": 1 }` (entrada) ou `{ "quantidade": -1 }` (saída).
 * O tipo é inferido pelo sinal quando omitido. AJUSTE aceita a diferença
 * (`quantidade`) ou a contagem física (`quantidadeFinal`) e exige observação.
 */
export const esquemaMovimentacao = z
  .object({
    tipo: z.enum(TIPOS_MOVIMENTACAO_MANUAL).optional(),
    quantidade: z
      .number()
      .int()
      .min(-LIMITE_QUANTIDADE)
      .max(LIMITE_QUANTIDADE)
      .refine((v) => v !== 0, "A quantidade não pode ser zero.")
      .optional(),
    quantidadeFinal: z.number().int().min(0).max(1_000_000).optional(),
    observacao: textoOpcional(500),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "AJUSTE") {
      if ((d.quantidade === undefined) === (d.quantidadeFinal === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["quantidade"],
          message: 'No AJUSTE informe "quantidade" (diferença) OU "quantidadeFinal" (contagem física).',
        });
      }
      if (!d.observacao) {
        ctx.addIssue({ code: "custom", path: ["observacao"], message: "Ajustes de inventário exigem uma justificativa." });
      }
      return;
    }

    if (d.quantidadeFinal !== undefined) {
      ctx.addIssue({ code: "custom", path: ["quantidadeFinal"], message: '"quantidadeFinal" só é aceita no tipo AJUSTE.' });
    }
    if (d.quantidade === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["quantidade"],
        message: "Informe a quantidade (positiva para entrada, negativa para saída).",
      });
      return;
    }
    if (d.tipo === "ENTRADA_DOACAO" && d.quantidade < 0) {
      ctx.addIssue({ code: "custom", path: ["quantidade"], message: "Entradas exigem quantidade positiva." });
    }
    if ((d.tipo === "SAIDA_CONSUMO" || d.tipo === "PERDA") && d.quantidade > 0) {
      ctx.addIssue({ code: "custom", path: ["quantidade"], message: "Saídas e perdas exigem quantidade negativa." });
    }
  });

export const esquemaClassificacao = z
  .object({
    statusNecessidade: z.enum(STATUS_NECESSIDADE).optional(),
    quantidadeMinima: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((d) => d.statusNecessidade !== undefined || d.quantidadeMinima !== undefined, {
    message: 'Informe "statusNecessidade" e/ou "quantidadeMinima".',
  });

export const esquemaFiltroHistorico = z.object({
  idItem: esquemaId.optional(),
  tipo: z.enum(TIPOS_MOVIMENTACAO).optional(),
  de: dataHoraQuery.optional(),
  ate: dataHoraQuery.optional(),
});

export const esquemaTransferenciaEstoque = z.object({
  idAbrigoDestino: esquemaId,
  idItem: esquemaId,
  quantidade: z.number().int().positive().max(LIMITE_QUANTIDADE),
  observacao: textoObrigatorio(500),
});

// -----------------------------------------------------------------------------
// Apoio
// -----------------------------------------------------------------------------

interface ItemBasico {
  id: number;
  nome: string;
  unidadeMedida: string;
  ativo: boolean;
}

async function exigirAbrigoAtivo(idAbrigo: number, executor: Executor): Promise<{ id: number; nome: string }> {
  const abrigo = await consultarUm<{ id: number; nome: string; ativo: boolean }>(
    "SELECT id, nome, ativo FROM abrigo WHERE id = $1",
    [idAbrigo],
    executor,
  );
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  if (!abrigo.ativo) throw erros.conflito("ABRIGO_INATIVO", `O abrigo "${abrigo.nome}" está desativado.`);
  return abrigo;
}

async function buscarItem(idItem: number, executor: Executor): Promise<ItemBasico> {
  const item = await consultarUm<ItemBasico>(
    `SELECT id, nome_micro AS nome, unidade_medida AS "unidadeMedida", ativo FROM item WHERE id = $1`,
    [idItem],
    executor,
  );
  if (!item) throw erros.naoEncontrado("Item");
  return item;
}

interface MovimentacaoRegistrada {
  id: number;
  tipo: TipoMovimentacao;
  quantidade: number;
  quantidadeResultante: number;
  dataHora: Date;
  observacao: string | null;
}

/** INSERT no livro-razão; o trigger atualiza o saldo e preenche quantidade_resultante. */
function inserirMovimentacao(
  client: PoolClient,
  dados: {
    idAbrigo: number;
    idItem: number;
    idUsuario: number;
    tipo: TipoMovimentacao;
    quantidade: number;
    observacao: string | null;
    idAbrigoContraparte?: number;
  },
) {
  return consultarUm<MovimentacaoRegistrada>(
    `INSERT INTO movimentacao_estoque
            (id_abrigo, id_item, id_usuario, tipo_movimentacao, quantidade, observacao, id_abrigo_contraparte)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tipo_movimentacao AS tipo, quantidade, quantidade_resultante AS "quantidadeResultante",
               data_hora AS "dataHora", observacao`,
    [
      dados.idAbrigo,
      dados.idItem,
      dados.idUsuario,
      dados.tipo,
      dados.quantidade,
      dados.observacao,
      dados.idAbrigoContraparte ?? null,
    ],
    client,
  ) as Promise<MovimentacaoRegistrada>;
}

const formatarDelta = (n: number) => (n > 0 ? `+${n}` : String(n));

// -----------------------------------------------------------------------------
// Casos de uso
// -----------------------------------------------------------------------------

/**
 * Estoque do abrigo. Com `incluirCatalogo=true` também lista itens ativos do
 * catálogo ainda sem registro no abrigo (quantidade 0), para a tela Fast-CRUD.
 */
export async function listarEstoque(ctx: Contexto, idAbrigo: number, filtros: z.infer<typeof esquemaFiltroEstoque>) {
  exigirPermissao(ctx.usuario, "estoque:ver", idAbrigo);
  const abrigo = await consultarUm("SELECT id FROM abrigo WHERE id = $1", [idAbrigo]);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");

  const linhas = await consultar<{
    idItem: number;
    nome: string;
    unidadeMedida: string;
    itemAtivo: boolean;
    idCategoria: number;
    categoria: string;
    categoriaSlug: string;
    quantidade: number;
    quantidadeMinima: number;
    statusNecessidade: StatusNecessidade;
    atualizadoEm: Date | null;
  }>(
    `SELECT i.id AS "idItem", i.nome_micro AS nome, i.unidade_medida AS "unidadeMedida", i.ativo AS "itemAtivo",
            c.id AS "idCategoria", c.nome_macro AS categoria, c.slug AS "categoriaSlug",
            COALESCE(e.quantidade, 0) AS quantidade,
            COALESCE(e.quantidade_minima, 0) AS "quantidadeMinima",
            COALESCE(s.codigo, 'NORMAL') AS "statusNecessidade",
            e.atualizado_em AS "atualizadoEm"
       FROM item i
       JOIN categoria_item c ON c.id = i.id_categoria
       LEFT JOIN estoque_abrigo e ON e.id_item = i.id AND e.id_abrigo = $1
       LEFT JOIN status_necessidade s ON s.id = e.id_status_necessidade
      WHERE (e.id_item IS NOT NULL OR ($2 AND i.ativo))
        AND ($3::text IS NULL OR c.slug = $3)
      ORDER BY c.nome_macro, i.nome_micro`,
    [idAbrigo, filtros.incluirCatalogo ?? false, filtros.categoria || null],
  );

  return linhas.map((linha) => ({
    ...linha,
    critico: linha.statusNecessidade === "URGENTE" || linha.quantidade < linha.quantidadeMinima,
  }));
}

/** RF02 / HU02 - entrada e saída rápida (Fast-CRUD) com histórico e auditoria. */
export async function movimentarEstoque(
  ctx: Contexto,
  idAbrigo: number,
  idItem: number,
  dados: z.infer<typeof esquemaMovimentacao>,
) {
  const tipo = dados.tipo ?? ((dados.quantidade ?? 0) > 0 ? "ENTRADA_DOACAO" : "SAIDA_CONSUMO");
  exigirPermissao(ctx.usuario, tipo === "AJUSTE" ? "estoque:ajustar" : "estoque:movimentar", idAbrigo);

  const resultado = await comTransacao(async (client) => {
    await exigirAbrigoAtivo(idAbrigo, client);
    const item = await buscarItem(idItem, client);

    let quantidade = dados.quantidade ?? 0;
    if (dados.quantidadeFinal !== undefined) {
      const atual = await consultarUm<{ quantidade: number }>(
        "SELECT quantidade FROM estoque_abrigo WHERE id_abrigo = $1 AND id_item = $2 FOR UPDATE",
        [idAbrigo, idItem],
        client,
      );
      quantidade = dados.quantidadeFinal - (atual?.quantidade ?? 0);
      if (quantidade === 0) return { item, movimentacao: null, quantidadeAtual: dados.quantidadeFinal };
    }

    if (quantidade > 0 && !item.ativo) {
      throw erros.conflito("ITEM_INATIVO", `O item "${item.nome}" foi desativado no catálogo e não aceita entradas.`);
    }

    const movimentacao = await inserirMovimentacao(client, {
      idAbrigo,
      idItem,
      idUsuario: ctx.usuario.id,
      tipo,
      quantidade,
      observacao: dados.observacao ?? null,
    });
    return { item, movimentacao, quantidadeAtual: movimentacao.quantidadeResultante };
  });

  if (resultado.movimentacao) {
    const mov = resultado.movimentacao;
    auditar(ctx, {
      acao: "ESTOQUE_MOVIMENTADO",
      descricao: `${formatarDelta(mov.quantidade)} ${resultado.item.nome} (${tipo})`,
      idAbrigo,
      detalhes: {
        idMovimentacao: mov.id,
        idItem,
        tipo,
        quantidade: mov.quantidade,
        quantidadeResultante: mov.quantidadeResultante,
      },
    });
  }

  return {
    idAbrigo,
    idItem,
    item: resultado.item.nome,
    unidadeMedida: resultado.item.unidadeMedida,
    quantidadeAtual: resultado.quantidadeAtual,
    movimentacao: resultado.movimentacao,
  };
}

/** RF03 - status de necessidade (URGENTE/NORMAL/BLOQUEADO) e estoque mínimo (RF04). */
export async function classificarItem(
  ctx: Contexto,
  idAbrigo: number,
  idItem: number,
  dados: z.infer<typeof esquemaClassificacao>,
) {
  exigirPermissao(ctx.usuario, "estoque:classificar", idAbrigo);

  const { item, antes, depois } = await comTransacao(async (client) => {
    await exigirAbrigoAtivo(idAbrigo, client);
    const item = await buscarItem(idItem, client);

    const antes = await consultarUm<{ statusNecessidade: StatusNecessidade; quantidadeMinima: number }>(
      `SELECT s.codigo AS "statusNecessidade", e.quantidade_minima AS "quantidadeMinima"
         FROM estoque_abrigo e JOIN status_necessidade s ON s.id = e.id_status_necessidade
        WHERE e.id_abrigo = $1 AND e.id_item = $2
          FOR UPDATE OF e`,
      [idAbrigo, idItem],
      client,
    );

    const status = dados.statusNecessidade ?? antes?.statusNecessidade ?? "NORMAL";
    const minima = dados.quantidadeMinima ?? antes?.quantidadeMinima ?? 0;

    const depois = await consultarUm<{
      quantidade: number;
      quantidadeMinima: number;
      statusNecessidade: StatusNecessidade;
      atualizadoEm: Date;
    }>(
      `WITH registro AS (
         INSERT INTO estoque_abrigo (id_abrigo, id_item, id_status_necessidade, quantidade_minima)
         VALUES ($1, $2, (SELECT id FROM status_necessidade WHERE codigo = $3), $4)
         ON CONFLICT (id_abrigo, id_item) DO UPDATE
            SET id_status_necessidade = EXCLUDED.id_status_necessidade,
                quantidade_minima = EXCLUDED.quantidade_minima
         RETURNING quantidade, quantidade_minima, id_status_necessidade, atualizado_em
       )
       SELECT r.quantidade, r.quantidade_minima AS "quantidadeMinima", s.codigo AS "statusNecessidade",
              r.atualizado_em AS "atualizadoEm"
         FROM registro r JOIN status_necessidade s ON s.id = r.id_status_necessidade`,
      [idAbrigo, idItem, status, minima],
      client,
    );
    return { item, antes, depois: depois! };
  });

  const statusAnterior = antes?.statusNecessidade ?? "NORMAL";
  auditar(ctx, {
    acao: "ESTOQUE_CLASSIFICADO",
    descricao:
      statusAnterior !== depois.statusNecessidade
        ? `Status de ${item.nome}: ${statusAnterior} -> ${depois.statusNecessidade}`
        : `Estoque mínimo de ${item.nome}: ${antes?.quantidadeMinima ?? 0} -> ${depois.quantidadeMinima}`,
    idAbrigo,
    detalhes: { idItem, antes: antes ?? null, depois: { statusNecessidade: depois.statusNecessidade, quantidadeMinima: depois.quantidadeMinima } },
  });

  return {
    idAbrigo,
    idItem,
    item: item.nome,
    ...depois,
    critico: depois.statusNecessidade === "URGENTE" || depois.quantidade < depois.quantidadeMinima,
  };
}

/** Histórico transacional do estoque (MOVIMENTACAO_ESTOQUE), mais recente primeiro. */
export async function listarMovimentacoes(
  ctx: Contexto,
  idAbrigo: number,
  filtros: z.infer<typeof esquemaFiltroHistorico>,
  paginacao: Paginacao,
) {
  exigirPermissao(ctx.usuario, "estoque:historico", idAbrigo);

  const where = `m.id_abrigo = $1
    AND ($2::int IS NULL OR m.id_item = $2)
    AND ($3::text IS NULL OR m.tipo_movimentacao = $3)
    AND ($4::timestamptz IS NULL OR m.data_hora >= $4)
    AND ($5::text IS NULL OR m.data_hora < CASE WHEN length($5) = 10 THEN ($5::date + 1)::timestamptz ELSE $5::timestamptz END)`;
  const parametros = [idAbrigo, filtros.idItem ?? null, filtros.tipo ?? null, filtros.de ?? null, filtros.ate ?? null];

  const [itens, total] = await Promise.all([
    consultar(
      `SELECT m.id, m.tipo_movimentacao AS tipo, m.quantidade, m.quantidade_resultante AS "quantidadeResultante",
              m.data_hora AS "dataHora", m.observacao,
              m.id_item AS "idItem", i.nome_micro AS item, i.unidade_medida AS "unidadeMedida",
              m.id_usuario AS "idUsuario", u.nome AS usuario,
              m.id_abrigo_contraparte AS "idAbrigoContraparte", ac.nome AS "abrigoContraparte"
         FROM movimentacao_estoque m
         JOIN item i ON i.id = m.id_item
         JOIN usuario u ON u.id = m.id_usuario
         LEFT JOIN abrigo ac ON ac.id = m.id_abrigo_contraparte
        WHERE ${where}
        ORDER BY m.data_hora DESC, m.id DESC
        LIMIT $6 OFFSET $7`,
      [...parametros, paginacao.tamanho, offset(paginacao)],
    ),
    consultarUm<{ total: number }>(`SELECT count(*) AS total FROM movimentacao_estoque m WHERE ${where}`, parametros),
  ]);

  return montarPagina(itens, total?.total ?? 0, paginacao);
}

/** Transferência de itens entre abrigos: saída na origem + entrada no destino, atômicas. */
export async function transferirEstoque(
  ctx: Contexto,
  idAbrigoOrigem: number,
  dados: z.infer<typeof esquemaTransferenciaEstoque>,
) {
  exigirPermissao(ctx.usuario, "estoque:transferir", idAbrigoOrigem);
  if (dados.idAbrigoDestino === idAbrigoOrigem) {
    throw erros.requisicaoInvalida("O abrigo de destino deve ser diferente do abrigo de origem.");
  }

  const resultado = await comTransacao(async (client) => {
    const origem = await exigirAbrigoAtivo(idAbrigoOrigem, client);
    const destino = await exigirAbrigoAtivo(dados.idAbrigoDestino, client);
    const item = await buscarItem(dados.idItem, client);
    if (!item.ativo) {
      throw erros.conflito("ITEM_INATIVO", `O item "${item.nome}" foi desativado no catálogo.`);
    }

    const base = { idItem: item.id, idUsuario: ctx.usuario.id, observacao: dados.observacao };
    const saida = () =>
      inserirMovimentacao(client, {
        ...base,
        idAbrigo: origem.id,
        tipo: "TRANSFERENCIA_SAIDA",
        quantidade: -dados.quantidade,
        idAbrigoContraparte: destino.id,
      });
    const entrada = () =>
      inserirMovimentacao(client, {
        ...base,
        idAbrigo: destino.id,
        tipo: "TRANSFERENCIA_ENTRADA",
        quantidade: dados.quantidade,
        idAbrigoContraparte: origem.id,
      });

    // Mesma ordem de bloqueio (menor id de abrigo primeiro) em toda transferência,
    // evitando deadlock entre transferências simultâneas em sentidos opostos.
    let movSaida: MovimentacaoRegistrada;
    let movEntrada: MovimentacaoRegistrada;
    if (origem.id < destino.id) {
      movSaida = await saida();
      movEntrada = await entrada();
    } else {
      movEntrada = await entrada();
      movSaida = await saida();
    }

    return { origem, destino, item, movSaida, movEntrada };
  });

  auditar(ctx, {
    acao: "ESTOQUE_TRANSFERIDO",
    descricao: `${dados.quantidade} ${resultado.item.nome} transferido(s) de "${resultado.origem.nome}" para "${resultado.destino.nome}"`,
    idAbrigo: idAbrigoOrigem,
    detalhes: {
      idItem: dados.idItem,
      quantidade: dados.quantidade,
      idAbrigoDestino: dados.idAbrigoDestino,
      idMovimentacaoSaida: resultado.movSaida.id,
      idMovimentacaoEntrada: resultado.movEntrada.id,
    },
  });

  return {
    item: resultado.item.nome,
    quantidade: dados.quantidade,
    origem: { id: resultado.origem.id, nome: resultado.origem.nome, quantidadeAtual: resultado.movSaida.quantidadeResultante },
    destino: {
      id: resultado.destino.id,
      nome: resultado.destino.nome,
      quantidadeAtual: resultado.movEntrada.quantidadeResultante,
    },
    movimentacoes: { saida: resultado.movSaida, entrada: resultado.movEntrada },
  };
}
