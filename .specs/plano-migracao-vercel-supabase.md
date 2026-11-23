# Plano de Migração — Render → Vercel + Supabase

> **Documento de infraestrutura (v1.0, 23/11/2026)**
> **Projeto:** WhereToGo — Plataforma de Gestão de Crise para Abrigos Emergenciais
> **Situação:** Fase 1 (código compatível com os dois ambientes) implementada. Fases 0 e 2 dependem de passos manuais nos painéis (seção 6).
> **Regra da transição:** primeiro os dois ambientes ficam no ar recebendo a `main`; só depois o Render é retirado (arquivos e painel).

---

## 1. Decisões do responsável (23/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Dados do banco do Render | **Só o seed de demonstração.** O Supabase começa do seed; não há migração de dados. |
| 2 | Gatilho do deploy na Vercel | **Modelo A:** o GitHub Actions roda as migrations no Supabase e publica pela CLI da Vercel, só depois do CI passar. |
| 3 | Deploys de preview por PR | **Não.** O trabalho é direto na `main`; um único projeto Supabase. |
| 4 | Endereço | **`*.vercel.app`.** `wheretogo.vercel.app` já pertence a outro site (conferido em 23/11). Livres em 23/11: `wheretogo-upf`, `wheretogo-app`, `wheretogo-pf`, `wheretogo-rs`. |
| 5 | Revogação de token no logout | **Vai para o banco** (tabela `token_revogado`, migration 0014). |

## 2. Datas

| Data | Marco |
|---|---|
| 23–25/11 | Fase 0 (contas e painéis) e primeiro deploy na Vercel pela pipeline |
| 25–29/11 | Fase 2: validação com os dois ambientes no ar |
| 29/11 | Decidir a URL da apresentação. Recomendação: Vercel, se a Fase 2 passou; Render como reserva |
| **01/12** | **Apresentação** |
| 02–11/12 | Fases 3 e 4: virada e retirada do Render |
| **12/12** | Banco gratuito do Render expira (é apagado 14 dias depois) |

## 3. Por que migrar (fase de MVP)

| | Render Free | Vercel Hobby + Supabase Free |
|---|---|---|
| Banco | Expira 30 dias após a criação | Não expira; pausa após 7 dias sem uso (evitado pelo workflow `manter-supabase-ativo`) |
| App sem acesso | Dorme após 15 min; ~1 min para acordar | Não dorme; funções com partida curta e CDN na frente |
| Região | Oregon (EUA) | Funções em São Paulo (`gru1`) e banco em São Paulo (`sa-east-1`) |
| CDN | Nenhuma usa o `CDN-Cache-Control` das rotas públicas | A CDN da Vercel absorve o tráfego do mapa público |
| Cotas | 750 h/mês de instância; banco de 1 GB | 1 mi de invocações e 4 h de CPU ativa/mês; banco de 500 MB |

O plano Hobby da Vercel é para uso pessoal e não comercial: serve ao projeto acadêmico. Um contrato com a prefeitura exigiria o plano Pro.

## 4. Como o deploy funciona

```
push na main (ou "Run workflow")
  └─ job qualidade-e-build: lint, typecheck, testes PostGIS, build      ← igual a antes
       ├─ Render: publica sozinho depois que os checks passam           ← até a Fase 4
       └─ job deploy-vercel (só com a variável DEPLOY_VERCEL=true)
            1. npm run db:preparar → Supabase, pooler modo SESSÃO (5432)
            2. vercel pull / vercel build --prod / vercel deploy --prebuilt --prod
```

- O `vercel.json` desliga o deploy automático da integração Git (`git.deploymentEnabled: false`): quem publica é só a pipeline, sempre depois da migration.
- A aplicação na Vercel usa o pooler em modo TRANSAÇÃO (6543) com `DB_POOL_MAX=5`.
- Durante a transição, uma falha no `deploy-vercel` deixa o commit com um check vermelho, e o Render (`checksPass`) não publica esse commit. Para desacoplar na hora, mude a variável `DEPLOY_VERCEL` para `false`.

