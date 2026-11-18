import type { PoolClient } from "pg";
import { consultar, consultarUm, pool } from "@/lib/db";
import { env } from "@/lib/env";
import { baixarAvisosInmet, FONTE_INMET, lerAvisosInmet, type AvisoNormalizado, type SeveridadeAviso } from "./inmet";

// Avisos oficiais (INMET): sincronização sob demanda e leitura para o mapa e o painel.
// Não há worker em segundo plano: no plano gratuito do Render o serviço dorme
// após 15 min sem tráfego. Quem dispara a consulta é a própria leitura do mapa
// (ver `avisos.agendamento.ts`), no máximo a cada INTERVALO_AVISOS_MIN.

/** Chave do advisory lock: uma sincronização por vez, mesmo com várias instâncias. */
const CHAVE_LOCK = 4_314_100_011;
/** Circuit breaker: falhas seguidas até pausar a fonte, e por quanto tempo. */
export const FALHAS_PARA_PAUSAR = 3;
const PAUSA_MINUTOS = 15;

export type ResultadoSincronizacao =
  | { situacao: "desativada" | "em-andamento" | "recente" | "pausada" }
  | { situacao: "ok"; recebidos: number; doMunicipio: number; descartados: number; alterados: number }
  | { situacao: "falha"; erro: string; falhasConsecutivas: number; pausadaAte: Date | null };

export interface OpcoesSincronizacao {
  /** Ignora o intervalo mínimo e a pausa do breaker (botão "Consultar agora"). */
  forcar?: boolean;
  /** Substitui o download (testes). */
  baixar?: () => Promise<unknown>;
}

export interface EstadoIntegracao {
  ativa: boolean;
  municipio: string;
  intervaloMin: number;
  ultimaTentativa: Date | null;
  ultimoSucesso: Date | null;
  falhasConsecutivas: number;
  pausadaAte: Date | null;
  ultimoErro: string | null;
}

/** Aviso exibido no mapa e no painel: só o necessário (payload leve em 3G). */
export interface AvisoOficial {
  id: number;
  fonte: string;
  evento: string;
  severidade: SeveridadeAviso;
  rotuloSeveridade: string;
  inicio: Date;
  fim: Date;
  riscos: string[];
  instrucoes: string[];
  link: string | null;
  atualizadoEm: Date;
}

function mensagemDe(erro: unknown): string {
  if (erro instanceof Error) {
    // fetch com AbortSignal.timeout rejeita com TimeoutError; falha de DNS/conexão vira "fetch failed".
    if (erro.name === "TimeoutError") return "O INMET não respondeu em 8 s.";
    const causa = (erro as Error & { cause?: { code?: string } }).cause?.code;
    return causa ? `${erro.message} (${causa})` : erro.message;
  }
  return String(erro);
}

async function registrarFalha(client: PoolClient, erro: unknown): Promise<ResultadoSincronizacao> {
  const mensagem = mensagemDe(erro).slice(0, 500);
  const { rows } = await client.query<{ falhas: number; pausadaAte: Date | null }>(
    `UPDATE integracao_estado
        SET falhas_consecutivas = falhas_consecutivas + 1,
            pausada_ate = CASE WHEN falhas_consecutivas + 1 >= $2
                               THEN now() + make_interval(mins => $3)
                               ELSE pausada_ate END,
            ultimo_erro = $1
      WHERE fonte = $4
      RETURNING falhas_consecutivas AS falhas, pausada_ate AS "pausadaAte"`,
    [mensagem, FALHAS_PARA_PAUSAR, PAUSA_MINUTOS, FONTE_INMET],
  );
  console.warn(`[avisos] falha ao consultar o INMET: ${mensagem}`);
  return { situacao: "falha", erro: mensagem, falhasConsecutivas: rows[0]?.falhas ?? 0, pausadaAte: rows[0]?.pausadaAte ?? null };
}

