# RF09 - Visualizar Alertas de Risco

## Metadados
- **Identificador**: RF09
- **Importância**: Desejável
- **Priorização**: 3
- **Dependências**: RF06, RF05
- **Status**: ✅ Implementado (Backend Semana 2 · Camada de Alertas e Polígonos de Risco na Semana 6)

---

## Descrição do Requisito
O sistema deve refletir no mapa público as obstruções, enxurradas, pontos de alagamento ou vias colapsadas reportadas pelos coordenadores de abrigos ou pela defesa civil.

---

## Regras de Negócio (RN)
1. **Visualização Pública**: Cidadãos e doadores veem alertas visuais (ícones de perigo/atenção) no ponto exato da ocorrência — quando o coordenador informa coordenadas — ou na localização do abrigo afetado.
2. **Atualização Dinâmica**: Quando o Coordenador registra ou resolve uma ocorrência (RF05), o alerta aparece/desaparece do mapa público.
3. Alertas da defesa civil sem abrigo associado não fazem parte do MVP (não há perfil de defesa civil); o ADMIN pode registrá-los vinculados ao abrigo mais próximo.

---

## Critérios de Aceite
- Ícones de alerta no mapa indicando vias bloqueadas ou abrigos operando em contingência (ex: sem energia).
- Aviso de advertência no card do abrigo alertando doadores sobre condições de acesso.

---

## Implementação (backend)
- `GET /api/public/alertas[?formato=geojson]` – ocorrências ativas com `latitude`/`longitude`, `localizacaoPropria`, `gravidade` e abrigo relacionado.

## Evolução: avisos oficiais do INMET (pós-MVP, Etapa 1 do plano de integração)
- Avisos meteorológicos do INMET que incluem o município aparecem no topo do mapa (selo) e no painel "Alertas e avisos", e também na visão geral do painel.
- Ficam em `aviso_oficial` (migration `0011`), separados das ocorrências: não acionam `emAreaDeRisco`, `rotaCruzaAreaRisco` nem o status do abrigo.
- `GET /api/public/avisos` e o campo `avisos` de `GET /api/public/mapa`. Desenho, decisões e limites: `.specs/plano-integracao-defesa-civil.md` (§4.1).
- A RN3 (alerta da defesa civil sem abrigo) foi resolvida na Etapa 2, descrita abaixo.

## Evolução: ocorrências regionais e papel DEFESA_CIVIL (Etapa 2 do plano de integração)
- A RN3 deixa de valer: ADMIN e o novo perfil DEFESA_CIVIL registram ocorrências do município sem abrigo (`POST /api/ocorrencias`), na aba "Município" da tela de Infraestrutura.
- Tipos do território (via interditada, área de risco, alagamento, deslizamento, outra), sempre com local. No mapa aparecem como "Alerta regional (Defesa Civil)".
- Uma área de risco regional marca os abrigos dentro dela (`emAreaDeRisco`), sem mudar o status de infraestrutura deles.
- Detalhes: `.specs/plano-integracao-defesa-civil.md` (§4.2) e migration `0012`.