## 5. Fase 1 — Código (feito em 23/11/2026)

| Mudança | Arquivo(s) | Por quê |
|---|---|---|
| Preparo do banco extraído para um script | `scripts/preparar-banco.mjs`, `scripts/start-prod.mjs`, `npm run db:preparar` | Na Vercel não existe "partida do servidor" para rodar migrations. O mesmo script roda no boot do Render/Docker e na pipeline. |
| Migrations recusam o pooler em modo transação | `scripts/migrate.mjs` | O advisory lock das migrations é de sessão; na porta 6543 ele seria pego numa conexão e liberado em outra. |
| `attachDatabasePool` e ociosidade de 5 s na Vercel | `src/lib/db.ts` (`@vercel/functions`) | Fecha as conexões ociosas antes de a função ser suspensa, sem prendê-las no pooler do Supabase. Fora da Vercel não faz nada. |
| Reserva atômica da sincronização do INMET | `src/modules/integracoes/avisos.service.ts`, migration 0014 | O `pg_try_advisory_lock` (sessão) ficaria preso atrás do pooler em modo transação, e a sincronização responderia "em-andamento" para sempre. |
| Revogação de token no banco | `src/lib/auth/revogacao.ts`, `src/lib/auth/sessao.ts`, migration 0014 | Em memória, um logout numa instância não valia nas outras. A consulta roda em paralelo com a do usuário (sem latência extra). |
| Tabelas fora da API REST do Supabase | migration 0015 | O Supabase dá acesso às tabelas de `public` aos papéis `anon`/`authenticated` pela Data API. Sem RLS, `usuario` e `abrigado` (CPF) ficariam expostos. Fora do Supabase a migration não faz nada. |
| Deploy na Vercel pela pipeline | `.github/workflows/ci-cd.yml`, `vercel.json` | Modelo A (seção 4). |
| Manter o Supabase ativo | `.github/workflows/manter-supabase-ativo.yml` | O plano Free pausa projetos após 7 dias sem uso. |
| Documentação | `.env.example`, `README.md`, este arquivo | |

Verificado localmente: typecheck, lint, 149 testes (unitários + integração), boot de produção pelo `start-prod` com as migrations 0014/0015, login → logout → token recusado (401), e a migration 0015 num banco com os papéis `anon`/`authenticated` simulados (sem acesso às tabelas atuais nem às criadas depois).

**Não verificado localmente:** o `vercel build`. No Windows ele falha ao criar links simbólicos (exige o Modo de Desenvolvedor); na pipeline ele roda no Linux. O primeiro deploy pela pipeline é o teste.

## 6. Fase 0 — Passos manuais (contas e painéis)

Fazer nesta ordem. Os nomes de menu podem variar um pouco entre versões dos painéis.

### 6.1 Supabase
1. Criar o projeto: nome `wheretogo`, região **South America (São Paulo)**, plano Free. Guardar a senha do banco num gerenciador de senhas.
2. **Desligar a Data API** (configurações da Data API do projeto). A aplicação não usa essa API; a migration 0015 já tira o acesso das tabelas, e isto fecha a porta de vez.
3. Botão **Connect** → copiar duas URLs, trocando `[YOUR-PASSWORD]` pela senha:
   - **Transaction pooler** (porta **6543**) → `DATABASE_URL` da Vercel.
   - **Session pooler** (porta **5432**) → secret `SUPABASE_DB_URL_SESSAO` do GitHub.
   - Se a senha tiver caracteres especiais, codifique-os na URL (ex.: `@` → `%40`, `#` → `%23`).
4. PostGIS: a migration 0001 cria a extensão. Se o primeiro deploy falhar nesse ponto, habilite em **Database → Extensions** e rode o workflow de novo.

