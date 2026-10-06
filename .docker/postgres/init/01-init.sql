-- =============================================================================
-- Inicialização do PostgreSQL (executado apenas na PRIMEIRA criação do volume)
-- -----------------------------------------------------------------------------
-- O schema da aplicação NÃO é criado aqui: ele é versionado em db/migrations e
-- aplicado por `npm run db:migrate` (ou pelo serviço `migrate` do compose).
-- Aqui ficam apenas preparações de ambiente.
-- =============================================================================

-- Extensão geoespacial (a migration 0001 também garante a criação, para bancos
-- gerenciados em nuvem onde este script não roda).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Banco isolado para os testes de integração (recriado a cada execução dos testes).
SELECT 'CREATE DATABASE wheretogo_test'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'wheretogo_test')
\gexec
