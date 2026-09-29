# Tarefa da Semana 1: Base do Projeto, Banco de Dados (PostgreSQL + PostGIS) e API de Autenticação (JWT + RBAC)

## Status: ✅ CONCLUÍDA (Semana 1)

---

## 🎯 Escopo da Entrega (Semana 1)
Conforme estabelecido no Cronograma de Codificação (Seção 3.1 do DVP):
> *"Configuração do repositório, infraestrutura do banco de dados (PostgreSQL + PostGIS) e criação da API de Autenticação com geração de token JWT (RBAC)"*

---

## 📋 Checklist de Implementação

### 1. Infraestrutura e Banco de Dados
- [x] Atualizar container PostgreSQL no `docker-compose.yml` para incluir **PostGIS 3+** (`postgis/postgis:16-3.4-alpine`).
- [x] Script de inicialização do banco (`.docker/postgres/init/01-init.sql`) com extensões `postgis`, `uuid-ossp`, `pgcrypto`.
- [x] Inicialização da estrutura base do projeto Next.js (App Router, TypeScript, TailwindCSS).
- [x] Configuração do cliente ORM (Prisma ORM com schema PostgreSQL modelando `ABRIGO`, `ITEM_CATEGORIA`, `ESTOQUE_ABRIGO`, `USUARIO`, `LOG_AUDITORIA`).
- [x] Script de seed para popular dados iniciais (`prisma/seed.js`) com Admin, Coordenador, Voluntário, Abrigo Central UPF e categorias de suprimentos.

### 2. Autenticação e RBAC (RF01 / HU01 / RNF05)
- [x] Utilitário de criptografia de senhas com `bcryptjs` (`src/lib/auth.ts`).
- [x] Utilitário de assinatura e verificação de JWT (`src/lib/jwt.ts`) contendo claims:
  - `userId`: ID do usuário
  - `nome`: Nome completo
  - `email`: E-mail
  - `papel`: `ADMIN` | `COORDENADOR` | `VOLUNTARIO`
  - `idAbrigo`: ID do abrigo vinculado (se houver)
- [x] Rota de Login (`POST /api/auth/login`):
  - Validação de entrada (email e senha)
  - Consulta ao banco de dados com hash seguro bcrypt
  - Verificação de status ativo e vínculo de abrigo
  - Retorno de token JWT + payload com rota de redirecionamento por perfil:
    - `VOLUNTARIO` -> `/admin/inventario` (Fast-CRUD)
    - `COORDENADOR` -> `/admin/dashboard` (Dashboard de Triagem)
    - `ADMIN` -> `/admin/geral` (Visão Sistêmica)
  - Mensagem de erro genérica em falha: `"Credenciais inválidas"` (Prevenção de enumeração e força bruta)
- [x] Rota de Verificação de Sessão (`GET /api/auth/me`):
  - Extração do token do header `Authorization: Bearer <token>` ou cookies
  - Validação e retorno dos dados da sessão ativa
- [x] Rota de Logout (`POST /api/auth/logout`) com limpeza de cookies de sessão.
- [x] Interface interativa de Login (`src/app/login/page.tsx`) com atalhos de preenchimento rápido para testar cada perfil de acesso RBAC.