### 6.2 Vercel
5. Entrar com a conta do GitHub (plano Hobby) → **Add New → Project** → importar `ADS_JoaoVitor_WhereToGo`.
6. **Project Name:** o nome define o endereço (`<nome>.vercel.app`). Sugestão: `wheretogo-upf`.
7. **Environment Variables** (Production):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URL do Transaction pooler (6543) |
   | `DATABASE_SSL` | `true` |
   | `DB_POOL_MAX` | `5` |
   | `JWT_SECRET` | nova, com 32+ caracteres: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `JWT_EXPIRES_IN` | `8h` |
   | `PROXIES_CONFIAVEIS` | `1` |
   | `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `PERMITIR_GOOGLE_SIMULADO` | os mesmos do Render, se estiverem definidos lá (aba Environment do serviço) |

   Não defina `NODE_ENV` (a Vercel já usa `production`). As variáveis do INMET têm padrão e são opcionais.
8. Clicar em **Deploy**. Esse primeiro deploy vem da importação e pode falhar ou abrir sem dados (o banco ainda está vazio): pode ignorar, a pipeline substitui.
9. **Settings → Build and Deployment → Node.js Version:** `22.x`.
10. Copiar os identificadores: **Project ID** (Settings → General do projeto) e **Team ID** da conta (Settings da conta/time → General; é o `VERCEL_ORG_ID`).
11. Criar um token: **Account Settings → Tokens** (escopo da sua conta; anote a expiração e renove antes de vencer).

### 6.3 GitHub (repositório → Settings → Secrets and variables → Actions)
12. **Secrets:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_DB_URL_SESSAO`.
    - `SEED_SENHA_PADRAO` é opcional: sem ele, a senha das contas de demonstração continua `WhereToGo@2026`, a mesma que os botões de "Contas de demonstração" do login usam. **Não mude** sem mudar a tela de login.
13. **Variables:** `DEPLOY_VERCEL` = `true`; `URL_PRODUCAO_VERCEL` = `https://<nome>.vercel.app` (sem barra no fim).

### 6.4 Google Cloud (só se o login real do Google estiver configurado)
14. **APIs & Services → Credentials →** cliente OAuth → **Authorized JavaScript origins:** adicionar `https://<nome>.vercel.app`.

### 6.5 Primeiro deploy
15. Enviar o commit da Fase 1 para a `main` (o Render também recebe e aplica as migrations 0014/0015 no boot, sem efeito visível).
16. Se o push acontecer antes dos passos 12–13, o job `deploy-vercel` aparece como ignorado: depois de configurar, use **Actions → CI → Run workflow** na `main`.
17. Em **Actions → Manter o Supabase ativo → Run workflow**, rodar uma vez para confirmar o ping.

## 7. Fase 2 — Validação (Render continua sendo a produção)

- [ ] `https://<nome>.vercel.app/api/health` responde `status: ok` e uma versão do PostGIS.
- [ ] No Supabase (Table Editor ou SQL): `schema_migrations` tem 15 linhas e `usuario` tem as contas de demonstração.
- [ ] Login pelas contas de demonstração (coordenador, voluntário, admin, defesa civil) e pelo Google, se configurado.
- [ ] Mapa público, ficha do abrigo, PIX, filtros, "perto de mim".
- [ ] Painel: dashboard, inventário (entrada/saída/estorno), abrigados, ocorrências, relatórios CSV e FIDE.
- [ ] Avisos do INMET: no Supabase, `integracao_estado` com `ultima_tentativa` recente e `em_andamento_ate` vazio.
- [ ] Logout e, em seguida, o mesmo token recusado (já coberto pelos testes; conferir uma vez na Vercel).
- [ ] Console do navegador sem bloqueios de CSP; PWA instala e o service worker registra.
- [ ] Log de auditoria (aba Auditoria) com o IP real de quem acessou, não um IP da Vercel.
- [ ] Opcional: `npm run test:e2e` com `E2E_BASE_URL=https://<nome>.vercel.app`. **Atenção:** os testes E2E gravam dados (um evento "Evento e2e" e uma ocorrência regional) que aparecem nos relatórios da demonstração.
- [ ] Acompanhar uso: Vercel (Usage: CPU ativa, invocações) e Supabase (Reports: conexões, tamanho do banco).

## 8. Fase 3 — Virada

