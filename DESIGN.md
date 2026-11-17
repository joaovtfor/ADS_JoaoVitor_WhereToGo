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
- **Tema:** claro e escuro. Por padrão segue o aparelho ("Sistema"); a pessoa pode fixar um deles em "Aparência" (seção 8). Cada token traz os dois valores em `light-dark(claro, escuro)`: a tabela acima mostra os do escuro, e os do claro estão na seção 8.3. Toda cor nova entra como token com os dois valores e passa pelo `scripts/contraste-wcag.js` nos dois temas.

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

| `Menu` / `ItemMenu` | `menu.tsx` | Menu suspenso para ações de uso ocasional. Fecha ao escolher, ao clicar fora e com Esc. `ItemMenu` aceita `className` só para separar grupos (`border-t border-borda`). |
| `SeletorTema` | `seletor-tema.tsx` | Bloco "Aparência" (Sistema / Claro / Escuro) para o fim de um `Menu`. Escolher não fecha o menu (seção 8). |
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

- **Cabeçalho (uma linha):** marca, busca e duas ações: `Filtros` e `Lista`. Acesso da equipe, busca de familiar, atualização manual e a escolha de **Aparência** (seção 8.1) ficam no menu (ícone de hambúrguer, à direita). Os "três pontos" ficam só para o menu de ações de uma linha de lista no painel.
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
- **Movimento reduzido** (preferência do aparelho): o mapa vai direto ao abrigo ou ao alerta, sem voo nem zoom animado (`movimentoReduzido()` em `mapa-publico-leaflet.tsx`). Folhas e toasts já respeitavam a preferência.
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

## 8. Tema claro (concluído)

**Por quê:** o tema escuro economiza bateria em telas OLED, mas sob sol forte (doação na rua, abrigo ao ar livre) um tema claro é mais legível. Por isso a proposta é oferecer os dois, com o sistema operacional decidindo por padrão.

**Padrão:** "Sistema" (`TEMA_PADRAO` em `src/lib/tema.ts`): quem nunca escolheu vê o tema do aparelho. Durante a implantação (fases A a C) o padrão ficou no escuro, para ninguém ver o tema claro antes de o mapa e as logos estarem adaptados; passou a "Sistema" na fase D.

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
   - `data-tema="escuro"` ou atributo ausente → `color-scheme: dark` (o servidor sempre escreve o atributo; a ausência é só uma rede de segurança).
   Os componentes não mudam: continuam usando `bg-superficie`, `text-texto-2`... e campos, barras de rolagem e o `<select>` nativo acompanham o `color-scheme`.
2. **Sem piscar na primeira pintura.** A escolha fica no `localStorage` (`wtg:tema`). O servidor escreve `<html data-tema="sistema">` (o padrão, que também vale sem JavaScript) e um script curto no `<head>` do `src/app/layout.tsx` (`SCRIPT_TEMA`, em `src/lib/tema.ts`) troca pela escolha salva antes de a página aparecer (`<html suppressHydrationWarning>`). Cookie não serve aqui: ler `cookies()` no layout raiz tornaria todas as rotas dinâmicas e quebraria a pré-renderização parcial do mapa (`cacheComponents`). A CSP já aceita script embutido (limitação documentada em `next.config.ts`), então nada muda nela.
3. **`src/components/ui/tema.tsx`** (cliente):
   - `useTema()` devolve `tema` (a escolha), `temaEfetivo` (`claro`/`escuro`, já resolvendo "Sistema") e `definirTema()`. Usa `useSyncExternalStore`: todos os componentes que o usam acompanham a troca, sem provedor.
   - `definirTema(tema)` grava no `localStorage`, aplica o `data-tema` e acerta a `<meta name="theme-color">` (barra do navegador e do app instalado).
   - `SincronizadorTema`, montado uma vez no layout raiz: reaplica o tema antes da pintura (no desenvolvimento, o Strict Mode do React remonta o `<html>` e apaga o atributo do script), acompanha a troca de claro/escuro do aparelho quando a escolha é "Sistema" e sincroniza as outras abas abertas (evento `storage`).
