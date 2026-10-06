# Tarefa da Semana 1: Base do Projeto, Banco de Dados (PostgreSQL + PostGIS) e API de Autenticação (JWT + RBAC)

## Status: ✅ CONCLUÍDA

---

## 🎯 Escopo da Entrega (Semana 1)
Conforme estabelecido no Cronograma de Codificação (Seção 3.1 do DVP):
> *"Configuração do repositório, infraestrutura do banco de dados (PostgreSQL + PostGIS) e criação da API de Autenticação com geração de token JWT (RBAC)"*

---

## 📋 Checklist de Implementação

### 1. Infraestrutura e Banco de Dados
- [x] Container PostgreSQL com **PostGIS** (`postgis/postgis:16-3.4-alpine`) no `docker-compose.yml`, com healthcheck e volume persistente.
- [x] Script de inicialização (`.docker/postgres/init/01-init.sql`): extensão `postgis` e criação do banco de testes `wheretogo_test`.
- [x] Estrutura base do projeto Next.js 16 (App Router, TypeScript, TailwindCSS 4, `output: standalone`).
- [x] Dockerfile multi-stage em Node 22 LTS (`dev`, `migrator`, `builder`, `runner` não-root com healthcheck) e job `migrate` no compose, executado antes da aplicação.
- [x] Camada de dados com **node-postgres (`pg`)** e **migrations SQL versionadas** (`db/migrations`, executor `scripts/migrate.mjs` com checksum e advisory lock) modelando o **DER v2 revisado**: `ABRIGO`, `CATEGORIA_ITEM`, `ITEM`, `STATUS_NECESSIDADE`, `ESTOQUE_ABRIGO`, `MOVIMENTACAO_ESTOQUE`, `PAPEL_USUARIO`, `USUARIO`, `ABRIGADO`, `TRANSFERENCIA_ABRIGADO`, `OCORRENCIA_INFRAESTRUTURA`, `LOG_AUDITORIA`.
  - *Decisão*: o plano original citava Prisma; foi substituído por SQL versionado porque o modelo usa `GEOGRAPHY` gerada, índice GiST, índice único parcial e triggers (ver `03-architecture.md`).
- [x] Script de seed (`scripts/seed.mjs`, idempotente) com dados fictícios: Admin, Coordenadores, Voluntários, 4 abrigos em Passo Fundo (incluindo o Abrigo Central UPF), estoque, necessidades, abrigados e ocorrências. Catálogo de suprimentos e domínios na migration `0003`.
- [x] `.env.example` revisado (portas, URL de testes, `JWT_SECRET`, `JWT_EXPIRES_IN`, senha do seed) e `JWT_SECRET` repassado ao container da aplicação.

### 2. Autenticação e RBAC (RF01 / HU01 / RNF05)
- [x] Hash de senhas com `bcryptjs`, custo 12 (`src/lib/auth/senha.ts`), com comparação de tempo constante para e-mails inexistentes.
- [x] Assinatura e verificação de JWT HS256 com `jose` (`src/lib/auth/jwt.ts`) contendo as claims:
  - `sub`: ID do usuário
  - `nome`: Nome completo
  - `email`: E-mail
  - `papel`: `ADMIN` | `COORDENADOR` | `VOLUNTARIO`
  - `idAbrigo`: ID do abrigo vinculado (nulo para ADMIN)
- [x] Matriz de permissões RBAC centralizada (`src/lib/auth/rbac.ts`) + escopo por abrigo.
- [x] Rota de Login (`POST /api/auth/login`):
  - Validação de entrada (e-mail e senha) com Zod
  - Consulta ao banco e comparação segura com bcrypt
  - Verificação de usuário ativo e vínculo com abrigo ativo
  - Retorno de token JWT (corpo + cookie `httpOnly`) e rota de redirecionamento por perfil:
    - `VOLUNTARIO` -> `/admin/inventario` (Fast-CRUD)
    - `COORDENADOR` -> `/admin/dashboard` (Dashboard de Triagem)
    - `ADMIN` -> `/admin/geral` (Visão Sistêmica)
  - Mensagem de erro genérica em falha: `"Credenciais inválidas."`
  - Limite de 10 falhas por IP + e-mail a cada 15 minutos (`429`)
  - Auditoria de sucesso, falha e bloqueio
- [x] Rota de Sessão (`GET /api/auth/me`): token via `Authorization: Bearer <token>` ou cookie; usuário revalidado no banco a cada requisição.
- [x] Rota de Logout (`POST /api/auth/logout`) com limpeza do cookie de sessão.
- [x] Troca de senha (`PUT /api/auth/senha`).
- [ ] ~~Interface de Login (`src/app/login/page.tsx`)~~ → movida para a **Semana 3**, conforme o cronograma do DVP ("Criação da tela de Login segmentado").

### 3. Qualidade
- [x] Testes unitários (Vitest) de JWT, RBAC e regras de bloqueio; testes de integração de autenticação em banco real.
