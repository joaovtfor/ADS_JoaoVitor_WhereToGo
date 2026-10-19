# WhereToGo — Design System & Guia de UI/UX ("Crisis-First UI")

> **Status:** Especificação Oficial de Design (v1.0)  
> **Escopo:** Painel Operacional (`/admin/**`), Autenticação (`/login`) e Portal Público de Mapa & Doações (`/`, Semanas 5 e 6)  
> **Foco:** Simplicidade radical, ergonomia tátil sob estresse, consistência de permissões (RBAC) e performance em redes 3G degradadas (`RNF01` / `RNF04`).

---

## 1. Filosofia e Princípios de Design

Em cenários de desastres naturais e emergências climáticas, usuários operam sob **alta carga cognitiva, fadiga física, iluminação precária, conexões instáveis (3G) e baterias escassas**. A interface do **WhereToGo** segue cinco princípios inegociáveis:

1. **Calma Cognitiva e Linguagem Humana (Zero Jargão Técnico)**
   - A interface de produção **nunca** deve exibir códigos internos de engenharia ou requisitos acadêmicos (ex.: `RF02`, `RNF04`, `Fast-CRUD`, `Trigger WTG01`, `PostGIS`).
   - Títulos e subtítulos devem responder imediatamente *"Onde estou?"* e *"O que posso fazer aqui?"* em linguagem direta e acolhedora.
2. **Ergonomia "Thumb-First" (Uma Mão / Zero Teclado)**
   - Voluntários frequentemente seguram pranchetas, caixas de mantimentos ou lanternas com uma das mãos.
   - Ações recorrentes devem estar na zona de alcance do polegar, com alvos de toque mínimos de **$48 \times 48\text{px}$** e espaçamento mínimo de **$8\text{px}$** entre botões adjacentes para evitar toques acidentais.
3. **Divulgação Progressiva (*Progressive Disclosure*)**
   - Mostrar no card principal **apenas os dados e botões usados em 90% das operações**.
   - Controles administrativos secundários (ajustar estoque mínimo, transferir entre abrigos, bloquear item) devem ficar agrupados em uma área secundária recolhível ou modal dedicado, reduzindo a poluição visual.
4. **Semântica Estrita de Semáforo (Cor = Significado Operacional)**
   - Cores vibrantes não são decorativas; elas comunicam estado crítico instantaneamente.
   - Todo estado colorido deve ser acompanhado de **ícone ou rótulo textual** para garantir acessibilidade a pessoas com daltonismo.
5. **Performance Resiliente e Economia de Energia (OLED Dark UI)**
   - O tema escuro de alto contraste reduz o consumo de bateria em telas OLED/AMOLED durante quedas de energia e evita ofuscamento noturno em abrigos.
   - Orçamento rigoroso de rede (`< 300 KB` gzip no carregamento inicial), zero fontes externas bloqueantes e zero *layout shift* (CLS) durante atualizações de estado.

---

## 2. Tokens de Design

### 2.1. Camadas de Superfície e Esquema Nativo (`color-scheme: dark`)

> **Regra Crítica de CSS Global:** O elemento `html` deve declarar explicitamente `color-scheme: dark;` em `src/app/globals.css`. Sem isso, navegadores Windows e Android em modo claro renderizam menus nativos (`<select>`, `<option>`, `<input type="date">`) com fundo branco e texto branco (`text-white`), tornando-os ilegíveis.

| Token Semântico | Classe Tailwind | Hex Referência | Uso Recomendado |
| :--- | :--- | :--- | :--- |
| **Canvas (Fundo Base)** | `bg-slate-950` | `#020617` | Fundo geral da página e áreas externas ao conteúdo. |
| **Surface 1 (Card / Painel)** | `bg-slate-900` | `#0f172a` | Cards de inventário, painéis de formulário, barras fixas (com `/90 backdrop-blur`). |
| **Surface 2 (Elemento Interativo)** | `bg-slate-800` | `#1e293b` | Inputs, selects, botões secundários neutros, pílulas de filtro inativas. |
| **Surface 3 (Hover / Destaque)** | `bg-slate-700` | `#334155` | Estado `:hover` e `:active` de botões neutros. |
| **Border Subtle** | `border-slate-800` | `#1e293b` | Divisórias estruturais e bordas padrão de cards. |
| **Border Interactive** | `border-slate-700` | `#334155` | Bordas de inputs, selects e botões táteis. |

