-- =============================================================================
-- WhereToGo - Migration 0006: Revogação de sessões e aprovação explícita
-- -----------------------------------------------------------------------------
-- 1. `versao_sessao`: copiada para o JWT no login. Incrementá-la (troca de
--    senha, redefinição pelo ADMIN/Coordenador) invalida todos os tokens já
--    emitidos, pois a sessão é revalidada no banco a cada requisição.
-- 2. `aprovado_em`: distingue "aguardando aprovação" (auto-cadastro via Google,
--    nunca aprovado) de "desativado" (já foi aprovado e depois bloqueado).
--    Antes, ambos eram `ativo = FALSE` e um voluntário desligado de propósito
--    voltava para a fila de aprovação ao tocar no botão do Google.
-- =============================================================================

ALTER TABLE usuario
    ADD COLUMN versao_sessao INTEGER NOT NULL DEFAULT 0,
    -- Usuários criados pela equipe (ou pelo seed) já nascem aprovados; o
    -- auto-cadastro via Google grava NULL explicitamente.
    ADD COLUMN aprovado_em TIMESTAMPTZ DEFAULT now();

-- Dados existentes: aprovado desde a criação, exceto auto-cadastros via Google
-- que ainda estão inativos (pendentes de aprovação).
UPDATE usuario u
   SET aprovado_em = CASE
       WHEN NOT u.ativo AND EXISTS (
           SELECT 1 FROM log_auditoria l
            WHERE l.acao = 'AUTO_CADASTRO_GOOGLE' AND l.id_usuario = u.id
       ) THEN NULL
       ELSE u.criado_em
   END;

ALTER TABLE usuario
    ADD CONSTRAINT usuario_versao_sessao_ck CHECK (versao_sessao >= 0),
    ADD CONSTRAINT usuario_aprovacao_ck     CHECK (NOT ativo OR aprovado_em IS NOT NULL);