/**
 * Grava os avisos do município numa transação: insere os novos, atualiza os
 * que mudaram (nunca volta para uma sequência mais antiga) e encerra os que a
 * fonte deixou de listar. Retorna quantos registros mudaram de fato.
 */
async function gravarAvisos(client: PoolClient, avisos: AvisoNormalizado[]): Promise<number> {
  await client.query("BEGIN");
  try {
    let alterados = 0;
    for (const aviso of avisos) {
      const { rowCount } = await client.query(
        `INSERT INTO aviso_oficial (
           fonte, id_externo, sequencia, identificador_cap, evento, severidade, rotulo_severidade,
           cor, inicio, fim, riscos, instrucoes, link, encerrado_em
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CASE WHEN $14::boolean THEN now() END)
         ON CONFLICT (fonte, id_externo) DO UPDATE
            SET sequencia = EXCLUDED.sequencia,
                identificador_cap = EXCLUDED.identificador_cap,
                evento = EXCLUDED.evento,
                severidade = EXCLUDED.severidade,
                rotulo_severidade = EXCLUDED.rotulo_severidade,
                cor = EXCLUDED.cor,
                inicio = EXCLUDED.inicio,
                fim = EXCLUDED.fim,
                riscos = EXCLUDED.riscos,
                instrucoes = EXCLUDED.instrucoes,
                link = EXCLUDED.link,
                encerrado_em = CASE WHEN EXCLUDED.encerrado_em IS NULL THEN NULL
                                    ELSE COALESCE(aviso_oficial.encerrado_em, EXCLUDED.encerrado_em) END,
                atualizado_em = now()
          WHERE EXCLUDED.sequencia >= aviso_oficial.sequencia
            AND (aviso_oficial.sequencia, aviso_oficial.identificador_cap, aviso_oficial.evento, aviso_oficial.severidade,
                 aviso_oficial.rotulo_severidade, aviso_oficial.cor, aviso_oficial.inicio, aviso_oficial.fim,
                 aviso_oficial.riscos, aviso_oficial.instrucoes, aviso_oficial.link, aviso_oficial.encerrado_em IS NULL)
                IS DISTINCT FROM
                (EXCLUDED.sequencia, EXCLUDED.identificador_cap, EXCLUDED.evento, EXCLUDED.severidade,
                 EXCLUDED.rotulo_severidade, EXCLUDED.cor, EXCLUDED.inicio, EXCLUDED.fim,
                 EXCLUDED.riscos, EXCLUDED.instrucoes, EXCLUDED.link, EXCLUDED.encerrado_em IS NULL)`,
        [
          FONTE_INMET,
          aviso.idExterno,
          aviso.sequencia,
          aviso.identificadorCap,
          aviso.evento,
          aviso.severidade,
          aviso.rotuloSeveridade,
          aviso.cor,
          aviso.inicio,
          aviso.fim,
          aviso.riscos,
          aviso.instrucoes,
          aviso.link,
          aviso.encerrado,
        ],
      );
      alterados += rowCount ?? 0;
    }

    // Saiu da lista (cancelado, ou deixou de incluir o município) antes do fim previsto.
    const { rowCount: encerrados } = await client.query(
      `UPDATE aviso_oficial
          SET encerrado_em = now(), atualizado_em = now()
        WHERE fonte = $1 AND encerrado_em IS NULL AND fim > now() AND NOT (id_externo = ANY($2::text[]))`,
      [FONTE_INMET, avisos.map((aviso) => aviso.idExterno)],
    );

    await client.query("COMMIT");
    return alterados + (encerrados ?? 0);
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw erro;
  }
}

/**
 * Consulta o INMET e atualiza os avisos do município. Nunca lança por falha da
 * fonte: o resultado diz o que aconteceu, e o breaker pausa a fonte após
 * FALHAS_PARA_PAUSAR falhas seguidas. Erros do próprio banco sobem normalmente.
 */
