# Tarefa da Semana 2: Backend (Regras de Negócio), Fast-CRUD e Log de Auditoria Imutável

## Status: ✅ CONCLUÍDA

---

## 🎯 Escopo da Entrega (Semana 2)
Conforme estabelecido no Cronograma de Codificação (Seção 3.1 do DVP):
> *"Desenvolvimento das rotas da API para cadastro de abrigos, endpoints do inventário (Fast-CRUD) e implementação da gravação assíncrona do Log de Auditoria Imutável."*

Referência completa dos endpoints: `.specs/context/06-api.md`.

---

## 📋 Checklist de Implementação

### 1. Revisão do modelo de dados
- [x] Análise do DER v2 (draw.io) frente ao escopo e correção de 16 inconsistências (detalhadas em `04-database-model.md`, seção 2.2), entre elas:
  - lotação derivada dos abrigados (fim das duas fontes de verdade);
  - status "Transferido" removido (transferência é evento, não estado);
  - movimentações com sinal, tipos de transferência com direção e `AJUSTE`;
  - saldo de estoque derivado do livro-razão por trigger;
  - nova entidade `OCORRENCIA_INFRAESTRUTURA` (incidentes simultâneos com histórico e localização);
  - campos de RF07 no abrigo (endereço, telefone, PIX), `ativo` em abrigo/usuário/item, `quantidade_minima` (RF04).
- [x] Regras de integridade no banco (`0002_regras_de_integridade.sql`): imutabilidade, saldo, lotação, transferência, vínculo usuário/abrigo, status de infraestrutura.
- [x] Novos requisitos para entidades sem RF: **RF10** (abrigos), **RF11** (usuários), **RF12** (abrigados/transferências), **RF13** (auditoria/histórico).

### 2. Cadastro de abrigos (RF10) e dashboard (RF04)
- [x] `GET|POST /api/abrigos`, `GET|PATCH /api/abrigos/{id}` com campos editáveis por papel (PIX somente ADMIN).
- [x] Regras: capacidade ≥ lotação; desativação apenas com abrigo vazio.
- [x] `GET /api/abrigos/{id}/dashboard`: ocupação (verde/amarelo/vermelho), acolhidos nas últimas 24h, itens críticos (urgentes ou abaixo do mínimo), ocorrências e últimas movimentações.

### 3. Inventário Fast-CRUD (RF02 / RF03)
- [x] `POST /api/abrigos/{id}/estoque/{itemId}/movimentacoes` (`{ "quantidade": 1 }` / `-1`), com tipos `ENTRADA_DOACAO`, `SAIDA_CONSUMO`, `PERDA` e `AJUSTE` (coordenador, por diferença ou contagem física).
- [x] Estoque nunca negativo (CHECK no banco → `409 ESTOQUE_INSUFICIENTE`) e saldo = soma das movimentações.
- [x] `GET /api/abrigos/{id}/estoque?incluirCatalogo=true` para a tela touch.
- [x] `PATCH /api/abrigos/{id}/estoque/{itemId}`: status URGENTE/NORMAL/BLOQUEADO e estoque mínimo.
- [x] Histórico paginado (`GET /api/abrigos/{id}/movimentacoes`) e transferência atômica de itens entre abrigos.
- [x] Catálogo macro/micro mantido pelo ADMIN (`/api/categorias`, `/api/itens`).

### 4. Log de Auditoria Imutável (RNF03 / RF13)
- [x] Gravação assíncrona com `after()` (após o envio da resposta), com usuário, abrigo, ação, descrição, detalhes JSON e IP.
- [x] Imutabilidade garantida por triggers (UPDATE/DELETE/TRUNCATE recusados).
- [x] Consulta filtrada e paginada (`GET /api/auditoria`), com escopo por papel.

### 5. Demais regras de negócio do backend
- [x] Ocorrências de infraestrutura (RF05) com resumo automático no abrigo.
- [x] Abrigados (RF12): check-in com controle de capacidade, reentrada por CPF, desligamento e transferência com histórico.
- [x] Usuários (RF11): ADMIN gerencia todos; coordenador gerencia voluntários do próprio abrigo; sempre resta um ADMIN ativo.
- [x] API pública (RF06–RF09): mapa com destaque por necessidade e proximidade PostGIS, card com PIX e rotas, categorias e alertas, em JSON ou GeoJSON.

### 6. Qualidade
- [x] Testes: 21 unitários, 40 de integração (PostGIS real, banco recriado a cada execução) e 12 e2e HTTP.
- [x] `npm run lint`, `npm run typecheck` e `npm run build` sem erros; stack Docker validada (migrate → app healthy).

---

## ▶️ Próximos passos (Semana 3)
- Tela de login segmentado consumindo `POST /api/auth/login` e `redirecionarPara`.
- `proxy.ts` protegendo as páginas `/admin/*` (redireciona para `/login` sem sessão).
- Dashboard de triagem (`GET /api/abrigos/{id}/dashboard`) e tela de ocorrências de infraestrutura.
