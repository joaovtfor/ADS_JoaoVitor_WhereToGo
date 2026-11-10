# WhereToGo — Plataforma de Gestão de Crise para Abrigos Emergenciais (MVP v1.0.0)

Plataforma integrada de gestão humanitária para desastres naturais (UPF — Análise e Desenvolvimento de Sistemas): combina um **Mapa Público PWA Mobile-First** (vagas em tempo real, roteamento inteligente de doações com PostGIS, busca pública de familiares acolhidos compatível com a LGPD, demarcação poligonal de áreas de risco e reporte comunitário moderado) com um **Painel Administrativo Interno RBAC** (inventário tátil Fast-CRUD com fila offline 3G, dashboard de triagem, sugestões automáticas de transferência entre abrigos e log de auditoria imutável).

**Estado atual:** ✅ **MVP v1.0.0 Concluído (Semanas 1 a 8)** — Todas as etapas do cronograma implementadas, testadas e prontas para produção. Documentação técnica detalhada em [`.specs/`](.specs).

---

## 🛠️ Stack Tecnológica
- **Aplicação Full-Stack:** Next.js 16 (App Router + Route Handlers + `"use cache"` + `output: standalone`) · React 19 · Node.js 22 LTS · TypeScript 5 · Tailwind CSS 4
- **Banco de Dados & Geoprocessamento:** PostgreSQL 16 + PostGIS 3.4 (`GEOGRAPHY`, índices GiST, `ST_Distance`, `ST_DWithin`, `ST_Covers`, `ST_Intersects`, `ST_PointOnSurface`, triggers ACID)
- **Segurança & Validação:** JWT HS256 (`jose`) + Cookie `httpOnly` · `bcryptjs` (custo 12) · Google One Tap OAuth · RBAC em duas camadas (Edge Proxy + Services) · Zod 4
- **Mapas & Pagamentos:** Leaflet.js + OpenStreetMap HOT · Gerador nativo de payload PIX BR Code (EMVCo BACEN CRC16-CCITT) + QR Code
- **Qualidade & Infraestrutura:** Vitest 5 (Unitários, Integração PostGIS real e E2E) · Docker Multi-Stage · GitHub Actions CI/CD · Render Blueprint (`render.yaml`) · Vercel Edge (`vercel.json`)

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

### Opção 1: Deploy em 1 Clique no Render (Docker + PostgreSQL/PostGIS)
O repositório inclui o Blueprint oficial [`render.yaml`](render.yaml):
1. No painel do **Render**, selecione **New > Blueprint** e conecte este repositório.
2. O Render criará automaticamente o banco `wheretogo-db` (PostgreSQL 16 com extensão PostGIS habilitada na migration `0001`) e o serviço web `wheretogo-app`.
3. A cada deploy, o comando `preDeployCommand: node scripts/migrate.mjs` aplica as migrations pendentes de forma transacional com `pg_advisory_lock` antes de substituir a instância ativa, validando a saúde pelo endpoint `GET /api/health`.

### Opção 2: Deploy na Vercel (Edge Network `gru1`) + Banco PostGIS Gerenciado
O arquivo [`vercel.json`](vercel.json) já está configurado para a região **São Paulo (`gru1`)**:
1. Provisione um banco PostgreSQL 16 com suporte a PostGIS (Render, Neon, Supabase ou AWS RDS).
2. Configure no painel da Vercel as variáveis de ambiente:
   - `DATABASE_URL`: string de conexão do banco PostGIS
   - `DATABASE_SSL`: `true`
   - `JWT_SECRET`: chave aleatória com 32+ caracteres
3. As rotas públicas (`/api/public/*`) emitem cabeçalhos `CDN-Cache-Control` e `Vercel-CDN-Cache-Control` com `s-maxage=10, stale-while-revalidate=60, stale-if-error=300`, garantindo carregamento instantâneo na borda e resiliência contra picos de acesso.

### Opção 3: VPS Linux + Docker Compose + Apache/Cloudflare CDN
1. Execute `docker compose up -d --build` no servidor.
2. Utilize o arquivo [`.htaccess`](.htaccess) no proxy reverso Apache (ou aponte o Cloudflare Tunnel/Nginx para `127.0.0.1:3000`).

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
