# RF04 - Visualizar Dashboard de Triagem

## Metadados
- **Identificador**: RF04
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF01, RF02

---

## Descrição do Requisito
O sistema deve exibir um painel visual consolidado para o Coordenador com indicadores de lotação do abrigo (vagas disponíveis vs ocupação) e alertas em destaque de estoque crítico.

---

## Regras de Negócio (RN)
1. O dashboard calcula a taxa de lotação percentual: `(lotacao_atual / capacidade_maxima) * 100`.
2. Alertas visuais de saturação:
   - Verde: < 70% ocupado
   - Amarelo: 70% a 90% ocupado
   - Vermelho: > 90% ocupado ou lotado
3. Alertas de estoque crítico: itens com quantidade abaixo do limite mínimo ou com `status_necessidade = 'URGENTE'` são listados no topo.

---

## Critérios de Aceite
- Exibição de cards com estatísticas de acolhidos e capacidade restante.
- Lista resumida dos itens críticos necessitando de atenção ou doação externa.
- Indicador do status atual de infraestrutura do abrigo.
