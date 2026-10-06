# RF09 - Visualizar Alertas de Risco

## Metadados
- **Identificador**: RF09
- **Importância**: Desejável
- **Priorização**: 3
- **Dependências**: RF06, RF05
- **Status**: ✅ API pública pronta (Semana 2) · ⏳ Camada de alertas no mapa (Semana 6)

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
