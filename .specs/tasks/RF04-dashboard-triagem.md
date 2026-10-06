# RF04 - Visualizar Dashboard de Triagem

## Metadados
- **Identificador**: RF04
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF01, RF02
- **Status**: ✅ API concluída (Semana 2) · ⏳ Tela (Semana 3)

---

## Descrição do Requisito
O sistema deve exibir um painel visual consolidado para o Coordenador com indicadores de lotação do abrigo (vagas disponíveis vs ocupação) e alertas em destaque de estoque crítico.

---

## Regras de Negócio (RN)
1. O dashboard calcula a taxa de lotação percentual: `(lotacao_atual / capacidade_maxima) * 100`. A `lotacao_atual` é derivada dos abrigados com status `PRESENTE` (RF12).
2. Alertas visuais de saturação:
   - Verde: < 70% ocupado
   - Amarelo: 70% a 90% ocupado
   - Vermelho: > 90% ocupado ou lotado
3. Alertas de estoque crítico: itens com `status_necessidade = 'URGENTE'` ou com quantidade abaixo de `ESTOQUE_ABRIGO.quantidade_minima` são listados no topo (urgentes primeiro, depois os mais distantes do mínimo).
4. Acesso: `COORDENADOR` (próprio abrigo) e `ADMIN`. Voluntários não acessam o dashboard (RNF05).

---

## Critérios de Aceite
- Exibição de cards com estatísticas de acolhidos e capacidade restante.
- Lista resumida dos itens críticos necessitando de atenção ou doação externa.
- Indicador do status atual de infraestrutura do abrigo.

---

## Implementação (backend)
- `GET /api/abrigos/{id}/dashboard` → `ocupacao` (percentual, nível, vagas), `acolhidos` (presentes, entradas/desligamentos/transferências nas últimas 24h), `estoque.itensCriticos` (com motivo `URGENTE` ou `ABAIXO_DO_MINIMO`), `ocorrenciasAtivas`, `ultimasMovimentacoes`.
- Código: `obterDashboard` em `src/modules/abrigos/abrigos.service.ts`; regra de cores em `src/modules/abrigos/ocupacao.ts`.