Sem dados a migrar (decisão 1). Basta:
- Tornar a URL da Vercel a oficial: README, apresentação, QR codes, materiais da UPF.
- Manter o Render no ar alguns dias como reserva, até a Fase 4.

## 9. Fase 4 — Retirada do Render (antes de 12/12)

### 9.1 Arquivos do repositório
- Apagar `render.yaml`.
- `git grep -n -i render` para achar o restante. Hoje:
  - `.github/workflows/ci-cd.yml`: comentário do topo (o job `deploy-vercel` e a variável `DEPLOY_VERCEL` ficam).
  - `scripts/start-prod.mjs`: cabeçalho, "Caso 2" (Node nativo do Render) e comentário do `HOSTNAME`. O script fica (Docker Compose).
  - Regex de SSL com `@dpg-|render\.com` em `src/lib/db.ts` e `scripts/migrate.mjs`.
  - Comentários em `src/app/api/health/route.ts`, `src/lib/http.ts`, `src/lib/env.ts`, `src/modules/integracoes/avisos.service.ts` e `.env.example`.
  - `README.md`: a Opção 1 (Render) sai e a Vercel + Supabase vira a opção principal; a linha de tecnologias.
  - `.specs/plano-tarefas-pendentes.md` (item sobre o tier gratuito do Render).
- **Ficam:** `Dockerfile`, `docker-compose*.yml` e `output: "standalone"` (desenvolvimento local e alternativa de self-host).
- **Não mexer:** os PDFs `Relatorio_Arquitetura_WhereToGo*.pdf` (entregas já feitas).

### 9.2 Painéis
- **Render:** suspender o web service e, depois de alguns dias sem falta, excluir o web service, o banco `wheretogo-db` e o Blueprint. (Os dados são só seed: não precisa de backup.)
- **GitHub:** revogar o acesso do app do Render ao repositório (Settings → Integrations → GitHub Apps, ou nas configurações da sua conta). Se a `main` tiver regra de proteção exigindo um check do Render, remover essa exigência.
- **Google Cloud:** remover a origem `onrender.com` do cliente OAuth.

## 10. Limitações aceitas no MVP

- **Limitador de tentativas por instância** (`src/lib/limitador.ts`): o limite efetivo cresce com o número de instâncias. Com o tráfego do MVP, a Vercel usa poucas instâncias. Evolução: guardar as contagens no banco ou usar o firewall da Vercel.
- **Cache do mapa público por instância** (`src/modules/publico/publico.cache.ts`): em serverless, o `revalidateTag` não chega às outras instâncias. Quem segura a carga é a CDN (`s-maxage=10, stale-while-revalidate=60`), então uma mudança de status pode levar de alguns segundos a ~1 min para aparecer no mapa público. No Render ela aparecia na hora. Evolução: `use cache: remote` (tem custo) ou reduzir o `stale-while-revalidate`.
- **Versão do Postgres:** o CI usa a imagem `postgis/postgis:16`. Se o projeto Supabase for criado em outra versão principal (ex.: 17), alinhar a imagem do CI.

## 11. Volta atrás (rollback)

- Até a Fase 4: divulgar de novo a URL do Render; `DEPLOY_VERCEL=false` para parar de publicar na Vercel.
- Depois: **Instant Rollback** da Vercel (volta para um deploy anterior). As migrations são só aditivas (tabela e coluna novas), então o código anterior continua funcionando com o banco novo.

## 12. Fontes (consultadas em 23/11/2026)

- Vercel: [Hobby](https://vercel.com/docs/plans/hobby), [Limits](https://vercel.com/docs/limits), [Connection pooling com Fluid compute](https://vercel.com/kb/guide/connection-pooling-with-functions), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json), [CI/CD externo](https://vercel.com/docs/git/external-pipelines)
- Supabase: [Pricing](https://supabase.com/pricing), [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres), [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- Render: [Deploy for Free](https://render.com/docs/free)
- Next.js 16 (docs do pacote): `node_modules/next/dist/docs/01-app/02-guides/deploying-to-platforms.md` e `03-api-reference/01-directives/use-cache.md`
