# WhereToGo — Design System v2 ("Preto e Azul")

> **Status:** especificação oficial de design (v2.0, novembro de 2026). Substitui a v1.0 "Crisis-First UI".
> **Escopo:** mapa público (`/`), autenticação (`/login`) e painel operacional (`/admin/**`).
> **Resumo:** interface escura, quase sem cor. Preto e cinzas para a estrutura, **azul para ação e seleção**, e verde, âmbar e vermelho **somente** para comunicar estado.

---

## 1. Princípios

Quem usa o WhereToGo está sob estresse, muitas vezes no celular, com rede ruim e pouca bateria. A v1 respondia a isso com muitos sinais visuais ao mesmo tempo; a v2 responde com poucos sinais, cada um com um único significado.

1. **Uma cor, um significado.** Azul quer dizer "você pode agir aqui" ou "isto está selecionado". Verde, âmbar e vermelho querem dizer "este é o estado de um abrigo, item ou via". Nenhuma outra cor existe na interface. Categorias (pets, PCD, tipo de doação, perfil de usuário) não têm cor própria: usam ícone e texto.
2. **Hierarquia por tamanho e peso, não por cor ou caixa.** O dado mais importante da tela é o maior. Agrupamento se faz com espaço e divisórias, não com caixas dentro de caixas.
3. **Uma ação primária por tela ou painel.** Só ela é azul sólido. As demais são secundárias (neutras) ou ficam atrás de um menu "Mais".
4. **Linguagem humana.** A interface nunca mostra termos internos (`PostGIS`, `AREA_RISCO`, `RF02`, "One Tap"). Títulos respondem "onde estou?" e "o que posso fazer aqui?".
5. **Uma mão, sem teclado.** Alvos de toque de no mínimo 48 × 48 px em telas de toque (garantido em `src/app/globals.css`) e 8 px entre alvos vizinhos. Ações frequentes ficam ao alcance do polegar.
6. **Divulgação progressiva.** A primeira vista mostra o que se usa em 90% dos casos. O resto fica a um toque de distância.
7. **Leve por construção.** Sem fontes externas, sem `backdrop-blur`, sem sombras grandes, sem animação de `height`. Orçamento de 300 KB gzip no primeiro carregamento.

---

## 2. Tokens

Os valores ficam em `src/app/globals.css` (`--wtg-*`) e viram classes do Tailwind pelo bloco `@theme`. **Componentes usam só essas classes.** Paleta crua (`bg-slate-900`, `text-amber-300`) e hex fixo são proibidos nas pastas já migradas; o ESLint barra (veja a seção 7).

### 2.1. Cores

| Papel | Classe | Hex | Uso |
| :--- | :--- | :--- | :--- |
| Fundo | `bg-fundo` | `#000000` | Fundo da página. Preto puro economiza bateria em telas OLED. |
| Superfície | `bg-superficie` | `#0B0D12` | Cabeçalho, painéis, folhas, cartões. |
| Superfície 2 | `bg-superficie-2` | `#14171D` | Campos, botões secundários, linha em destaque. |
| Superfície 3 | `bg-superficie-3` | `#1E222A` | `:hover` e `:active` de elementos neutros. |
| Borda | `border-borda` | `#1F242D` | Divisórias e contorno de painéis. |
| Borda forte | `border-borda-forte` | `#333A46` | Contorno de campos e botões secundários. |
| Texto | `text-texto` | `#F4F6F8` | Títulos, valores, texto principal. |
| Texto 2 | `text-texto-2` | `#A9B1BD` | Texto de apoio, rótulos. |
| Texto 3 | `text-texto-3` | `#7C8696` | Metadados, placeholders. É o texto mais apagado permitido. |
| **Primária** | `bg-primaria` | `#2563EB` | Botão primário, item selecionado, marca. Texto branco por cima. |
| Primária forte | `bg-primaria-forte` | `#1D4ED8` | `:hover` do botão primário. |
| Primária clara | `text-primaria-clara` | `#60A5FA` | Azul como texto, ícone, foco e "você está aqui". |
| **Ok** | `bg-ok` / `text-ok-claro` | `#22C55E` / `#4ADE80` | Com vagas, operacional, estoque normal. |
| **Atenção** | `bg-atencao` / `text-atencao-claro` | `#F59E0B` / `#FBBF24` | Lotação de 70% a 90%, infraestrutura parcial, item em falta. |
| **Crítico** | `bg-critico` / `text-critico-claro` | `#EF4444` / `#F87171` | Lotado, inoperante, via interditada, ação destrutiva. |