### 2.2. Paleta Semântica (Semáforo Operacional)

| Estado Semântico | Cor Base | Fundo de Badge / Alerta | Borda | Texto | Aplicação no Sistema |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Seguro / Normal / Operacional** | Esmeralda | `bg-emerald-950/60` | `border-emerald-700/60` | `text-emerald-300` | Abrigo com vagas (`< 80%`), infraestrutura operacional, estoque acima do mínimo, check-in ativo. |
| **Atenção / Parcial / Urgente** | Âmbar | `bg-amber-950/60` | `border-amber-600/60` | `text-amber-300` | Lotação em alerta (`80%–99%`), infraestrutura parcial, insumo em falta (`URGENTE`). |
| **Crítico / Interditado / Lotado** | Rosa/Vermelho | `bg-rose-950/60` | `border-rose-600/60` | `text-rose-300` | Abrigo lotado (`100%`), via interditada, infraestrutura inoperante, item bloqueado ou ação destrutiva. |
| **Ação Primária / Institucional** | Azul | `bg-blue-600` (sólido) | `border-blue-500` | `text-white` | CTAs primários ("Salvar", "Concluir Check-in", aba ativa, foco de inputs `focus:border-blue-500`). |
| **Transferência / Logística** | Violeta/Ciano | `bg-indigo-950/60` | `border-indigo-700/60` | `text-indigo-300` | Indicadores de transferência entre abrigos (`TRANSFERIDO`) ou escopo global administrativo. |

### 2.3. Tipografia e Numerais Tabulares

- **Família Tipográfica:** Pilha nativa do sistema (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) — zero latência de rede (`0 KB` de download de fontes) e renderização imediata no primeiro pacote HTML.
- **Numerais Tabulares (`tabular-nums`):**
  - **Obrigatório** aplicar a classe `tabular-nums` em todos os contadores numéricos (quantidades de estoque, ocupação `42/100`, porcentagens e timestamps).
  - *Por quê?* Evita que o card "pule" ou mude de largura quando um voluntário clica rapidamente em `+1` ou `-1` (ex.: mudando de `11` para `20`).
- **Escala Tipográfica Simplificada:**
  - **Título de Página (`h1`):** `text-lg sm:text-xl font-bold tracking-tight text-white`
  - **Título de Seção / Card (`h2`/`h3`):** `text-base font-semibold text-white`
  - **Contador Principal (KPI / Estoque):** `text-2xl sm:text-3xl font-extrabold tabular-nums text-white`
  - **Corpo / Inputs:** `text-sm text-slate-200` (inputs no mobile devem usar `text-base` / `16px` para evitar auto-zoom forçado no iOS Safari).
  - **Metadados / Labels Secundários:** `text-xs font-medium text-slate-400`

---

## 3. Arquitetura de Informação e Fluxos por Permissão (RBAC UX)

Para evitar frustração operacional (como abas que redirecionam o usuário ou botões que retornam erro `403`/`409`), a interface adapta sua estrutura estritamente ao papel do usuário:

