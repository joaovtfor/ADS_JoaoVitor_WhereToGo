-- =============================================================================
-- WhereToGo - Migration 0014: Estado compartilhado entre instâncias
-- -----------------------------------------------------------------------------
-- Na Vercel, cada requisição pode cair numa instância diferente da aplicação,
-- e o Supabase é acessado por um pooler em modo transação (cada comando pode
-- usar uma conexão diferente do banco). O que antes ficava na memória do
-- processo único (Render/Docker) ou num lock de sessão passa para o banco,
-- onde todas as instâncias enxergam o mesmo valor:
--
-- 1. token_revogado: tokens encerrados por logout. Antes era um Map em
--    memória, e um logout numa instância não valia nas outras.
-- 2. integracao_estado.em_andamento_ate: reserva da sincronização do INMET.
--    Antes era pg_try_advisory_lock, que é preso à conexão (sessão).
--
-- Plano completo: .specs/plano-migracao-vercel-supabase.md
-- =============================================================================

-- O jti tem até 64 caracteres (validação do JWT em src/lib/auth/jwt.ts).
-- Depois de expira_em o próprio JWT já é recusado: a linha pode ser apagada.
CREATE TABLE token_revogado (
    jti        VARCHAR(64)  PRIMARY KEY,
    expira_em  TIMESTAMPTZ  NOT NULL
);

-- Limpeza das revogações vencidas, feita a cada novo logout.
CREATE INDEX idx_token_revogado_expira_em ON token_revogado (expira_em);

-- Sincronização reservada até este instante (uma instância por vez). Vence
-- sozinha se a instância cair no meio da sincronização.
ALTER TABLE integracao_estado ADD COLUMN em_andamento_ate TIMESTAMPTZ;
