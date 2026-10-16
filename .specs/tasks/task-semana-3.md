# Tarefa da Semana 3: Frontend Administrativo (Login Segmentado, Dashboard de Triagem, Alertas de Infraestrutura e Governança)

## Status: ✅ CONCLUÍDA

---

## 🎯 Escopo da Entrega (Semana 3)
Conforme estabelecido no Cronograma de Codificação (Seção 3.1 do DVP) e no planejamento consolidado:
> *"Criação da tela de Login segmentado, tela de Dashboard de Triagem para Coordenadores e formulário de reporte de infraestrutura (energia e vias)."*

Além do escopo base, todas as interfaces administrativas do painel interno (`/admin/*`) foram construídas de forma integrada para permitir operação completa fim-a-fim dos requisitos `RF01`–`RF05` e `RF10`–`RF13`.

---

## 📋 Checklist de Implementação

### 1. Autenticação, Proxy de Borda e Shell Administrativo (RF01 / RNF05)
- [x] Cliente HTTP padronizado (`src/lib/cliente-api.ts`) consumindo o envelope `{ dados }` / `{ erro }` com cookies `httpOnly` (`wtg_sessao`).
- [x] Proxy de borda do Next.js 16 (`src/proxy.ts`) protegendo `/admin/*`:
  - Redireciona sessões ausentes/expiradas para `/login`.
  - Redireciona `/admin` para a rota inicial do papel (`rotaInicialPorPapel`).
  - Bloqueia acesso de `VOLUNTARIO` a `/admin/dashboard`, `/admin/ocorrencias` e `/admin/geral`.
- [x] Tela de Login Segmentado (`src/app/login/page.tsx`):
  - Autenticação via `POST /api/auth/login` com redirecionamento automático (`redirecionarPara`).
  - Atalhos rápidos de preenchimento das contas de demonstração do seed (`ADMIN`, `COORDENADOR`, `VOLUNTARIO`).
- [x] Contexto e Layout do Painel Interno (`src/app/admin/contexto-admin.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`):
  - Seletor global de abrigo ativo para `ADMIN` e indicador fixo de abrigo + semáforo de ocupação + status de infraestrutura para `COORDENADOR` e `VOLUNTARIO`.
  - Navegação filtrada por papel (`RBAC`) e modal de troca da própria senha (`PUT /api/auth/senha`).

### 2. Dashboard de Triagem do Coordenador (RF04 / RF03 / RF10)
- [x] Página `src/app/admin/dashboard/page.tsx` consumindo `GET /api/abrigos/{id}/dashboard`:
  - Semáforo visual de ocupação (`VERDE` < 70%, `AMARELO` 70–90%, `VERMELHO` > 90% ou lotado), vagas livres, acolhidos nominais (`PRESENTE`) e fila não triada (`acolhidosNaoTriados`).
  - Controles rápidos (`-5`, `-1`, `+1`, `+5`, `+10`) para ajuste imediato de `acolhidosNaoTriados` em chegadas em massa (`PATCH /api/abrigos/{id}`).
  - Edição rápida de capacidade máxima e telefone de emergência pelo Coordenador/Admin.
  - Lista de suprimentos críticos (`URGENTE` ou `ABAIXO_DO_MINIMO`) com botões diretos de classificação (`URGENTE` / `NORMAL` / `BLOQUEADO`).
  - Resumo das últimas movimentações de estoque e fluxo de acolhidos nas últimas 24h.

### 3. Reporte e Resolução de Ocorrências de Infraestrutura (RF05 / RF09)
- [x] Toggles rápidos de 1 clique no Dashboard (`src/app/admin/dashboard/page.tsx`) para os 7 tipos padronizados (`SEM_ENERGIA`, `SEM_AGUA`, `SEM_COMUNICACAO`, `VIA_BLOQUEADA`, `ALAGAMENTO`, `DESLIZAMENTO`, `RISCO_ESTRUTURAL`): clicar em inativo registra a ocorrência; clicar em ativo resolve no ato.
- [x] Página dedicada `src/app/admin/ocorrencias/page.tsx`:
  - Registro detalhado de ocorrências com tipo, gravidade (`ALERTA` / `CRITICO`), descrição e coordenadas GPS opcionais (incluindo captura via `navigator.geolocation`) para plotagem do ponto exato no mapa público (`RF09`).
  - Resolução com observação auditada e filtro de histórico de ocorrências resolvidas.

### 4. Gestão de Acolhidos e Transferências (RF12)
- [x] Página `src/app/admin/abrigados/page.tsx`:
  - Check-in nominal com validação de CPF e opção `descontarDaTriagem` (converte 1 vaga da fila não triada em cadastro nominal).
  - Busca por nome/CPF, filtro `PRESENTE`/`DESLIGADO`/`TODOS`, edição cadastral, desligamento e transferência entre abrigos ativos com histórico imutável (`GET|POST /api/abrigados/{id}/transferencias`).

### 5. Inventário Fast-CRUD e Governança Administrativa (RF02 / RF03 / RF10 / RF11 / RF13)
- [x] Página `src/app/admin/inventario/page.tsx` (`RF02`, `RF03`, `RF13`):
  - Abas de categorias macro, busca instantânea, toggle de itens com saldo zero e seletor de modo de saída (`SAIDA_CONSUMO` vs `PERDA`).
  - Botões touch (`-5`, `-1`, `+1`, `+5`) com atualização otimista/assíncrona e promoção automática `NORMAL -> URGENTE` abaixo do estoque mínimo.
  - Classificação `URGENTE`/`NORMAL`/`BLOQUEADO`, ajuste por contagem física (`AJUSTE`), configuração de estoque mínimo, transferência de suprimentos entre abrigos e histórico filtrável de movimentações (`GET /api/abrigos/{id}/movimentacoes`).
- [x] Página `src/app/admin/geral/page.tsx` (`RF10`, `RF11`, `RF02`, `RF13`):
  - Cadastro e edição completa de abrigos e chaves PIX oficiais (`ADMIN`).
  - Cadastro, edição e ativação/desativação de usuários (`ADMIN` gerencia todos; `COORDENADOR` gerencia voluntários do próprio abrigo).
  - Gestão do catálogo macro/micro de suprimentos (`ADMIN`).
  - Consulta filtrada (abrigo, ação, período) da trilha de auditoria imutável (`LOG_AUDITORIA`) com inspeção de `detalhes` JSON e IP.

---

## ▶️ Próximos Passos (Semanas 4 a 8)
- **Semana 4 (Refinamento de UX Mobile / Fast-CRUD)**: polimento de usabilidade touch em telas pequenas, feedback visual/sonoro opcional de operações rápidas, atalhos de lote e bateria de testes E2E das fluxos administrativos.
- **Semana 5 (Frontend Público — Mapa Interativo Leaflet + PostGIS)**: substituição da landing page temporária (`src/app/page.tsx`) pelo mapa público interativo (`RF06`) consumindo `/api/public/abrigos?formato=geojson` com marcadores coloridos por nível de ocupação e geolocalização do cidadão.
- **Semana 6 (Frontend Público — Roteamento de Doações, Cards PIX/Rotas e Alertas)**: barra de filtros rápidos de necessidade (`RF08`), bottom-sheet/card de detalhes do abrigo com cópia de PIX em 1 clique e deep-links Google Maps/Waze (`RF07`), e camada de alertas de risco viário (`RF09`) + Service Worker PWA (`RNF01`).
- **Semanas 7 e 8**: testes integrados fim-a-fim, simulação de rede 3G degradada, revisão de segurança e deploy final.
