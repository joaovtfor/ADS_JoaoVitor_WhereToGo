# Task: Semana 7 — Testes de Integração, Resiliência 3G Mobile-First e Pacote de Melhorias Comparativas

## Status: ✅ CONCLUÍDA

## Objetivo
Concluir as entregas da **Semana 7** do cronograma (resiliência em redes 3G/offline, validação touch do Fast-CRUD e testes de integração/RBAC) combinadas com as **5 melhorias da Matriz de Priorização Comparativa** inspiradas em referenciais humanitários internacionais e nacionais (*Ushahidi*, *Sahana Eden*, *Google Person Finder* e *SOS RS*).

## Entregas Realizadas
1. **Prioridade 1 (Quick Win) — Selo de Atualização Recente (*Freshness Badge*) + Fila Offline 3G**:
   - **Selo de Confiabilidade Temporal (`obterSeloAtualizacao`)**: Exibido nos cards de detalhes do abrigo (`src/components/mapa/ficha-abrigo.tsx`), na lista de abrigos, nos cards de alertas (`src/components/mapa/paineis-laterais.tsx`) e nos itens do inventário (`src/app/admin/inventario/page.tsx`), classificando visualmente a idade do último dado (`🟢 Atualizado agora` / `🟢 Há X min`, `🟡 Há Xh`, `🟠 Há +Xh`).
   - **Fila Offline 3G no Fast-CRUD (`wtg:inventario:fila-offline`)**: Quando o voluntário toca em `+1`/`-1`/`+5`/`-5` durante oscilações de sinal 3G, o lançamento otimista é preservado na tela, enfileirado no `localStorage` e sincronizado automaticamente ao detectar o evento `online` ou pelo botão `🔄 Sincronizar agora`.
2. **Prioridade 2 (Quick Win) — Tags de Perfil Humanitário (`🐾 Aceita Pets`, `♿ Acessível PCD`)**:
   - Migração `db/migrations/0010_melhorias_semana7.sql` adicionando `aceita_pets` e `acessivel_pcd` na tabela `abrigo`.
   - Filtros rápidos `🐾 Aceita pets` e `♿ Acessível PCD` na barra superior do mapa público, selos nos cards de abrigo e botões de alternância em 1 clique no Dashboard do Coordenador (`src/app/admin/dashboard/page.tsx`) e na Governança Global (`src/app/admin/geral/page.tsx`).
3. **Prioridade 3 (Médio) — Busca Pública de Familiares Acolhidos ("Encontre um Familiar" — LGPD)**:
   - Endpoint público `GET /api/public/acolhidos?busca=...` consultando acolhidos com `status_acolhimento = 'PRESENTE'` e aplicando anonimização parcial compatível com a LGPD (abreviação de nomes do meio como `Maria A. Silva` e mascaramento de CPF como `***.456.789-**`).
   - Painel interativo `🔍 Encontrar familiar` no cabeçalho do mapa público (`PainelBuscaFamiliar`) com botão `🏠 Ver abrigo no mapa`.
4. **Prioridade 4 (Médio) — Alerta PostGIS de Trajeto Cruzando Polígono de Risco (`ST_Intersects`)**:
   - Cálculo espacial em `listarAbrigosPublicos` (`src/modules/publico/publico.service.ts`) usando `ST_Intersects(r.area_risco::geometry, ST_MakeLine(ponto_usuario, ponto_abrigo))` quando a localização do usuário está ativa.
   - Alerta vermelho preventivo na `FichaAbrigo` e na `ListaAbrigos` avisando quando a linha reta até o abrigo atravessa um polígono de risco ativo mesmo que o abrigo em si esteja fora da mancha.
5. **Prioridade 5 (Avançado) — Sugestão Automática de Transferência entre Abrigos (*Smart Rebalancing*) + Reporte Cidadão Moderado**:
   - **Rebalanceamento Inteligente (`sugestoesTransferencia`)**: Cruzamento geoespacial no `obterDashboard` (`ST_Distance`) entre abrigos com estoque crítico/urgente e abrigos parceiros próximos com excedente (`>= 2x mínimo` ou `BLOQUEADO`), permitindo remessa em 1 clique no Dashboard.
   - **Reporte Cidadão Moderado (`POST /api/public/reportes` + `POST /api/abrigos/[id]/ocorrencias/[ocorrenciaId]/moderacao`)**: Cidadãos podem enviar relatos de vias bloqueadas/alagamentos pelo mapa público com status inicial `PENDENTE` (sem contaminar o mapa nem o status do abrigo até a revisão); Coordenadores e Admins aprovam ou descartam o relato em 1 clique.