Regras de uso:

- **Fundos tingidos** usam a cor com opacidade: `bg-primaria/15`, `bg-critico/12`. Nunca um fundo sólido de status em área grande.
- **Texto colorido** usa sempre a variante clara (`text-ok-claro`, `text-primaria-clara`), que tem contraste de pelo menos 4,5:1 sobre as superfícies.
- **Estado nunca depende só da cor.** Todo selo de status tem rótulo em texto; todo pino tem número.
- **Um estado, um sinal.** Nada de emoji + bolinha + cor + texto para a mesma informação: bolinha colorida e texto bastam.
- **Tema:** somente escuro (`color-scheme: dark`). Os tokens estão em `:root`, então um tema claro pode ser acrescentado depois redefinindo só os `--wtg-*`. O plano do tema claro está na seção 8.

### 2.2. Tipografia

Fonte do sistema (`system-ui`), sem download. Quatro tamanhos e três pesos:

| Classe | Tamanho | Uso |
| :--- | :--- | :--- |
| `text-meta` | 13 px | Metadados, rótulos de campo, selos, chips. Menor tamanho permitido. |
| `text-corpo` | 15 px | Texto padrão, botões, linhas de lista. |
| `text-titulo` | 18 px | Título de tela, painel ou ficha. |
| `text-numero` | 28 px | O número principal de um bloco (vagas, estoque, KPI). |

- **Pesos:** `font-normal` para texto, `font-medium` para rótulos e botões, `font-semibold` para títulos e números. `font-bold` e `font-black` saem do sistema.
- **Campos no celular** usam 16 px (`text-base sm:text-corpo`) para o iOS não dar zoom ao focar. Já está em `CLASSES_CAMPO`.
- **Números que mudam** (estoque, ocupação, horários) levam `tabular-nums` para o layout não pular.

### 2.3. Forma e profundidade

- **Dois raios:** `rounded-controle` (8 px) para botões, campos, chips e selos; `rounded-painel` (14 px) para painéis, folhas e modais. `rounded-full` só para bolinhas de status e o marcador "você está aqui".
- **Borda no lugar de sombra.** Elementos sobre o mapa têm `border-borda` e fundo opaco. Sem `backdrop-blur` e sem sombras grandes: custam caro em celulares fracos e não acrescentam informação.
- **Divisória no lugar de caixa.** Dentro de um painel, seções são separadas por `border-t border-borda` e espaço, não por cartões com borda própria.
- **Espaçamento** em múltiplos de 4 px: 8 entre itens relacionados, 16 entre grupos, 24 entre seções.

### 2.4. Ícones

