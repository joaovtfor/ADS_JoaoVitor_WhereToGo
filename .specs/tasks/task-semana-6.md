# Task: Semana 6 — Aplicação Pública (Roteamento de Doações, Cards Detalhados e Alertas de Risco)

## Status: ✅ CONCLUÍDA

## Objetivo
Implementar integralmente os requisitos **RF07 (Visualizar Detalhes do Abrigo - Cards)**, **RF08 (Roteamento de Doações - Filtro por Necessidade)** e **RF09 (Visualizar Alertas de Risco e Áreas Demarcadas)** na Aplicação Web Pública (`src/app/page.tsx` e `src/components/mapa-publico-leaflet.tsx`), integrados às consultas geoespaciais do PostGIS (`ST_Distance` e `ST_DWithin`).

## Entregas Realizadas
1. **Roteamento Inteligente de Doações (`RF08`)**:
   - Barra de filtros rápidos com ícones minimalistas mapeados pelo `CATEGORIA_ITEM.slug` (`💧 Água`, `🍲 Alimentos`, `🧼 Higiene e Limpeza`, `💊 Medicamentos e Saúde`, `🧥 Roupas e Calçados`, `🛏️ Cama e Banho`, `🍼 Itens Infantis`, `🐾 Itens para Animais`).
   - Sub-barra dinâmica de roteamento que permite filtrar por **Item Micro específico** (`?item=id`), alternar entre **ocultar abrigos sem demanda** ou **atenuar a opacidade dos demais marcadores no mapa (36%)** e limitar por **Raio máximo em km via PostGIS (`ST_DWithin`: 5 km, 10 km, 25 km)** quando o GPS está conectado.
   - Destaque visual no mapa com anel ciano e selo `⭐ PRECISA` exclusivamente para abrigos com itens classificados como `URGENTE` (nunca destacando itens `BLOQUEADO`).
2. **Cards Detalhados de Abrigo Estilo Mobile Sheet (`RF07`)**:
   - Aba lateral (`aside`) responsiva com ocupação em tempo real (`tabular-nums`), links universais de navegação para **Google Maps** e **Waze**, telefone clicável (`tel:`), compartilhamento nativo / **WhatsApp** e link direto (`/?abrigo=ID`).
   - Seção de doação financeira oficial via **PIX** com cópia da chave em 1 clique, geração nativa do payload **BR Code (BACEN EMVCo com CRC16-CCITT `0x1021`)** e **QR Code**.
   - Destaque visual dos itens urgentes que batem com a doação selecionada pelo cidadão (`⭐`) e lista de itens saturados (`BLOQUEADO`).
3. **Camada Visual e Painel de Alertas de Vias e Áreas de Risco (`RF09`)**:
   - Plotagem no mapa de alertas pontuais (`🚧`, `🌊`, `⛰️`, `🏚️`, `⚡`) e **Áreas de Risco Poligonais (`🔺 Área de Risco`)** delimitadas por marcadores.
   - Painel lateral `🚧 Alertas de Vias e Áreas de Risco` permitindo localizar qualquer interdição diretamente no mapa (`🎯 Ver no Mapa`) e aviso imediato de advertência de deslocamento no card do abrigo afetado.
