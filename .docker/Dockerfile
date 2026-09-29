# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Base Image com Node.js (Alpine para menor superfície e tamanho reduzido)
# -----------------------------------------------------------------------------
ARG NODE_VERSION=20-alpine
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
# 3. Build da Aplicação Next.js (Compilação Full-Stack)
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

# Executa o build (gerando output standalone configurado no next.config.js/ts)
RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else npm run build; \
  fi

# -----------------------------------------------------------------------------
# 4. Imagem Final de Produção (Runner - Leve, Segura e Standalone)
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

# Copia os arquivos compilados do modo standalone
# (Nota: certifique-se de ter `output: 'standalone'` no seu next.config.js/ts)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