export async function sincronizarAvisosInmet(opcoes: OpcoesSincronizacao = {}): Promise<ResultadoSincronizacao> {
  const config = env();
  if (!config.INTEGRACAO_AVISOS_INMET) return { situacao: "desativada" };

  const client = await pool().connect();
  try {
    const { rows } = await client.query<{ obtido: boolean }>("SELECT pg_try_advisory_lock($1) AS obtido", [CHAVE_LOCK]);
    if (!rows[0]?.obtido) return { situacao: "em-andamento" };

    try {
      const { rows: estados } = await client.query<{ recente: boolean; pausada: boolean }>(
        `SELECT ultima_tentativa > now() - make_interval(mins => $2) AS recente,
                pausada_ate > now() AS pausada
           FROM integracao_estado WHERE fonte = $1`,
        [FONTE_INMET, config.INTERVALO_AVISOS_MIN],
      );
      if (!opcoes.forcar) {
        if (estados[0]?.pausada) return { situacao: "pausada" };
        if (estados[0]?.recente) return { situacao: "recente" };
      }
      await client.query("UPDATE integracao_estado SET ultima_tentativa = now() WHERE fonte = $1", [FONTE_INMET]);

      let leitura;
      try {
        const json = await (opcoes.baixar ?? (() => baixarAvisosInmet(config.INMET_AVISOS_URL)))();
        leitura = lerAvisosInmet(json, config.MUNICIPIO_CODIGO_IBGE);
      } catch (erro) {
        return await registrarFalha(client, erro);
      }

      const alterados = await gravarAvisos(client, leitura.avisos);
      await client.query(
        `UPDATE integracao_estado
            SET ultimo_sucesso = now(), falhas_consecutivas = 0, pausada_ate = NULL, ultimo_erro = NULL
          WHERE fonte = $1`,
        [FONTE_INMET],
      );
      return {
        situacao: "ok",
        recebidos: leitura.total,
        doMunicipio: leitura.avisos.length,
        descartados: leitura.descartados,
        alterados,
      };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [CHAVE_LOCK]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

/** Avisos vigentes e previstos (ainda não vencidos), os em vigor e mais graves primeiro. */
export function listarAvisosVigentes(): Promise<AvisoOficial[]> {
  return consultar<AvisoOficial>(
    `SELECT id, fonte, evento, severidade, rotulo_severidade AS "rotuloSeveridade",
            inicio, fim, riscos, instrucoes, link, atualizado_em AS "atualizadoEm"
       FROM aviso_oficial
      WHERE encerrado_em IS NULL AND fim > now()
      ORDER BY inicio <= now() DESC,
               CASE severidade WHEN 'EXTREMA' THEN 3 WHEN 'SEVERA' THEN 2 ELSE 1 END DESC,
               inicio, id`,
  );
}

/** Situação da consulta ao INMET, para o painel. */
export async function obterEstadoIntegracao(): Promise<EstadoIntegracao> {
  const config = env();
  const linha = await consultarUm<Omit<EstadoIntegracao, "ativa" | "municipio" | "intervaloMin">>(
    `SELECT ultima_tentativa AS "ultimaTentativa", ultimo_sucesso AS "ultimoSucesso",
            falhas_consecutivas AS "falhasConsecutivas", pausada_ate AS "pausadaAte", ultimo_erro AS "ultimoErro"
       FROM integracao_estado WHERE fonte = $1`,
    [FONTE_INMET],
  );
  return {
    ativa: config.INTEGRACAO_AVISOS_INMET,
    municipio: config.MUNICIPIO_CODIGO_IBGE,
    intervaloMin: config.INTERVALO_AVISOS_MIN,
    ultimaTentativa: linha?.ultimaTentativa ?? null,
    ultimoSucesso: linha?.ultimoSucesso ?? null,
    falhasConsecutivas: linha?.falhasConsecutivas ?? 0,
    pausadaAte: linha?.pausadaAte ?? null,
    ultimoErro: linha?.ultimoErro ?? null,
  };
}
