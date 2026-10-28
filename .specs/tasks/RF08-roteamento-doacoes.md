# RF08 - Roteamento de Doações (Filtro por Necessidade)

## Metadados
- **Identificador**: RF08
- **Caso de Uso**: UC03 Roteamento de Doações (Filtro por Necessidade)
- **História de Usuário**: HU08 – Filtrar abrigos por necessidade no mapa
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF06, RF03
- **Status**: ✅ Implementado (Backend Semana 2 · Filtros e Roteamento na Semana 6)

---

## Descrição do Requisito
O sistema deve permitir que o doador selecione quais categorias de itens ele possui para doar (ex: água, cobertores, alimentos, medicamentos) e, com base nisso, destacar no mapa os abrigos mais próximos que necessitam urgentemente desses itens específicos.

---

## Regras de Negócio (RN)
1. **Filtro de Urgência**: O filtro destaca apenas abrigos em que o Coordenador tenha classificado algum item da categoria escolhida (ou o item escolhido) com status `URGENTE`.
2. **Exclusão de Bloqueados**: Itens marcados como `BLOQUEADO` (não aceitam mais doações deste tipo) nunca geram destaque.
3. **Cálculo de Proximidade (PostGIS)**: Com a localização do doador, os abrigos destacados são ordenados por distância (`ST_Distance` sobre `ABRIGO.localizacao`), podendo limitar a um raio (`ST_DWithin`).
4. As categorias usam o identificador estável `CATEGORIA_ITEM.slug` (ex.: `agua`, `cama-e-banho`), que também nomeia os ícones do menu.

---

## Critérios de Aceite
- A aplicação web pública possui menu visual e limpo de filtros rápidos (ícones minimalistas representando água, comida, higiene, cobertores, etc.).
- O filtro é utilizável sem login ou cadastro.
- Ao clicar no ícone "Água", o mapa foca e destaca os marcadores dos abrigos que demandam água urgentemente, diminuindo a opacidade ou ocultando os demais.

---

## Implementação (backend)
- `GET /api/public/categorias` – categorias/itens do menu de filtros.
- `GET /api/public/abrigos?necessidade=agua&lat=..&lng=..[&raioKm=..][&somenteDestaque=true]` – cada abrigo traz `destaque` (true/false) e `distanciaKm`; destacados vêm primeiro.
