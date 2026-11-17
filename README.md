# WhereToGo — Plataforma de Gestão de Crise para Abrigos Emergenciais (MVP v1.0.0)

Plataforma integrada de gestão humanitária para desastres naturais (UPF — Análise e Desenvolvimento de Sistemas): combina um **Mapa Público PWA Mobile-First** (vagas em tempo real, roteamento inteligente de doações com PostGIS, busca pública de familiares acolhidos compatível com a LGPD, demarcação poligonal de áreas de risco e reporte comunitário moderado) com um **Painel Administrativo Interno RBAC** (inventário tátil Fast-CRUD com fila offline 3G, dashboard de triagem, sugestões automáticas de transferência entre abrigos e log de auditoria imutável).

**Estado atual:** ✅ **MVP v1.0.0 Concluído (Semanas 1 a 8)** — Todas as etapas do cronograma implementadas, testadas e prontas para produção. Documentação técnica detalhada em [`.specs/`](.specs).

---

## 🛠️ Stack Tecnológica
- **Aplicação Full-Stack:** Next.js 16 (App Router + Route Handlers + `"use cache"` + `output: standalone`) · React 19 · Node.js 22 LTS · TypeScript 5 · Tailwind CSS 4
- **Banco de Dados & Geoprocessamento:** PostgreSQL 16 + PostGIS 3.4 (`GEOGRAPHY`, índices GiST, `ST_Distance`, `ST_DWithin`, `ST_Covers`, `ST_Intersects`, `ST_PointOnSurface`, triggers ACID)
- **Segurança & Validação:** JWT HS256 (`jose`) + Cookie `httpOnly` · `bcryptjs` (custo 12) · Google One Tap OAuth · RBAC em duas camadas (Edge Proxy + Services) · Zod 4
- **Mapas & Pagamentos:** Leaflet.js + OpenStreetMap HOT · Gerador nativo de payload PIX BR Code (EMVCo BACEN CRC16-CCITT) + QR Code
- **Qualidade & Infraestrutura:** Vitest 5 (Unitários, Integração PostGIS real e E2E) · Docker Multi-Stage · GitHub Actions CI/CD · Render Blueprint (`render.yaml`)

---

## 🚀 Como Executar Localmente

### 1. Configuração Inicial
```bash
cp .env.example .env
```
Edite o arquivo `.env`: defina um `JWT_SECRET` seguro (mínimo de 32 caracteres) e ajuste `POSTGRES_PORT` caso já possua um PostgreSQL local rodando na porta `5432`.

### 2a. Execução Completa via Docker (Produção Local)
```bash
docker compose up -d --build
```
O Docker Compose inicializa na ordem: `postgres` (PostGIS 16) → `migrate` (aplica as 10 migrations SQL) → `app` (servidor standalone em `http://localhost:3000`).

Para popular o banco com dados fictícios de demonstração (Passo Fundo/RS):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
```

### 2b. Ambiente de Desenvolvimento (Banco no Docker + App Local)
```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

### 👤 Credenciais de Demonstração (Seed)
Senha padrão para todos os perfis: `WhereToGo@2026` (ou o valor de `SEED_SENHA_PADRAO` no `.env`).

| E-mail | Papel RBAC | Abrigo Vinculado | Rota Inicial |
|---|---|---|---|
| `admin@wheretogo.local` | `ADMIN` | Visão Global (Todos) | `/admin/geral` |
| `coordenador@wheretogo.local` | `COORDENADOR` | Abrigo Central UPF | `/admin/dashboard` |
| `voluntario@wheretogo.local` | `VOLUNTARIO` | Abrigo Central UPF | `/admin/inventario` |
| `coordenador.centro@wheretogo.local` | `COORDENADOR` | Ginásio Poliesportivo do Centro | `/admin/dashboard` |
| `voluntario.centro@wheretogo.local` | `VOLUNTARIO` | Ginásio Poliesportivo do Centro | `/admin/inventario` |

---

## ☁️ Implantação em Produção (Semana 8 — Cloud & CDN)

### Opção 1: Render (Docker + PostgreSQL/PostGIS) — ambiente de produção atual
É o alvo oficial de deploy. O repositório inclui o Blueprint [`render.yaml`](render.yaml):
1. No painel do **Render**, selecione **New > Blueprint** e conecte este repositório.
2. O Render criará automaticamente o banco `wheretogo-db` (PostgreSQL 16 com extensão PostGIS habilitada na migration `0001`) e o serviço web `wheretogo-app`.
3. A cada partida do serviço, `scripts/start-prod.mjs` aplica as migrations pendentes (transacionais, com `pg_advisory_lock`) antes de o servidor aceitar conexões; o Render valida a saúde pelo endpoint `GET /api/health`.
4. A imagem final usa o build `standalone` do Next.js, sem o `node_modules` completo: só o servidor, os arquivos estáticos, as migrations e os scripts de partida.
5. O deploy só começa depois que o CI do commit passa (`autoDeployTrigger: checksPass`). Em um serviço criado fora do Blueprint, a mesma opção fica em **Settings > Build & Deploy > Auto-Deploy > After CI Checks Pass**.

### Opção 2: VPS Linux + Docker Compose
1. Execute `docker compose up -d --build` no servidor.
2. Aponte um proxy reverso com HTTPS (Nginx, Caddy ou Cloudflare Tunnel) para `127.0.0.1:3000` e ajuste `PROXIES_CONFIAVEIS` para o número de proxies na frente da aplicação.

> **Atenção:** o cache do mapa público, o limitador de requisições e a lista de tokens revogados ficam na memória do processo. Por isso o projeto roda em **um processo Node de longa duração**, e não em plataformas serverless (várias instâncias de vida curta, cada uma com a sua cópia): nelas esses três recursos perdem eficácia.

---

## 📜 Scripts Disponíveis
| Comando | Descrição |
|---|---|
| `npm run dev` / `build` / `start` | Servidor de desenvolvimento, build de produção standalone e inicialização |
| `npm run lint` / `typecheck` | Verificação estática ESLint e TypeScript (`next typegen && tsc --noEmit`) |
| `npm run db:migrate` | Aplica migrations SQL pendentes (`db/migrations/0001..0010`) |
| `npm run db:seed` | Popula dados fictícios de demonstração (idempotente) |
| `npm run db:reset` | Recria o schema e roda o seed (bloqueado quando `NODE_ENV=production`) |
| `npm test` | Executa testes unitários + integração com banco PostGIS real (`wheretogo_test`) |
| `npm run test:e2e` | Executa testes E2E HTTP contra a aplicação ativa (`E2E_BASE_URL`) |

---

## 📚 Documentação do Projeto
- [Visão Geral do Projeto](.specs/context/01-project-overview.md)
- [Arquitetura e Decisões Técnicas](.specs/context/03-architecture.md)
- [Modelo Lógico de Dados e DER v2](.specs/context/04-database-model.md)
- [Cronograma de 8 Semanas (100% Concluído)](.specs/context/05-roadmap-cronograma.md)
- [Referência da API REST](.specs/context/06-api.md)
- [Especificações por Requisito e Semana](.specs/tasks)