- Um único conjunto: [lucide-react](https://lucide.dev), sempre pelo componente `Icone` (traço 1,75, 18 px por padrão, `aria-hidden`).
- **Emojis não são ícones.** Mudam de aparência por sistema operacional e trazem cores fora da paleta.
- Ícones herdam a cor do texto (`currentColor`). Só ficam coloridos quando o texto ao lado também está (ex.: um aviso crítico).

---

## 3. Arquitetura de Informação por Permissão (RBAC)

A interface mostra apenas o que o perfil pode usar. Nada de aba que redireciona ou botão que devolve `403`.

| Perfil | Objetivo | Navegação visível | Abrigo no topo | Restrições |
| :--- | :--- | :--- | :--- | :--- |
| **Cidadão / Doador** (público) | Achar abrigo com vagas ou saber onde doar. | Mapa, lista de abrigos, filtros. | Sem seletor; vê todos os abrigos ativos. | Nenhum dado pessoal de acolhidos (LGPD) nem controles internos. |
| **Voluntário** | Atualizar estoque e fazer check-in na portaria. | `Estoque`, `Acolhidos`. | Nome e estado do seu abrigo (somente leitura). | No estoque, vê só os botões de quantidade. |
| **Coordenador** | Gerir seu abrigo. | `Visão Geral`, `Estoque`, `Infraestrutura`, `Acolhidos`, `Equipe`. | Estado do seu abrigo, com atalho para editar capacidade e contato. | Em `Equipe`, só as sub-abas do seu escopo. |
| **Administrador** | Governança de todos os abrigos. | As cinco abas, com `Gestão` global. | Seletor de abrigo; rótulo "Todos os abrigos" na aba global. | Abrigo inativo selecionado mostra aviso de somente leitura (estado **atenção**). |

Perfis e escopos são texto neutro. Não há cor por perfil.

---

## 4. Componentes base (`src/components/ui`)

Toda tela é montada com estes componentes. Se um padrão novo aparecer em duas telas, ele vira componente aqui.

| Componente | Arquivo | Regra |
| :--- | :--- | :--- |
| `Botao` | `botao.tsx` | Variantes `primaria` (uma por tela), `secundaria` (padrão), `fantasma` (ações de baixa ênfase) e `perigo` (só destrutivas). Tamanhos `md` e `sm`. Para links, use `classesBotao()`. |
| `BotaoIcone` | `botao.tsx` | Botão quadrado só com ícone. `rotulo` é obrigatório e vira `aria-label`. |
| `Chip` | `chip.tsx` | Filtro liga/desliga com `aria-pressed`. Ligado é sempre azul, seja qual for o assunto. |
| `SeloStatus` | `selo-status.tsx` | Único lugar onde verde, âmbar e vermelho aparecem. Forma `ponto` (bolinha + texto neutro) por padrão; `preenchido` só quando o estado é a informação principal do bloco. |
| `Campo` / `CLASSES_CAMPO` | `campo.tsx` | Rótulo acima, dica ou erro abaixo. Erro em `text-critico-claro` com `role="alert"`. |
| `Icone` | `icone.tsx` | Invólucro dos ícones lucide com o traço e o tamanho padrão. |

| `Folha` | `folha.tsx` | Painel deslizante: folha inferior arrastável no celular, painel lateral no desktop. O arraste usa só `transform`, fora do estado do React. |

| `Menu` / `ItemMenu` | `menu.tsx` | Menu suspenso para ações de uso ocasional. Fecha ao escolher, ao clicar fora e com Esc. |
| `Modal` | `modal.tsx` | Janela para uma tarefa curta (trocar senha, confirmar). |
| `ProvedorToast` / `useToast` / `RegiaoToasts` | `toast.tsx` | Retorno de ação (seção 5.5). `useToast().mostrar("Salvo")` em qualquer componente dentro do provedor; `RegiaoToasts` decide onde a pilha aparece. |
| `ToastFlutuante` | `toast.tsx` | O mesmo toast, controlado por `erro` / `aviso`, no canto inferior das telas do painel. |

| `Abas` | `abas.tsx` | Abas dentro de uma tela: texto simples, a atual sublinhada em azul. |
| `CabecalhoPagina`, `Secao`, `EstadoVazio`, `Faixa` | `pagina.tsx` | Esqueleto de uma tela do painel: título com ações, blocos sem caixa, texto de lista vazia e faixa de aviso. |
| `ModalConfirmacao` | `modal.tsx` | Confirmação obrigatória de ações que encerram ou desativam algo. |

`className` nos componentes serve para layout (largura, margem, posição). Cor, tamanho de fonte e raio vêm da variante.

---

## 5. Padrões de tela

### 5.1. Mapa público (`/`)

O mapa é o conteúdo. Tudo que flutua sobre ele precisa justificar o espaço que ocupa.

- **Cabeçalho (uma linha):** marca, busca e duas ações: `Filtros` e `Lista`. Acesso da equipe, busca de familiar e atualização manual ficam no menu (ícone de hambúrguer, à direita). Os "três pontos" ficam só para o menu de ações de uma linha de lista no painel.
- **Filtros:** no máximo três atalhos visíveis (`Com vagas`, `Aceita pets`, `Precisa de doações`) e um botão `Filtros` que abre uma folha com todos os demais (categorias de doação, acessibilidade, distância, alertas). O botão mostra quantos filtros estão ativos. "Limpar" é um botão fantasma, não um alerta.
- **Pinos:** um retângulo arredondado com o **número de vagas**, preenchido com a cor do estado (ok, atenção, crítico). Lotado mostra `0`. No máximo um indicador extra: um ponto de aviso quando há problema de infraestrutura. Selecionado ganha anel azul. Nome do abrigo só aparece no pino selecionado.
- **Você está aqui:** ponto azul (`primaria-clara`) com halo.
- **Alertas no mapa:** área de risco e via interditada em contorno `critico` com preenchimento a 12%. Rótulo só ao tocar.
- **Mapa base:** escuro e neutro, para que a única cor sobre o mapa seja a dos pinos. São os tiles Humanitarian (HOT) de sempre, convertidos para cinza e invertidos por um filtro CSS no painel de tiles (`.leaflet-tile-pane` em `globals.css`). Assim não há provedor novo nem chave de API, e o cache offline de tiles continua valendo.
- **Ficha do abrigo:** folha inferior no celular, painel lateral no desktop. Ordem fixa:
  1. Nome, distância e `SeloStatus`.
  2. O número de vagas em `text-numero` e, ao lado, vagas para pets.
  3. Uma ação primária (`Traçar rota`) e ações secundárias em ícone (`Ligar`, `Compartilhar`). A rota sai sempre da localização atual (`origin` no link do Google Maps); sem localização ainda, o botão a pede nesta aba e só então abre o trajeto.
  4. Linhas simples separadas por divisória: energia, água, acessibilidade, itens urgentes para doação.
- **Abrigos perto de mim** (botão de localização na barra de resumo): sempre lê a localização de novo e abre o abrigo mais próximo **pela distância**, mesmo com outro abrigo aberto. Desligar a localização fica no painel `Filtros`, seção "Distância".
- **Legenda:** recolhida por padrão, atrás de um botão de ajuda.
- **Tooltips do mapa** (áreas de risco, vias): `width: max-content` com limite de 260 px, para o texto quebrar em linhas largas e não em uma coluna estreita.

### 5.2. Painel operacional (`/admin/**`)

- **Cabeçalho de uma linha (até 56 px):** marca, abrigo ativo com seu `SeloStatus`, menu do usuário.
- **Navegação:** barra lateral compacta (ícone sobre rótulo) a partir de `lg` e barra inferior fixa abaixo disso, com os mesmos itens. A aba atual é azul.
- **Menu da conta:** nome e perfil, alterar senha, ver mapa público e sair. Nenhuma dessas ações fica solta no cabeçalho.
- **Cabeçalho de página:** título e no máximo uma ação primária. Filtros em uma única linha; os menos usados vão para `Filtros`.
- **Listas:** linhas densas com divisória, em vez de um cartão por item. Cada linha mostra no máximo uma ação; as demais ficam no menu "..." da linha.
- **Telas grandes são divididas:** dados e ações em um hook ou na página, cada modal e cada aba em seu arquivo com estado próprio. Digitar em um campo não renderiza a lista ao lado.

### 5.3. Login (`/login`)

- Uma coluna, sem cartão: título, e-mail e senha, e "Entrar" como única ação azul.
- "Continuar com o Google" é secundário, abaixo de um divisor. Sem janelas flutuantes.
- Contas de demonstração ficam recolhidas atrás de um botão.
- O logotipo do Google mantém as cores oficiais da marca; é a única exceção à paleta.

### 5.4. Item de estoque

- **Sempre visível:** nome, `SeloStatus` (`Normal`, `Em falta`, `Bloqueado`), quantidade em `text-numero` com unidade e mínimo discreto.
- **Ação rápida:** `−5` `−1` `+1` `+5`, todos **secundários** (neutros), com 48 px de altura. Não são azuis nem âmbar: são quatro ações de mesmo peso.
- **Governança (coordenador e admin):** atrás de `Gerenciar` (ícone de engrenagem): mudar status, ajustar mínimo, transferir.

### 5.5. Feedback e erros

- **Toast** (`src/components/ui/toast.tsx`) para o retorno de uma ação. Nunca insere conteúdo no fluxo da página.
  - **Ciclo:** entra com fade e um deslize de 8 px vindo da borda onde a pilha está (220 ms), fica em tela e sai com fade (180 ms). Só `opacity` e `transform`; com movimento reduzido, só o fade.
  - **Tempo em tela por tipo:** `sucesso` 3,5 s, `info` 4,5 s, `aviso` 6 s, `erro` até ser fechado. O tempo para enquanto o ponteiro ou o foco está no toast.
  - **Cor:** só a bolinha. Verde, âmbar e vermelho seguem o estado; `info` é azul, porque confirma uma seleção.
  - **Onde:** no mapa, no alto da área do mapa (embaixo ficam a barra de resumo e a ficha); no painel, no canto inferior. No máximo três em tela; um toast com o mesmo `id` substitui o anterior (ex.: "Abrigo mais próximo: ...").
  - **Acessibilidade:** a pilha é uma região `aria-live="polite"` que existe mesmo vazia; o toast de erro leva `role="alert"`.
- **Avisos persistentes** (sem conexão, dados desatualizados, abrigo inativo) usam uma faixa com `SeloStatus` preenchido e texto curto.
- **Ações destrutivas** (`Dar saída`, `Desativar`, `Revogar`) usam a variante `perigo` e sempre pedem confirmação. Nunca ficam coladas a um botão de uso frequente.

---

## 6. Performance

1. **Dados iniciais no HTML.** A página `/` (`src/app/page.tsx`) lê abrigos, alertas e categorias no servidor e entrega a tela pronta. O navegador não faz nenhuma requisição de dados para a primeira visão do mapa.
2. **Sem bloqueio de autenticação no cliente.** O layout do painel (`src/app/admin/layout.tsx`) confere a sessão e busca perfil e abrigos no servidor; cabeçalho e navegação chegam prontos no HTML.
3. **Pinos estáveis.** O mapa mantém um marcador por abrigo e atualiza só o que mudou; estilos por classe CSS, não por HTML com `style` embutido.
4. **Atualização barata.** Um único endpoint (`/api/public/mapa`) com `ETag`: quando nada mudou, a resposta é um `304` sem corpo e nada é redesenhado nem gravado no navegador.
5. **Movimento só com `transform` e `opacity`.** Arraste de folha por `transform`, sem re-renderizar o conteúdo a cada quadro.
6. **Busca com debounce** de 250 a 300 ms e cancelamento da requisição anterior (`AbortController`).
7. **Atualização otimista** nos botões de quantidade: o número muda no toque e volta atrás só se a API recusar.

---

## 7. Migração da v1 para a v2

A migração visual foi feita por fase e está completa: nenhuma tela usa mais as classes da v1.

| Fase | Escopo | Estado |
| :--- | :--- | :--- |
| 0 | Tokens, componentes base, este documento | Concluída |
| 1 | Mapa público | Concluída |
| 2 | Login e casca do painel | Concluída |
| 3 | Telas do painel (estoque, visão geral, acolhidos, infraestrutura, gestão) | Concluída |
| 4 | Carregamento (seção 6, itens 1, 2 e 4) e infraestrutura de deploy | Concluída |

**Trava de lint:** `eslint.config.mjs` proíbe paleta crua do Tailwind e hex fixo em classes em todo o `src/**`. O lint falha se alguém voltar a usar `bg-slate-900` ou `text-amber-300`.

---

## 8. Tema claro (planejado, ainda não implementado)

**Por quê:** o tema escuro economiza bateria em telas OLED, mas sob sol forte (doação na rua, abrigo ao ar livre) um tema claro é mais legível. Por isso a proposta é oferecer os dois, com o sistema operacional decidindo por padrão.

### 8.1. Onde a pessoa troca o tema

Trocar o tema é uma ação ocasional (princípio 6): fica em um menu, nunca solta na tela.

| Tela | Local | Por quê |
| :--- | :--- | :--- |
| Mapa público (`/`) | Menu de hambúrguer do cabeçalho, último bloco, abaixo de "Acesso da equipe": linha **Aparência** com três botões de ícone, `Sistema` (monitor), `Claro` (sol) e `Escuro` (lua). | É onde já ficam as ações ocasionais do mapa; não ocupa espaço sobre o mapa. |
| Painel (`/admin/**`) | Menu da conta (com "Alterar senha", "Ver mapa público" e "Sair"), com o mesmo controle. | Preferência pessoal fica junto da conta. |
| Login (`/login`) | Sem controle. Segue a escolha salva neste aparelho ou o sistema. | Uma tela, uma ação (seção 5.3). |

O controle é um grupo de três opções (`role="radiogroup"`, cada botão com `aria-checked`), com a opção atual azul, como um `Chip` ligado. A escolha vale para o aparelho inteiro, em todas as telas.

### 8.2. Como funciona

1. **Uma definição por token.** Cada `--wtg-*` em `:root` passa a ter os dois valores com `light-dark()`: `--wtg-fundo: light-dark(#f4f6f8, #000000)`. Quem escolhe o valor é o `color-scheme` do `<html>`:
   - `data-tema="sistema"` → `color-scheme: light dark` (segue o sistema operacional);
   - `data-tema="claro"` → `color-scheme: light`;
   - `data-tema="escuro"` ou atributo ausente → `color-scheme: dark` (o padrão de hoje, também sem JavaScript).
   Os componentes não mudam: continuam usando `bg-superficie`, `text-texto-2`... e campos, barras de rolagem e o `<select>` nativo acompanham o `color-scheme`.
2. **Sem piscar na primeira pintura.** A escolha fica no `localStorage` (`wtg:tema`). Um script curto embutido no `<head>` do `src/app/layout.tsx` aplica o `data-tema` antes de a página aparecer (`<html suppressHydrationWarning>`). Cookie não serve aqui: ler `cookies()` no layout raiz tornaria todas as rotas dinâmicas e quebraria a pré-renderização parcial do mapa (`cacheComponents`). A CSP já aceita script embutido (limitação documentada em `next.config.ts`), então nada muda nela.
3. **Hook `useTema()`** em `src/components/ui/tema.tsx`: lê e grava a escolha, atualiza o `data-tema` e a `<meta name="theme-color">` (barra do navegador e do app instalado), e ouve `prefers-color-scheme` quando a escolha é "Sistema".
4. **Variante do Tailwind para o que não é cor** (imagens, filtros): `@custom-variant claro` em `globals.css`, que vale com `data-tema="claro"` ou com `data-tema="sistema"` dentro de `@media (prefers-color-scheme: light)`. Uso: `claro:hidden`.

### 8.3. Paleta clara (proposta, contraste conferido)

| Token | Escuro (hoje) | Claro | Contraste no claro |
| :--- | :--- | :--- | :--- |
| `fundo` | `#000000` | `#F4F6F8` | — |
| `superficie` | `#0B0D12` | `#FFFFFF` | — |
| `superficie-2` | `#14171D` | `#EEF1F5` | — |
| `superficie-3` | `#1E222A` | `#E3E7ED` | — |
| `borda` / `borda-forte` | `#1F242D` / `#333A46` | `#E1E5EB` / `#C5CCD6` | — |
| `texto` | `#F4F6F8` | `#0B0D12` | 19,4:1 na superfície |
| `texto-2` | `#A9B1BD` | `#475162` | 8,0:1 |
| `texto-3` | `#7C8696` | `#5F6979` | 5,5:1 (4,9:1 em `superficie-2`) |
| `primaria` / `primaria-forte` | `#2563EB` / `#1D4ED8` | iguais | branco por cima: 5,2:1 |
| `primaria-clara` (azul como texto) | `#60A5FA` | `#1D4ED8` | 6,7:1 |
| `ok-claro` / `atencao-claro` / `critico-claro` (texto) | `#4ADE80` / `#FBBF24` / `#F87171` | `#15703A` / `#A34A07` / `#B91C1C` | 5,0 / 5,0 / 6,5:1 (≥ 5,2:1 sobre o fundo tingido a 12%) |
| `ok` / `atencao` / `critico` (sólidos) | `#22C55E` / `#F59E0B` / `#EF4444` | iguais | pinos idênticos nos dois temas |

Os tokens "`-claro`" querem dizer "variante para texto colorido": no tema claro ficam **mais escuros**, para manter 4,5:1 sobre fundo branco.

### 8.4. O que precisa de ajuste além dos tokens

Levantado com uma busca por cores fixas em `src/` e `globals.css`:

| Local | Hoje | No tema claro |
| :--- | :--- | :--- |
| `globals.css` `.leaflet-tile-pane` | `grayscale(1) invert(1)` (mapa escuro) | só `grayscale(1)`, sem inverter, para continuar neutro e os pinos serem a única cor. |
| `globals.css` créditos do mapa | `rgb(0 0 0 / 0.65)` | token de superfície com transparência. |
| `globals.css` `.wtg-voce` | halo `rgb(96 165 250 / 0.22)` | `color-mix()` com `--wtg-primaria-clara`. |
| `src/components/ui/logo.tsx` | só as versões claras da marca | trocar pelas versões `*-escura.webp` (já existem em `public/logos`) com a variante `claro:`. |
| `src/app/layout.tsx` (`viewport`) | `themeColor: "#0b0d12"`, `colorScheme: "dark"` | `themeColor` com as duas cores por `media` e `colorScheme: "light dark"`; o `useTema()` acerta a meta quando a escolha é manual. |
| `src/app/manifest.ts` | cores do app instalado fixas no escuro | manter: o manifesto não varia por tema; só a abertura do app usa essa cor. |
| `src/components/ui/modal.tsx` | véu `bg-black/70` | funciona nos dois; no claro, `bg-black/50`. |
| `src/components/mapa/cartao-pix.tsx` | QR Code em `bg-white` | manter: QR precisa de fundo branco para ser lido. |
| `src/app/login/page.tsx` | cores oficiais do Google | manter (exceção já prevista na seção 5.3). |

### 8.5. Ordem de execução

| Fase | Escopo | Pronto quando |
| :--- | :--- | :--- |
| A | Tokens com `light-dark()`, `data-tema` + script no `<head>`, `useTema()`, `@custom-variant claro`, `theme-color`. | Trocar o `data-tema` pelo console muda o app inteiro, sem piscar ao recarregar. |
| B | Mapa público: filtro dos tiles, créditos, "você está aqui", logos e o seletor no menu de hambúrguer. | Mapa legível nos dois temas, pinos iguais. |
| C | Login e painel: seletor no menu da conta e revisão tela a tela (estoque, visão geral, acolhidos, infraestrutura, gestão). | Nenhuma tela com texto ou borda sumindo. |
| D | Qualidade: contraste automático (axe/Lighthouse) nos dois temas, captura das telas principais, movimento reduzido, app instalado (barra de status), modo offline. | Sem violação de contraste; esta seção vira "Concluída" e a regra de tema da seção 2.1 é atualizada. |

**Riscos a conferir na fase A:** `light-dark()` exige navegadores de 2024 em diante (Chrome 123, Safari 17.5, Firefox 120). Como os tokens são variáveis CSS, um navegador antigo não "volta" para uma declaração anterior: a cor ficaria vazia. Por isso entra um bloco `@supports not (color: light-dark(#000, #fff))` que redefine os `--wtg-*` com os valores escuros de hoje. As cores com opacidade do Tailwind (`bg-primaria/15`) viram `color-mix()` sobre o token; conferir no navegador que continuam corretas com `light-dark()`.
