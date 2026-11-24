import { env } from "@/lib/env";
import { ErroApi, lerQuery, obterIp, rota } from "@/lib/http";
import { CABECALHOS_SSE } from "@/lib/sse";
import { z } from "@/lib/validacao";
import { agendarSincronizacaoAvisos } from "@/modules/integracoes/avisos.agendamento";
import { esquemaFiltroMapa } from "@/modules/publico/publico.service";
import { abrirFluxoMapa, lerIdUltimoEvento } from "@/modules/publico/publico.tempo-real";

/**
 * Limite da função na Vercel (Hobby: 300 s). Cada conexão fecha antes
 * (`DURACAO_CONEXAO_MS`, 240 s) e o navegador reconecta sozinho.
 */
export const maxDuration = 300;

const esquemaVersoes = z.object({
  versao: z.string().max(100).optional(),
  versaoCategorias: z.string().max(100).optional(),
});

/**
 * Mapa público em tempo real (Server-Sent Events, sem login - RNF02).
 *
 * Envia o mesmo conteúdo de `/api/public/mapa` (evento `mapa`) e de
 * `/api/public/categorias` (evento `categorias`) a cada mudança, sem o
 * navegador perguntar. Query: lat, lng, raioKm (os mesmos de /mapa) e as
 * versões que o navegador já tem (`versao`, `versaoCategorias`); ao reconectar,
 * o próprio `EventSource` informa as versões no cabeçalho `Last-Event-ID`.
 *
 * Erros (tempo real desligado, banco fora do ar, limite de conexões) saem como
 * JSON antes de abrir o fluxo: o `EventSource` desiste e o mapa volta ao polling.
 */
export const GET = rota(async (req) => {
  if (!env().MAPA_TEMPO_REAL) {
    throw new ErroApi(503, "TEMPO_REAL_DESLIGADO", "O mapa em tempo real está desligado neste servidor.");
  }
  const filtros = lerQuery(req, esquemaFiltroMapa);
  const versoes = lerQuery(req, esquemaVersoes);
  const ultimoEvento = lerIdUltimoEvento(req.headers.get("last-event-id"));

  // Gatilho da consulta ao INMET, como em /api/public/mapa (roda quando a conexão fecha).
  agendarSincronizacaoAvisos();

  const fluxo = await abrirFluxoMapa({
    filtros,
    versaoMapa: ultimoEvento.versaoMapa ?? versoes.versao ?? null,
    versaoCategorias: ultimoEvento.versaoCategorias ?? versoes.versaoCategorias ?? null,
    ip: obterIp(req),
    sinal: req.signal,
  });
  return new Response(fluxo, { headers: CABECALHOS_SSE });
});