| Perfil | Objetivo Principal | Navegação Visível | Contexto de Abrigo no Topo | Restrições de Interface |
| :--- | :--- | :--- | :--- | :--- |
| **Cidadão / Doador** *(Público)* | Encontrar abrigo seguro com vagas ou saber onde doar insumos urgentes. | Mapa Interativo + Lista de Abrigos + Filtros Rápidos (Pílulas). | Sem seletor de abrigo fixo; visualização aberta de todos os abrigos ativos. | Zero acesso a dados pessoais de acolhidos (LGPD `RNF03`) ou controles internos. |
| **Voluntário** (`VOLUNTARIO`) | Operação de linha de frente rápida: atualizar estoque (`+`/`-`) e fazer check-in na portaria. | **Apenas 2 abas:**<br>1. `Estoque`<br>2. `Acolhidos` | Exibe o nome e status do seu abrigo vinculado (somente leitura). | Não vê `Dashboard`, `Infraestrutura` nem `Gestão Geral`. Nos cards de estoque, vê apenas os botões rápidos de quantidade (sem botões de bloqueio, transferência ou limite mínimo). |
| **Coordenador** (`COORDENADOR`) | Gerenciar seu abrigo: monitorar lotação, reportar infraestrutura, controlar estoque/doações e cadastrar voluntários locais. | **5 abas:**<br>1. `Visão Geral` (Dashboard)<br>2. `Estoque`<br>3. `Infraestrutura`<br>4. `Acolhidos`<br>5. `Equipe & Auditoria` | Exibe o status do seu abrigo vinculado com atalho rápido para atualizar capacidade/contato. | Na aba `Equipe & Auditoria`, vê apenas as sub-abas pertinentes ao seu escopo (`Equipe Local` e `Auditoria`), sem abas globais de criação de abrigos ou catálogo mestre. |
| **Administrador** (`ADMIN`) | Governança municipal/estadual: gerenciar todos os abrigos, catálogo global, transferências e auditoria completa. | **5 abas:**<br>1. `Visão Geral`<br>2. `Estoque`<br>3. `Infraestrutura`<br>4. `Acolhidos`<br>5. `Governança Global` | Seletor de abrigo ativo nas 4 primeiras abas; **indicador de "Escopo Global"** quando estiver na 5ª aba (`Governança Global`). | Se selecionar um abrigo `[INATIVO]` no seletor, um banner âmbar fixo avisa que o abrigo está em modo somente-leitura até ser reativado. |

---

## 4. Padrões de Componentes e Layout

### 4.1. App Shell e Navegação Mobile-First (`/admin/**`)

- **Cabeçalho Superior Enxuto (`Top Bar`):**
  - Deve ocupar no máximo `56px–64px` de altura no mobile.
  - Exibe: Identidade compacta (`WhereToGo`), Seletor/Badge do Abrigo Ativo, Pílula Semafórica de Lotação (`45/100`) e botão de Sair.
- **Navegação Principal Adaptativa:**
  - **Desktop (`>= md`):** Barra de abas horizontal integrada ao cabeçalho.
  - **Mobile (`< md`):** **Barra de Navegação Inferior Fixa (*Sticky Bottom Bar*)** com ícones claros e rótulos curtos (`Visão Geral`, `Estoque`, `Infra`, `Acolhidos`, `Gestão`). Fica sempre sob o polegar do operador e evita rolagem horizontal no topo.

### 4.2. Notificações e Feedback (*Toast* Flutuante vs Banner)

- **Problema evitado:** Inserir alertas de sucesso/erro no fluxo do documento empurra todos os botões para baixo, fazendo o usuário errar o próximo toque.
- **Padrão Oficial:** Feedbacks de ações (`"+1 Água Mineral registrado"`, `"Check-in concluído"`) devem aparecer como **Toast flutuante** (`fixed bottom-20 right-4 md:bottom-6 z-50`) com auto-fechamento em `3.5s` e botão de fechar manual, mantendo o layout 100% estável.

### 4.3. Card de Estoque (Fast-CRUD Simplificado)

O card de item de estoque é dividido em **duas zonas claras**:

1. **Zona Primária (Visível para Todos):**
   - Nome do item, categoria, badge semafórico (`Normal`, `Urgente`, `Bloqueado`) e contador grande `tabular-nums` com unidade (`un`, `L`, `kg`) e meta mínima discreta (`Mín: 50`).
   - **Grade de Ação Rápida (4 colunas + 1 botão de lote):**
     - `[-5]` `[-1]` `[+1]` `[+5]` com altura mínima de `48px` (`min-h-12`).
     - Botão discreto `Lote (+/-)` para quando chega um caminhão ou palete grande.
