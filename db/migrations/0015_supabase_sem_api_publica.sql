-- =============================================================================
-- WhereToGo - Migration 0015: Tabelas fora da API REST pública do Supabase
-- -----------------------------------------------------------------------------
-- O Supabase publica o schema `public` numa API REST (Data API) e dá acesso às
-- tabelas criadas ali aos papéis `anon` e `authenticated`. A chave `anon` é
-- pública por definição, e nossas tabelas não usam RLS: sem esta migration,
-- quem tivesse a chave poderia ler e alterar `usuario`, `abrigado` (CPF) etc.
--
-- A aplicação não usa essa API (conecta direto ao Postgres com `pg`), então
-- esses papéis perdem o acesso às tabelas e sequências atuais e às que as
-- próximas migrations criarem. Desligar a Data API no painel do Supabase
-- continua recomendado; esta migration protege mesmo se ela for religada.
--
-- Fora do Supabase (Docker, Render, CI) os papéis não existem e nada acontece.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

        -- Objetos criados depois pelo mesmo papel (o das migrations).
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    END IF;
END
$$;
