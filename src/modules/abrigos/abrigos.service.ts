import { exigirPermissao, type Contexto } from "@/lib/auth/rbac";
import { auditar } from "@/lib/auditoria";
import { comTransacao, consultar, consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { escaparIlike, montarAtualizacao } from "@/lib/sql";
import { booleanoQuery, textoObrigatorio, textoOpcional, z } from "@/lib/validacao";
import type { StatusInfraestrutura } from "../dominio";
import { resumirOcupacao } from "./ocupacao";

// -----------------------------------------------------------------------------
// Validação
// -----------------------------------------------------------------------------

const camposAbrigo = {
  nome: textoObrigatorio(150),
  endereco: textoObrigatorio(255),
  telefone: textoOpcional(20),
  chavePix: textoOpcional(140),
  titularPix: textoOpcional(150),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  capacidadeMaxima: z.number().int().positive().max(100_000),
  acolhidosNaoTriados: z.number().int().min(0).max(100_000).optional(),
};

const pixCompleto = (d: { chavePix?: string | null; titularPix?: string | null }) => !d.chavePix === !d.titularPix;
const MENSAGEM_PIX = "Informe a chave PIX e o titular juntos (ou nenhum dos dois).";

export const esquemaCriarAbrigo = z
  .object(camposAbrigo)
  .refine(pixCompleto, { message: MENSAGEM_PIX, path: ["titularPix"] });

export const esquemaAtualizarAbrigo = z
  .object({ ...camposAbrigo, ativo: z.boolean() })
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Informe ao menos um campo para atualizar.");

export const esquemaFiltroAbrigos = z.object({
  ativo: booleanoQuery.optional(),
  busca: z.string().trim().max(100).optional(),
});

/** Campos que o COORDENADOR pode alterar no próprio abrigo; os demais são do ADMIN. */
const CAMPOS_OPERACIONAIS = new Set(["telefone", "capacidadeMaxima", "acolhidosNaoTriados"]);

const COLUNAS_EDITAVEIS: Record<string, string> = {
  nome: "nome",
  endereco: "endereco",
  telefone: "telefone",
  chavePix: "chave_pix",
  titularPix: "titular_pix",
  latitude: "latitude",
  longitude: "longitude",
  capacidadeMaxima: "capacidade_maxima",
  acolhidosNaoTriados: "acolhidos_nao_triados",
  ativo: "ativo",
};

// -----------------------------------------------------------------------------
// Consulta e apresentação
// -----------------------------------------------------------------------------

/** Colunas do abrigo com aliases camelCase (`prefixo` = alias da tabela na consulta). */
function colunasAbrigo(prefixo = "a.") {
  const p = prefixo;
  return `
  ${p}id, ${p}nome, ${p}endereco, ${p}telefone, ${p}chave_pix AS "chavePix", ${p}titular_pix AS "titularPix",
  ${p}latitude, ${p}longitude, ${p}capacidade_maxima AS "capacidadeMaxima", ${p}lotacao_atual AS "lotacaoAtual",
  ${p}acolhidos_nao_triados AS "acolhidosNaoTriados", ${p}status_infraestrutura AS "statusInfraestrutura",
  ${p}ativo, ${p}criado_em AS "criadoEm", ${p}atualizado_em AS "atualizadoEm"`;
}

const COLUNAS_ABRIGO = colunasAbrigo();
const COLUNAS_RETORNO = colunasAbrigo("");

interface LinhaAbrigo {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  chavePix: string | null;
  titularPix: string | null;
  latitude: number;
  longitude: number;
  capacidadeMaxima: number;
  lotacaoAtual: number;
  acolhidosNaoTriados: number;
  statusInfraestrutura: StatusInfraestrutura;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

function apresentar(linha: LinhaAbrigo) {
  return { ...linha, ocupacao: resumirOcupacao(linha.lotacaoAtual, linha.capacidadeMaxima) };
}

export type Abrigo = ReturnType<typeof apresentar>;

async function buscarPorId(id: number): Promise<LinhaAbrigo | null> {
  return consultarUm<LinhaAbrigo>(`SELECT ${COLUNAS_ABRIGO} FROM abrigo a WHERE a.id = $1`, [id]);
}

// -----------------------------------------------------------------------------
// Casos de uso
// -----------------------------------------------------------------------------

/** ADMIN vê todos; COORDENADOR/VOLUNTARIO veem apenas o próprio abrigo. */
export async function listarAbrigos(ctx: Contexto, filtros: z.infer<typeof esquemaFiltroAbrigos>) {
  exigirPermissao(ctx.usuario, "abrigo:ver");
  const idRestrito = ctx.usuario.papel === "ADMIN" ? null : ctx.usuario.idAbrigo;
  const termo = filtros.busca ? escaparIlike(filtros.busca) : null;

  const linhas = await consultar<LinhaAbrigo>(
    `SELECT ${COLUNAS_ABRIGO}
       FROM abrigo a
      WHERE ($1::int IS NULL OR a.id = $1)
        AND ($2::boolean IS NULL OR a.ativo = $2)
        AND ($3::text IS NULL OR a.nome ILIKE '%' || $3 || '%' OR a.endereco ILIKE '%' || $3 || '%')
      ORDER BY a.nome`,
    [idRestrito, filtros.ativo ?? null, termo],
  );
  return linhas.map(apresentar);
}

export async function obterAbrigo(ctx: Contexto, id: number): Promise<Abrigo> {
  exigirPermissao(ctx.usuario, "abrigo:ver", id);
  const linha = await buscarPorId(id);
  if (!linha) throw erros.naoEncontrado("Abrigo");
  return apresentar(linha);
}

export async function criarAbrigo(ctx: Contexto, dados: z.infer<typeof esquemaCriarAbrigo>): Promise<Abrigo> {
  exigirPermissao(ctx.usuario, "abrigo:criar");
  const naoTriados = dados.acolhidosNaoTriados ?? 0;
  if (naoTriados > dados.capacidadeMaxima) {
    throw erros.conflito(
      "CAPACIDADE_ABAIXO_DA_LOTACAO",
      `O número de acolhidos não triados (${naoTriados}) não pode exceder a capacidade máxima (${dados.capacidadeMaxima}).`,
    );
  }

  const linha = await consultarUm<LinhaAbrigo>(
    `INSERT INTO abrigo (nome, endereco, telefone, chave_pix, titular_pix, latitude, longitude, capacidade_maxima, lotacao_atual, acolhidos_nao_triados)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     RETURNING ${COLUNAS_RETORNO}`,
    [
      dados.nome,
      dados.endereco,
      dados.telefone ?? null,
      dados.chavePix ?? null,
      dados.titularPix ?? null,
      dados.latitude,
      dados.longitude,
      dados.capacidadeMaxima,
      naoTriados,
    ],
  );

  auditar(ctx, {
    acao: "ABRIGO_CRIADO",
    descricao: `Abrigo "${dados.nome}" cadastrado`,
    idAbrigo: linha!.id,
    detalhes: { ...dados },
  });
  return apresentar(linha!);
}

/**
 * ADMIN altera qualquer campo. COORDENADOR altera apenas telefone, capacidade e
 * acolhidosNaoTriados do próprio abrigo (dados cadastrais e a chave PIX oficial
 * ficam com o ADMIN, evitando desvio de doações por conta comprometida).
 */
export async function atualizarAbrigo(ctx: Contexto, id: number, dados: z.infer<typeof esquemaAtualizarAbrigo>) {
  const campos = Object.keys(dados).filter((c) => dados[c as keyof typeof dados] !== undefined);
  const somenteOperacionais = campos.every((c) => CAMPOS_OPERACIONAIS.has(c));
  exigirPermissao(ctx.usuario, somenteOperacionais ? "abrigo:editar-operacao" : "abrigo:editar-cadastro", id);

  const atualizado = await comTransacao(async (client) => {
    const atual = await consultarUm<LinhaAbrigo>(`SELECT ${COLUNAS_ABRIGO} FROM abrigo a WHERE a.id = $1 FOR UPDATE`, [id], client);
    if (!atual) throw erros.naoEncontrado("Abrigo");

    const final = { ...atual, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined)) };
    if (!pixCompleto(final)) throw erros.requisicaoInvalida(MENSAGEM_PIX);

    const lotacaoNominal = atual.lotacaoAtual - atual.acolhidosNaoTriados;
    const lotacaoResultante = lotacaoNominal + final.acolhidosNaoTriados;

    if (final.capacidadeMaxima < lotacaoResultante) {
      throw erros.conflito(
        "CAPACIDADE_ABAIXO_DA_LOTACAO",
        `A capacidade (${final.capacidadeMaxima}) não pode ser menor que a lotação resultante (${lotacaoResultante} pessoas).`,
      );
    }
    if (dados.ativo === false && lotacaoResultante > 0) {
      throw erros.conflito(
        "ABRIGO_COM_ABRIGADOS",
        "Não é possível desativar um abrigo com pessoas presentes. Transfira ou desligue os abrigados antes.",
      );
    }

    const { sets, valores } = montarAtualizacao(dados, COLUNAS_EDITAVEIS, 2);
    const linha = await consultarUm<LinhaAbrigo>(
      `UPDATE abrigo SET ${sets.join(", ")} WHERE id = $1 RETURNING ${COLUNAS_RETORNO}`,
      [id, ...valores],
      client,
    );
    return { antes: atual, depois: linha! };
  });

  auditar(ctx, {
    acao: "ABRIGO_ATUALIZADO",
    descricao: `Abrigo "${atualizado.depois.nome}" atualizado (${campos.join(", ")})`,
    idAbrigo: id,
    detalhes: {
      alteracoes: Object.fromEntries(
        campos.map((c) => [c, { de: atualizado.antes[c as keyof LinhaAbrigo], para: atualizado.depois[c as keyof LinhaAbrigo] }]),
      ),
    },
  });
  return apresentar(atualizado.depois);
}

