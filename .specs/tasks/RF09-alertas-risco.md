# RF09 - Visualizar Alertas de Risco

## Metadados
- **Identificador**: RF09
- **Importância**: Desejável
- **Priorização**: 3
- **Dependências**: RF06, RF05

---

## Descrição do Requisito
O sistema deve refletir no mapa público as obstruções, enxurradas, pontos de alagamento ou vias colapsadas reportadas pelos coordenadores de abrigos ou pela defesa civil.

---

## Regras de Negócio (RN)
1. **Visualização Pública**: Cidadãos e doadores veem alertas visuais (ícones de perigo/atenção ou traçados) nas imediações dos abrigos afetados.
2. **Atualização Dinâmica**: Quando o Coordenador atualiza o status de infraestrutura (RF05), o status é propagado para o mapa público.

---

## Critérios de Aceite
- Ícones de alerta no mapa indicando vias bloqueadas ou abrigos operando em contingência (ex: sem energia).
- Aviso de advertência no card do abrigo alertando doadores sobre condições de acesso.
