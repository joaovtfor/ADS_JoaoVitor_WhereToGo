import { after } from "next/server";
import { pool, type Executor } from "./db";
import type { Contexto } from "./auth/rbac";

/** Códigos de ação registrados em LOG_AUDITORIA.acao. */
export type AcaoAuditoria =
  | "LOGIN_SUCESSO"
  | "LOGIN_FALHA"
  | "LOGIN_BLOQUEADO"
  | "LOGOUT"
  | "SENHA_ALTERADA"
  | "ABRIGO_CRIADO"
  | "ABRIGO_ATUALIZADO"
  | "ESTOQUE_MOVIMENTADO"
  | "ESTOQUE_TRANSFERIDO"
  | "ESTOQUE_CLASSIFICADO"
  | "OCORRENCIA_REGISTRADA"
  | "OCORRENCIA_RESOLVIDA"
  | "ABRIGADO_REGISTRADO"
  | "ABRIGADO_ATUALIZADO"
  | "ABRIGADO_DESLIGADO"
  | "ABRIGADO_TRANSFERIDO"
  | "CATEGORIA_CRIADA"
  | "CATEGORIA_ATUALIZADA"
  | "ITEM_CRIADO"
  | "ITEM_ATUALIZADO"
  | "USUARIO_CRIADO"
  | "USUARIO_ATUALIZADO";

export interface EventoAuditoria {
  acao: AcaoAuditoria;
  descricao: string;
  idUsuario: number | null;
  idAbrigo?: number | null;
  detalhes?: Record<string, unknown>;
  ip?: string | null;
}

/** Grava o log de forma síncrona (usado pelo agendador e pelos testes). */
export async function gravarAuditoria(evento: EventoAuditoria, executor: Executor = pool()): Promise<void> {
  await executor.query(
    `INSERT INTO log_auditoria (id_usuario, id_abrigo, acao, descricao, detalhes, endereco_ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      evento.idUsuario,
      evento.idAbrigo ?? null,
      evento.acao,
      evento.descricao.slice(0, 500),
      evento.detalhes ? JSON.stringify(evento.detalhes) : null,
      evento.ip ?? null,
    ],
  );
}

// Promessas em andamento quando `after()` não está disponível (fora de uma
// requisição do Next, ex.: testes) - permite aguardar a gravação.
const pendentes = new Set<Promise<void>>();

/**
 * Agenda a gravação do log de auditoria em background (RNF03): com `after()` o
 * INSERT acontece depois que a resposta foi enviada, sem somar latência ao
 * Fast-CRUD. Uma falha de gravação nunca derruba a operação principal; o evento
 * completo vai para o log do servidor para posterior reprocessamento.
 */
export function registrarAuditoria(evento: EventoAuditoria): void {
  const tarefa = async () => {
    try {
      await gravarAuditoria(evento);
    } catch (erro) {
      console.error("[auditoria] falha ao gravar log de auditoria", JSON.stringify(evento), erro);
    }
  };

  try {
    after(tarefa);
  } catch {
    const promessa: Promise<void> = tarefa().finally(() => pendentes.delete(promessa));
    pendentes.add(promessa);
  }
}

/** Atalho: registra evento com usuário e IP do contexto da requisição. */
export function auditar(ctx: Contexto, evento: Omit<EventoAuditoria, "idUsuario" | "ip">): void {
  registrarAuditoria({ ...evento, idUsuario: ctx.usuario.id, ip: ctx.ip });
}

/** Aguarda gravações em andamento (testes / encerramento de scripts). */
export async function aguardarAuditoriasPendentes(): Promise<void> {
  await Promise.all([...pendentes]);
}
