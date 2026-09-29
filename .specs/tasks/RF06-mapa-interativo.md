# RF06 - Visualizar Mapa Interativo de Abrigos

## Metadados
- **Identificador**: RF06
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: Nenhuma

---

## Descrição do Requisito
O sistema deve exibir um mapa público interativo (usando Leaflet.js e OpenStreetMap) com a localização geográfica (pinos/marcadores) de todos os abrigos ativos, sem necessidade de autenticação.

---

## Regras de Negócio (RN)
1. **Acesso Público Irrestrito (RNF02)**: O mapa deve ser acessível por qualquer cidadão ou doador sem solicitar login ou dados pessoais.
2. **Performance em Redes Degradadas (RNF01)**: Carregamento otimizado de tiles e dados compactados para funcionamento em 3G/Edge.
3. **Cores dos Marcadores**: Os marcadores no mapa devem indicar visualmente o nível de lotação do abrigo (ex: verde = vagas livres; amarelo = quase cheio; vermelho = lotado/sem vagas).

---

## Critérios de Aceite
- Renderização do mapa centralizado na região afetada (com suporte a geolocalização do usuário se autorizada).
- Plotagem dos marcadores com coordenadas reais do banco de dados (latitude/longitude ou geometria PostGIS).
- Clique no marcador abre o card detalhado do abrigo (RF07).
