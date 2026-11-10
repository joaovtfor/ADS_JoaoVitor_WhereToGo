# Task: Semana 8 — Deploy em Nuvem, Otimização de CDN e Entrega do MVP (Release v1.0.0)

## Status: ✅ CONCLUÍDA

## Objetivo
Concluir a **Semana 8** do cronograma oficial do projeto **WhereToGo**, preparando e entregando a versão final do MVP (`v1.0.0`) pronta para produção em nuvem (Render, Vercel, Railway ou VPS Docker com proxy reverso Apache/Cloudflare CDN), com cache de borda resiliente a picos de tráfego, conexões PostgreSQL/PostGIS com suporte a TLS/SSL gerenciado e pipeline automatizado de CI/CD.

## Entregas Realizadas
1. **Infraestrutura como Código (IaC) para Deploy em Nuvem**:
   - **Render Blueprint (`render.yaml`)**: Especificação declarativa que provisiona o container web `wheretogo-app` (Docker multi-stage standalone) e o banco gerenciado PostgreSQL 16 + PostGIS (`wheretogo-db`), executando automaticamente `node scripts/migrate.mjs` em `preDeployCommand` e monitorando `/api/health`.
   - **Configuração Vercel Edge (`vercel.json`)**: Alocação na região `gru1` (São Paulo — menor latência para o Rio Grande do Sul), build com execução de migrations e regras de cache na borda (`Vercel-CDN-Cache-Control` e `CDN-Cache-Control`).
   - **Imagem Docker Standalone Aprimorada (`.docker/Dockerfile`)**: Estágio `runner` não-root (`nextjs:nodejs`) incluindo os artefatos standalone do Next.js 16 + diretório `db/migrations` e `scripts/` para permitir `preDeployCommand`/`releaseCommand` em qualquer PaaS.
2. **Suporte a TLS/SSL para Bancos PostgreSQL/PostGIS em Nuvem (`src/lib/db.ts`, `src/lib/env.ts`, `scripts/migrate.mjs`, `scripts/seed.mjs`)**:
   - Nova variável `DATABASE_SSL` (`false` | `true` | `require` | `no-verify`) e detecção automática de `sslmode=require` na `DATABASE_URL`, compatibilizando o pool de conexões e os scripts de migração com provedores de banco gerenciados (Render, Neon, Supabase, AWS RDS).
3. **Configuração de CDN, Cache em Camadas e Alta Disponibilidade (`RNF01`)**:
   - **Cache de Borda Resiliente (`CACHE_PUBLICO` em `src/modules/publico/publico.service.ts`)**: Cabeçalhos `Cache-Control` e `CDN-Cache-Control` com `s-maxage=10, stale-while-revalidate=60, stale-if-error=300`, garantindo que a CDN continue entregando o último mapa válido por até 5 minutos caso o servidor de origem sofra sobrecarga extrema durante emergências.
   - **Invalidação Instantânea (`src/lib/http.ts` + `src/modules/publico/publico.cache.ts`)**: Uso do Next.js `"use cache"` com `cacheTag("dados-publicos")` invalidado automaticamente a cada escrita (`POST`/`PATCH`/`PUT`) na API.
   - **Ativos Estáticos e PWA (`next.config.ts` e `public/sw.js`)**: Ícones PWA com `Cache-Control: public, max-age=31536000, immutable`, Service Worker sempre revalidado (`no-cache, no-store, must-revalidate`) e compressão `DEFLATE`/`GZIP` no proxy Apache (`.htaccess`).
4. **Pipeline de Integração e Entrega Contínua (`.github/workflows/ci-cd.yml`)**:
   - Workflow do GitHub Actions que instancia um serviço `postgis/postgis:16-3.4-alpine`, aplica todas as migrations SQL, valida `npm run typecheck`, `npm run lint`, roda a suíte de testes unitários e de integração espacial (`npm test`) e valida o `npm run build` standalone de produção.
5. **Release Final do MVP (`v1.0.0`)**:
   - Versão do pacote atualizada para `1.0.0` em `package.json` e telemetria de versão e latência do banco (`latenciaBancoMs`) adicionada ao endpoint `GET /api/health`.
   - Documentação principal (`README.md`) atualizada com o guia completo de operação e implantação em nuvem.
