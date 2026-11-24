import { after } from "next/server";
import { invalidarDadosPublicos } from "@/lib/cache";
import { env } from "@/lib/env";
import { sincronizarAvisosInmet } from "./avisos.service";

/**
 * Quantas vezes por instância a leitura do mapa pode ir ao banco perguntar se
 * está na hora de consultar o INMET. O mapa é lido por todo visitante a cada
 * 30 s; sem este filtro em memória, cada leitura custaria uma conexão.
 */
const INTERVALO_VERIFICACAO_MS = 60_000;
let proximaVerificacao = 0;

/**
 * Chamado pelas rotas que leem avisos (mapa público, lista de avisos, painel).
 * Se for hora, consulta o INMET DEPOIS de enviar a resposta (`after`): o
 * visitante nunca espera a fonte externa. Havendo mudança, invalida o cache
 * público e avisa o mapa em tempo real. O `revalidateTag` dentro do `after()`
 * de um Route Handler é executado pelo Next ao fim da tarefa. Na conexão de
 * tempo real (SSE), o `after()` só roda quando a conexão fecha (até 4 min).
 */
export function agendarSincronizacaoAvisos(): void {
  const agora = Date.now();
  if (agora < proximaVerificacao) return;
  proximaVerificacao = agora + INTERVALO_VERIFICACAO_MS;
  if (!env().INTEGRACAO_AVISOS_INMET) return;

  after(async () => {
    try {
      const resultado = await sincronizarAvisosInmet();
      if (resultado.situacao === "ok" && resultado.alterados > 0) {
        invalidarDadosPublicos();
      }
    } catch (erro) {
      // Banco indisponível, por exemplo: a próxima verificação tenta de novo.
      console.error("[avisos] sincronização em segundo plano falhou", erro);
    }
  });
}