4. **Variante do Tailwind para o que não é cor** (imagens, filtros): `@custom-variant claro` em `globals.css`, que vale com `data-tema="claro"` ou com `data-tema="sistema"` dentro de `@media (prefers-color-scheme: light)`. Uso: `claro:hidden`.

5. **Seletor** (`src/components/ui/seletor-tema.tsx`, `SeletorTema`): bloco "Aparência" para o fim de um `Menu`. As opções são `menuitemradio` com `aria-checked`, dentro de um `role="group"`; escolher não fecha o menu. A troca desliga as transições por um instante (`semTransicoes` em `tema.tsx`): sem isso, botões com `transition-colors` mudariam 150 ms depois do resto e a tela passaria por um quadro meio claro, meio escuro.
6. **Imagens por tema** (`wtg-so-escuro` / `wtg-so-claro` em `globals.css`): as duas versões vão no HTML e o CSS esconde a do outro tema, já na primeira pintura. As regras só escondem (`!important`); quando a versão aparece, vale o display das classes do componente. Com `loading="lazy"`, a versão escondida não é baixada. Usado em `Logo`.
7. **Navegadores antigos:** o Tailwind (Lightning CSS) já converte cada `light-dark()` em um par de variáveis (`--lightningcss-light` / `--lightningcss-dark`) que as regras de `color-scheme` ligam e desligam. O tema funciona sem suporte nativo a `light-dark()`, então não há fallback separado.

**Para testar pelo console** (ou no login, que não tem seletor): `localStorage.setItem("wtg:tema", "claro")` (ou `"sistema"`, `"escuro"`) e recarregar; `localStorage.removeItem("wtg:tema")` volta ao padrão.

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
| `src/components/ui/logo.tsx` | só as versões claras da marca | as duas versões, com `wtg-so-escuro` / `wtg-so-claro` (seção 8.2, item 6). |
| Legenda do mapa (`barra-resumo.tsx`) | "Ponto branco no pino" | o ponto de aviso usa `--wtg-texto` e fica escuro no tema claro: "Ponto no canto do pino". |
| `src/app/layout.tsx` (`viewport`) | `themeColor: "#0b0d12"`, `colorScheme: "dark"` | `themeColor` com uma cor por `media` (claro `#FFFFFF`, escuro `#0B0D12`) e `colorScheme: "light dark"`. Com escolha manual, o `SincronizadorTema` põe a cor do tema escolhido nas duas metas; em "Sistema", devolve cada uma à sua. |
| `src/app/layout.tsx` (`appleWebApp`) | `statusBarStyle: "black-translucent"` | `"default"`: no iPhone, o texto da barra de status era sempre branco (sumia sobre o cabeçalho claro) e o cabeçalho ficava por baixo do relógio. Com `default`, a barra é opaca e o conteúdo começa abaixo dela. **Conferir em um iPhone real** (app adicionado à tela de início): não há como emular aqui. |
| `src/app/manifest.ts` | cores do app instalado fixas no escuro | manter: o manifesto não varia por tema; só a tela de abertura do app instalado usa essa cor. |
| `public/sw.js` | logos fora do cache offline | as logos do mapa, nos dois temas, entram no cache na instalação do service worker (`/logos/*` com cache primeiro). Sem isso, trocar de tema sem rede deixava a logo quebrada (a página só baixa a do tema atual). |
| `src/components/ui/modal.tsx` | véu preto a 70% | mantido no escuro; no claro, 45% (`claro:` no véu), porque 70% sobre fundo branco escurece demais. |
| `src/components/mapa/cartao-pix.tsx` | QR Code em `bg-white` | manter: QR precisa de fundo branco para ser lido. |
| `src/app/login/page.tsx` | cores oficiais do Google | manter (exceção já prevista na seção 5.3). |

### 8.5. Ordem de execução

