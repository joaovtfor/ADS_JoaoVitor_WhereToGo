# WhereToGo

Plataforma de gestão de crise para abrigos emergenciais (UPF - ADS): mapa público de abrigos com vagas, necessidades e alertas, e painel interno com controle de acesso por papel (RBAC), inventário Fast-CRUD e auditoria imutável.

**Estado atual:** Semanas 1, 2 e 3 concluídas (infraestrutura, banco PostgreSQL/PostGIS, backend completo e Frontend Admin — Login segmentado, Dashboard de Triagem, Reporte de Infraestrutura, Gestão de Acolhidos, Inventário e Administração Geral). Documentação em [`.specs/`](.specs).

## Stack
Next.js 16 (Route Handlers) · Node 22 · TypeScript · PostgreSQL 16 + PostGIS 3.4 · `pg` + migrations SQL · Zod · JWT (`jose`) · bcrypt · Vitest · Docker Compose

## Como executar

### 1. Configuração
```bash
cp .env.example .env
```
Edite o `.env`: defina um `JWT_SECRET` aleatório e, se já houver um PostgreSQL local na porta 5432, troque `POSTGRES_PORT` e as URLs `DATABASE_URL*` (ex.: 5433).

### 2a. Tudo no Docker (produção local)
```bash
docker compose up -d --build
```
Sobe `postgres` → `migrate` (aplica as migrations) → `app` em `http://localhost:${APP_PORT}`. Para popular com dados de teste:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
```

### 2b. Desenvolvimento (banco no Docker, app local)
```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

### Usuários de teste (seed)
Senha: valor de `SEED_SENHA_PADRAO` (padrão `WhereToGo@2026`).

| E-mail | Papel | Abrigo |
|---|---|---|
| `admin@wheretogo.local` | ADMIN | — |
| `coordenador@wheretogo.local` | COORDENADOR | Abrigo Central UPF |
| `voluntario@wheretogo.local` | VOLUNTARIO | Abrigo Central UPF |
| `coordenador.centro@wheretogo.local` / `voluntario.centro@wheretogo.local` | COORDENADOR / VOLUNTARIO | Ginásio do Centro |

## Scripts
| Script | Descrição |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:migrate` | Aplica migrations pendentes (`db/migrations`) |
| `npm run db:seed` | Dados fictícios de desenvolvimento (idempotente) |
| `npm run db:reset` | Recria o schema e roda o seed (bloqueado em produção) |
| `npm test` | Testes unitários + integração (o banco `wheretogo_test` é recriado) |
| `npm run test:e2e` | Testes HTTP contra a app rodando: `E2E_BASE_URL=http://localhost:3000` |

## Documentação
- [Visão geral](.specs/context/01-project-overview.md) · [Arquitetura](.specs/context/03-architecture.md) · [Modelo de dados e análise do DER](.specs/context/04-database-model.md) · [Cronograma](.specs/context/05-roadmap-cronograma.md) · [API REST](.specs/context/06-api.md)
- Requisitos: [`.specs/tasks`](.specs/tasks)