/** RF04 - Dashboard de triagem do coordenador. */
export async function obterDashboard(ctx: Contexto, id: number) {
  exigirPermissao(ctx.usuario, "abrigo:dashboard", id);
  const abrigo = await buscarPorId(id);
  if (!abrigo) throw erros.naoEncontrado("Abrigo");

  const [acolhidos, transferencias, itensCriticos, resumoEstoque, ocorrencias, movimentacoes] = await Promise.all([
    consultarUm<{ presentes: number; entradas24h: number; desligados24h: number }>(
      `SELECT count(*) FILTER (WHERE ab.status_acolhimento = 'PRESENTE') AS presentes,
              count(*) FILTER (
                WHERE ab.status_acolhimento = 'PRESENTE'
                  AND ab.data_entrada >= now() - interval '24 hours'
                  AND NOT EXISTS (
                    SELECT 1 FROM transferencia_abrigado t
                     WHERE t.id_abrigado = ab.id
                       AND t.id_abrigo_destino = $1
                       AND t.data_transferencia >= ab.data_entrada
                  )
              ) AS "entradas24h",
              count(*) FILTER (WHERE ab.data_saida >= now() - interval '24 hours') AS "desligados24h"
         FROM abrigado ab WHERE ab.id_abrigo_atual = $1`,
      [id],
    ),
    consultarUm<{ recebidas24h: number; enviadas24h: number }>(
      `SELECT count(*) FILTER (WHERE id_abrigo_destino = $1) AS "recebidas24h",
              count(*) FILTER (WHERE id_abrigo_origem = $1) AS "enviadas24h"
         FROM transferencia_abrigado
        WHERE (id_abrigo_origem = $1 OR id_abrigo_destino = $1)
          AND data_transferencia >= now() - interval '24 hours'`,
      [id],
    ),
    consultar<{
      idItem: number;
      nome: string;
      unidadeMedida: string;
      categoria: string;
      quantidade: number;
      quantidadeMinima: number;
      statusNecessidade: string;
    }>(
      `SELECT e.id_item AS "idItem", i.nome_micro AS nome, i.unidade_medida AS "unidadeMedida", c.slug AS categoria,
              e.quantidade, e.quantidade_minima AS "quantidadeMinima", s.codigo AS "statusNecessidade"
         FROM estoque_abrigo e
         JOIN item i ON i.id = e.id_item
         JOIN categoria_item c ON c.id = i.id_categoria
         JOIN status_necessidade s ON s.id = e.id_status_necessidade
        WHERE e.id_abrigo = $1
          AND (s.codigo = 'URGENTE' OR e.quantidade < e.quantidade_minima)
        ORDER BY s.nivel_prioridade, e.quantidade - e.quantidade_minima, i.nome_micro`,
      [id],
    ),
    consultarUm<{ itensEmEstoque: number; itensUrgentes: number; itensBloqueados: number }>(
      `SELECT count(*) FILTER (WHERE e.quantidade > 0) AS "itensEmEstoque",
              count(*) FILTER (WHERE s.codigo = 'URGENTE') AS "itensUrgentes",
              count(*) FILTER (WHERE s.codigo = 'BLOQUEADO') AS "itensBloqueados"
         FROM estoque_abrigo e JOIN status_necessidade s ON s.id = e.id_status_necessidade
        WHERE e.id_abrigo = $1`,
      [id],
    ),
    consultar(
      `SELECT id, tipo, gravidade, descricao, latitude, longitude, data_registro AS "dataRegistro"
         FROM ocorrencia_infraestrutura
        WHERE id_abrigo = $1 AND data_resolucao IS NULL
        ORDER BY gravidade DESC, data_registro`,
      [id],
    ),
    consultar(
      `SELECT m.id, m.tipo_movimentacao AS tipo, m.quantidade, m.quantidade_resultante AS "quantidadeResultante",
              m.data_hora AS "dataHora", i.nome_micro AS item, u.nome AS usuario
         FROM movimentacao_estoque m
         JOIN item i ON i.id = m.id_item
         JOIN usuario u ON u.id = m.id_usuario
        WHERE m.id_abrigo = $1
        ORDER BY m.data_hora DESC, m.id DESC
        LIMIT 10`,
      [id],
    ),
  ]);

  return {
    abrigo: { id: abrigo.id, nome: abrigo.nome, ativo: abrigo.ativo, statusInfraestrutura: abrigo.statusInfraestrutura },
    ocupacao: resumirOcupacao(abrigo.lotacaoAtual, abrigo.capacidadeMaxima),
    acolhidos: { ...acolhidos!, naoTriados: abrigo.acolhidosNaoTriados, ...transferencias! },
    estoque: {
      ...resumoEstoque!,
      itensCriticos: itensCriticos.map((item) => ({
        ...item,
        motivo: item.statusNecessidade === "URGENTE" ? "URGENTE" : "ABAIXO_DO_MINIMO",
      })),
    },
    ocorrenciasAtivas: ocorrencias,
    ultimasMovimentacoes: movimentacoes,
  };
}