2. **Zona de Governança (Exclusiva para `COORDENADOR` e `ADMIN` — Divulgação Progressiva):**
   - Oculta por padrão atrás de um botão discreto `⚙️ Gerenciar item` no rodapé do card (ou linha compacta recolhível).
   - Ao expandir, exibe: alteração manual de status (`Forçar Urgente`, `Normalizar`, `Bloquear Doação`), ajuste de `Estoque Mínimo / Contagem Física` e `Transferir para outro abrigo`.

### 4.4. Prevenção de Erros em Ações Destrutivas

- **Regra de Segurança Operacional:** Nenhuma ação que encerre um vínculo ativo ou desative uma entidade (`Dar Saída` de acolhido, `Desativar` abrigo, `Revogar` usuário) pode ocorrer em **um único toque direto** ao lado de botões de uso frequente.
- **Padrão de Confirmação:**
  - Clicar em `Dar Saída` abre um modal compacto (ou transforma o botão em confirmação inline `Confirmar saída? [Sim] [Cancelar]`), prevenindo baixas acidentais em telas sensíveis ao toque.

### 4.5. Mapa Público e Portal de Doações (Diretrizes para Semanas 5 e 6)

- **Layout "Map-First":**
  - O mapa ocupa o centro da experiência.
  - **Topo Flutuante:** Barra de busca por bairro/abrigo + **Pílulas de Filtro Rápido** horizontais (`🟢 Com Vagas`, `🐾 Aceita Pets`, `🚨 Precisa de Doações`, `🛣️ Acesso Seguro`).
  - **Painel de Detalhes:** Sidebar lateral esquerda no Desktop (`w-96`) e **Bottom Sheet deslizante** no Mobile.
- **Marcadores (Pinos) Acessíveis:**
  - Verde (Círculo): Abrigo com vagas e operacional.
  - Âmbar (Triângulo/Alerta): Abrigo acima de 80% da capacidade ou com restrição parcial.
  - Vermelho (Octógono/Bloqueio): Abrigo lotado (100%) ou ponto de interdição viária (`ocorrencias_abrigos`).
- **Ação Direta para o Cidadão:**
  - Cada card de abrigo destaca no máximo **3 informações críticas** à primeira vista:
    1. Distância aproximada + Botão **"Traçar Rota Segura"**.
    2. Disponibilidade de vagas (Humanos e Pets) + Status de Energia/Água.
    3. Lista de **Itens Urgentes para Doação** (se houver).

---

## 5. Diretrizes de Performance e Resiliência (`RNF01`)

1. **Zero Waterfall de Autenticação:**
   - O `AdminShell` deve carregar dados iniciais em paralelo e preservar o esqueleto estrutural (Header + Navegação) visível durante transições de aba, evitando telas inteiras piscando em branco.
2. **Debounce em Campos de Busca (`300ms`):**
   - Inputs de pesquisa que disparam consultas à API (como busca de acolhidos por nome/documento em `/admin/abrigados`) **devem** aplicar *debounce* de `250ms–300ms` e cancelar requisições anteriores (`AbortController`), economizando banda 3G e conexões no banco.
3. **Inputs Mobile sem Auto-Zoom Indesejado:**
   - Em dispositivos móveis (`< sm`), todo `<input>`, `<select>` e `<textarea>` deve ter tamanho de fonte efetivo de `16px` (`text-base sm:text-sm`) para impedir que o navegador dê zoom brusco ao focar no campo.
4. **Atualização Otimista com Rollback Seguro:**
   - Ações de Fast-CRUD (`+1`, `-1`, `+5`, `-5`) atualizam o número na tela no mesmo milissegundo do toque (`< 16ms`) e sincronizam em background, revertendo o valor apenas se a API retornar erro.
