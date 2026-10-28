# RF07 - Visualizar Detalhes do Abrigo (Cards)

## Metadados
- **Identificador**: RF07
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF06, RF03
- **Status**: ✅ Implementado (Backend Semana 2 · Card e Aba Mobile na Semana 6)

---

## Descrição do Requisito
O sistema deve exibir cards ou modais/bottom-sheets ao clicar em um abrigo no mapa público, apresentando informações essenciais de acolhimento e doação.

---

## Conteúdo do Card do Abrigo
1. **Identificação**: Nome do abrigo, endereço/referência e telefone (`ABRIGO.endereco`, `ABRIGO.telefone`).
2. **Capacidade e Ocupação**: Lotação atual vs. capacidade máxima com indicador visual percentual.
3. **Rotas e Navegação**: Links diretos para **Google Maps** (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) e **Waze** (`https://waze.com/ul?ll=lat,lng&navigate=yes` — link universal: abre o app se instalado ou o navegador).
4. **Chave PIX Oficial**: Chave PIX e titular (`ABRIGO.chave_pix`, `ABRIGO.titular_pix`) com botão de "Copiar Chave". Somente o ADMIN cadastra/altera a chave (validação oficial, evita desvio de doações).
5. **Status de Suprimentos**: Lista clara dos itens que estão com necessidade **URGENTE** e aviso dos itens que estão **BLOQUEADOS** (saturados).
6. **Alertas de Infraestrutura**: Aviso se houver ocorrências ativas (energia, água, via de acesso etc.).

---

## Critérios de Aceite
- Ao tocar/clicar em um marcador no mapa, o card abre suavemente na parte inferior ou lateral.
- Botão "Copiar PIX" com feedback tátil/visual imediato ("Copiado!").
- Botões de rota abrem os respectivos aplicativos nativos no smartphone.

---

## Implementação (backend)
- `GET /api/public/abrigos/{id}` → `pix`, `rotas.googleMaps`, `rotas.waze`, `ocupacao`, `necessidades.urgentes|bloqueados`, `ocorrenciasAtivas` (com descrição).