| Fase | Escopo | Pronto quando | Estado |
| :--- | :--- | :--- | :--- |
| A | Tokens com `light-dark()`, `data-tema` + script no `<head>`, `useTema()`, `@custom-variant claro`, `theme-color`. | Trocar o `data-tema` pelo console muda o app inteiro, sem piscar ao recarregar. | Concluída |
| B | Mapa público: filtro dos tiles, créditos, "você está aqui", logos e o seletor no menu de hambúrguer. | Mapa legível nos dois temas, pinos iguais. | Concluída |
| C | Login e painel: seletor no menu da conta e revisão tela a tela (estoque, visão geral, acolhidos, infraestrutura, gestão). | Nenhuma tela com texto ou borda sumindo. | Concluída |
| D | Qualidade: contraste automático nos dois temas, captura das telas principais, movimento reduzido, app instalado (barra de status), modo offline. Padrão passa a "Sistema". | Sem violação de contraste; esta seção vira "Concluída" e a regra de tema da seção 2.1 é atualizada. | Concluída |

**Riscos conferidos:**

- `light-dark()` nativo exige navegadores de 2024 em diante (Chrome 123, Safari 17.5, Firefox 120). Na fase B ficou claro que o CSS servido nem usa a função nativa: o Lightning CSS a converte em variáveis que funcionam em qualquer navegador (seção 8.2, item 7). O fallback `@supports not` criado na fase A deixava navegadores antigos sempre no escuro e foi removido.
- As cores com opacidade do Tailwind (`bg-critico/12`) viram `color-mix(in oklab, var(--wtg-critico) 12%, transparent)`. Os sólidos do semáforo e o azul são iguais nos dois temas, então os fundos tingidos não mudam; os textos sobre eles usam os tokens `-claro`, que mudam. Conferido no navegador na ficha do abrigo e na visão geral do painel.
- Mapa no claro (fase B): os tiles ficam em cinza sem inverter (`grayscale(1) brightness(1.04) contrast(0.92)`), pinos e áreas de risco iguais aos do escuro. Conferido em "Claro" e em "Sistema" com o aparelho claro e escuro, no desktop e no celular.
- Revisão das telas (fase C): uma busca por cores fixas em `src/` só achou o véu do modal (ajustado), o `text-white` do botão primário e o fundo branco do QR Code PIX (os dois ficam de propósito). Depois, um script no navegador mediu o contraste WCAG de cada texto visível, compondo os fundos translúcidos: visão geral, estoque, infraestrutura, acolhidos, as quatro abas de gestão, login, e no mapa a ficha, a lista, os filtros, o menu, os alertas e a legenda. Resultado: nenhum texto abaixo de 4,5:1 (3:1 para texto grande) no tema claro, e o mesmo no escuro. Conferido também o painel no celular (barra de navegação inferior e menu da conta).
- Qualidade (fase D), no build de produção:
  - **Contraste:** o script virou `scripts/contraste-wcag.js` (colar no console da tela aberta). No lugar de axe/Lighthouse, que não estão no projeto, ele mede só contraste, mas texto a texto e compondo os fundos tingidos. Com o padrão "Sistema", as telas do painel no aparelho escuro (1.304 textos) também deram zero abaixo do mínimo; somado à fase C, todas as telas estão cobertas nos dois temas. Em produção a CSP bloqueia `eval`: cole o arquivo direto no console.
  - **Padrão "Sistema":** sem escolha salva, o app abre claro no aparelho claro e escuro no escuro; escolher "Escuro" e voltar a "Sistema" devolve as duas metas `theme-color` às cores de cada modo.
  - **Offline:** com o servidor parado, a página veio do service worker e a troca de tema mostrou a logo do outro tema a partir do cache.
  - **Movimento reduzido:** com a preferência simulada, o mapa salta direto para o abrigo (sem posições intermediárias); sem ela, continua voando até lá.
  - **Capturas** do mapa (desktop e celular) e da visão geral do painel, nos dois modos do aparelho, revisadas uma a uma.
  - **Pendente fora do alcance deste ambiente:** confirmar a barra de status em um iPhone com o app instalado (seção 8.4).
