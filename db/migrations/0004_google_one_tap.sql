-- =============================================================================
-- WhereToGo - Migration 0004: Autenticação e Auto-Cadastro via Google One Tap
-- -----------------------------------------------------------------------------
-- Adiciona o identificador imutável da conta Google (claim `sub` do ID Token)
-- na tabela `usuario` para suportar:
--   1. Login com 1 toque para usuários já cadastrados (vinculação por sub/email)
--   2. Solicitação de acesso (auto-cadastro) com aprovação pelo Coordenador/Admin
-- =============================================================================

ALTER TABLE usuario
    ADD COLUMN google_sub VARCHAR(128),
    ADD CONSTRAINT usuario_google_sub_uk UNIQUE (google_sub),
    ADD CONSTRAINT usuario_google_sub_ck CHECK (google_sub IS NULL OR length(btrim(google_sub)) > 0);
