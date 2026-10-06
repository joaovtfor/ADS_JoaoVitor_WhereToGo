# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Base Image com Node.js (Alpine para menor superfície e tamanho reduzido)
# Node 22 LTS: o Node 20 chegou ao fim de vida (EOL) em abril/2026.
# -----------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

WORKDIR /app

# Dependências nativas necessárias para Alpine (libc6-compat para compatibilidade com binários como SWC/Turbopack)
RUN apk add --no-cache libc6-compat

# -----------------------------------------------------------------------------
# 1. Dependências (Instalação isolada com cache)
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copia manifestos de dependências e arquivos de lock
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

# Instalação com detecção automática do gerenciador de pacotes
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Aviso: Nenhum lockfile encontrado, instalando com npm install..." && npm install; \
  fi

# Somente dependências de produção (usadas pelo job de migrations/seed)
FROM base AS prod-deps
WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile --production; \
  elif [ -f package-lock.json ]; then npm ci --omit=dev; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile --prod; \
  else npm install --omit=dev; \
  fi

# -----------------------------------------------------------------------------
# 2. Ambiente de Desenvolvimento (Hot-reload / Front & Back)
# -----------------------------------------------------------------------------
FROM base AS dev
WORKDIR /app

ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# -----------------------------------------------------------------------------
# 3. Migrations / Seed do banco (job one-shot executado antes da aplicação)
# -----------------------------------------------------------------------------
FROM base AS migrator
WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY db ./db
COPY scripts ./scripts

USER node

CMD ["node", "scripts/migrate.mjs"]

# -----------------------------------------------------------------------------
# 4. Build da Aplicação Next.js (Compilação Full-Stack)
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Garante que a pasta public exista mesmo se o projeto for recém-inicializado
RUN mkdir -p public

# Desabilita telemetria no build e define ambiente de produção
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Executa o build (gerando output standalone configurado no next.config.ts)
RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else npm run build; \
  fi

# -----------------------------------------------------------------------------
# 5. Imagem Final de Produção (Runner - Leve, Segura e Standalone)
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Criação de usuário não-root por boas práticas de segurança
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Garante a existência da pasta public
COPY --from=builder /app/public ./public

# Configura diretório de cache do Next.js com as permissões corretas
RUN mkdir .next && chown nextjs:nodejs .next

# Copia os arquivos compilados do modo standalone (`output: 'standalone'` no next.config.ts)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Verifica aplicação + conexão com o banco (rota /api/health)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
