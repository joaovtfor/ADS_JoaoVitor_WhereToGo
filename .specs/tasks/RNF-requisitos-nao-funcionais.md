# Requisitos Não-Funcionais (RNF) - WhereToGo

Conforme definido na Seção 1.3.2 do Documento de Visão do Produto:

---

## RNF01 - Desempenho e Banda
- **Identificação**: RNF01
- **Descrição**: A Aplicação Web Pública deve ter carregamento quase instantâneo, utilizando design minimalista e requisições otimizadas para funcionar adequadamente em redes móveis degradadas (baixa largura de banda, como 3G instável ou conexões 2G/Edge).
- **Critérios de Verificação**:
  - Peso inicial da página (HTML/CSS/JS inicial) reduzido (< 300KB compactado).
  - PWA com Service Worker para cache agressivo de casca da aplicação (App Shell) e mapa estático.
  - Formato de dados geoespaciais enxuto (GeoJSON simplificado ou endpoints leves).
- **Backend (Semana 2)**: `/api/public/*` sem dados pessoais nem quantidades, `?formato=geojson`, `Cache-Control: s-maxage=10, stale-while-revalidate=30` para CDN. Service Worker/PWA ficam para as Semanas 5-6.

---

## RNF02 - Segurança Pública
- **Identificação**: RNF02
- **Descrição**: A Aplicação Web Pública não deve exigir nenhum tipo de login ou cadastro para ser acessada, garantindo acesso imediato à informação a sobreviventes, voluntários e doadores.
- **Critérios de Verificação**:
  - As rotas públicas de consulta (`/`, `/api/public/...`, `/api/referencias`, `/api/health`) não devem exigir tokens, cookies ou credenciais.
  - Zero atrito para obter rotas de fuga, localização de abrigos e chaves PIX.

---

## RNF03 - Segurança e Auditoria
- **Identificação**: RNF03
- **Descrição**: Todas as alterações de estoque e status no Painel Interno devem gerar logs de auditoria imutáveis, registrando o ID do usuário (autoria), a ação realizada, o timestamp e o endereço IP, visando inibir fraudes e desvios de doações.
- **Critérios de Verificação**:
  - Tabela `LOG_AUDITORIA` sem permissão de UPDATE ou DELETE (apenas INSERT).
  - Execução assíncrona/background para não degradar a latência do Fast-CRUD.
- **Implementação**:
  - Triggers `fn_bloquear_alteracao_imutavel` recusam UPDATE, DELETE e TRUNCATE em `LOG_AUDITORIA`, `MOVIMENTACAO_ESTOQUE` e `TRANSFERENCIA_ABRIGADO` (vale até para acesso direto ao banco).
  - O log é gravado com `after()` do Next.js, depois do envio da resposta; falhas de gravação não derrubam a operação e o evento completo vai para o log do servidor.
  - O histórico de estoque (`MOVIMENTACAO_ESTOQUE`) é gravado na mesma transação da alteração: o saldo nunca muda sem registro.
  - Também são auditados login (sucesso/falha/bloqueio), logout, troca de senha e alterações de abrigos, usuários, catálogo, ocorrências e abrigados.

---

## RNF04 - Usabilidade (Eficiência / Fast-CRUD)
- **Identificação**: RNF04
- **Descrição**: A interface de gestão de inventário deve minimizar a necessidade de digitação (uso de teclado virtual em celulares), priorizando interações por toque (touch) com botões de incremento/decremento rápido (Fast-CRUD).
- **Critérios de Verificação**:
  - Alvos de toque grandes (mínimo de 48x48px no mobile).
  - Atualização com feedback tátil/visual imediato sem refresh de página.

---

## RNF05 - Arquitetura de Acesso (RBAC)
- **Identificação**: RNF05
- **Descrição**: O Painel Administrativo deve obrigatoriamente implementar controle de acesso baseado em papéis (RBAC - Role-Based Access Control), isolando ações destrutivas apenas para Coordenadores e Administradores.
- **Critérios de Verificação**:
  - Validação de papel (`ADMIN`, `COORDENADOR`, `VOLUNTARIO`) em middlewares de rota e handlers de API.
  - Voluntário não tem acesso a dashboards de triagem, edição de dados do abrigo ou exclusões.
- **Implementação**: matriz única de permissões em `src/lib/auth/rbac.ts` (`PERMISSOES`), verificada nos services junto com o escopo do abrigo do usuário (COORDENADOR/VOLUNTARIO só acessam o próprio abrigo). Matriz documentada em `.specs/context/06-api.md`. O usuário é revalidado no banco a cada requisição.
