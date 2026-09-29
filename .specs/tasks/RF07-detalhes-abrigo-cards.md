# RF07 - Visualizar Detalhes do Abrigo (Cards)

## Metadados
- **Identificador**: RF07
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF06, RF03

---

## Descrição do Requisito
O sistema deve exibir cards ou modais/bottom-sheets ao clicar em um abrigo no mapa público, apresentando informações essenciais de acolhimento e doação.

---

## Conteúdo do Card do Abrigo
1. **Identificação**: Nome do abrigo e endereço/referência.
2. **Capacidade e Ocupação**: Lotação atual vs. capacidade máxima com indicador visual percentual.
3. **Rotas e Navegação**: Links diretos com deep-linking para **Waze** e **Google Maps** (`https://maps.google.com/?q=lat,lng` e `waze://?ll=lat,lng&navigate=yes`).
4. **Chave PIX Oficial**: Chave PIX oficial do abrigo/entidade com botão de "Copiar Chave".
5. **Status de Suprimentos**: Lista clara dos itens que estão com necessidade **URGENTE** e aviso dos itens que estão **BLOQUEADOS** (saturados).
6. **Alertas de Infraestrutura**: Aviso se houver problemas de energia ou via de acesso.

---

## Critérios de Aceite
- Ao tocar/clicar em um marcador no mapa, o card abre suavemente na parte inferior ou lateral.
- Botão "Copiar PIX" com feedback tátil/visual imediato ("Copiado!").
- Botões de rota abrem os respectivos aplicativos nativos no smartphone.
