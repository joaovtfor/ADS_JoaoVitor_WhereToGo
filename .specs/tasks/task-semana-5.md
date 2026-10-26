# Task: Semana 5 — Aplicação Web Pública (Mapa Base Interativo Leaflet.js)

## Status: ✅ CONCLUÍDA

## Objetivo
Implementar a **Aplicação Web Pública (`/` — `src/app/page.tsx`)** com o mapa interativo **Leaflet.js + OpenStreetMap** (`src/components/mapa-publico-leaflet.tsx`) consumindo os dados geoespaciais reais do banco PostgreSQL/PostGIS (`GET /api/public/abrigos`, `GET /api/public/abrigos/[id]`, `GET /api/public/alertas` e `GET /api/public/categorias`), atendendo integralmente ao **RF06**, **RNF01**, **RNF02** e à seção **4.5 do `DESIGN.md`**.

## Entregas Realizadas
1. **Componente de Mapa Interativo (`src/components/mapa-publico-leaflet.tsx`)**:
   - Integração direta com `leaflet` (`L.map`, `L.tileLayer` OpenStreetMap, `L.geoJSON`) carregada dinamicamente no cliente (`ssr: false`).
   - Marcadores acessíveis (`L.divIcon`) com semáforo de cores + símbolos (`●` Livre < 70%, `▲` Atenção 70–90%, `■` Crítico/Lotado > 90%) e indicador de alerta de infraestrutura (`!` / `⚡`).
   - Plotagem de alertas georreferenciados de infraestrutura e vias (`🚧`), marcador de geolocalização GPS do cidadão (`📍 Você está aqui`), enquadramento automático inicial (`fitBounds`) e transição suave (`flyTo`) ao selecionar um abrigo.
2. **Página Pública Map-First (`src/app/page.tsx`)**:
   - Acesso público irrestrito sem exigência de login (`RNF02`).
   - Busca textual instantânea + pílulas de filtro rápido (`Todos`, `🟢 Com Vagas Livres`, `🚨 Precisa de Doações`, `🛣️ Acesso Normal`, `⭐ Prioritários`, filtro por categorias de doação e toggle de alertas no mapa).
   - Geolocalização sob demanda (`📍 Abrigos Perto de Mim`) integrada ao cálculo de distância PostGIS (`ST_Distance` / `ST_DWithin`).
   - Card detalhado do abrigo selecionado com ocupação em tempo real (`tabular-nums`), itens urgentes (`EM_FALTA`) e bloqueados (`BLOQUEADO`), chave PIX oficial com cópia em 1 clique e botões diretos de rota (**Google Maps** e **Waze**).
