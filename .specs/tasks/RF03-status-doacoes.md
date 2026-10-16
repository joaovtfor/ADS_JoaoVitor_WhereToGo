# RF03 - Gerenciar Status de Doações (Urgente / Bloqueado)

## Metadados
- **Identificador**: RF03
- **Caso de Uso**: UC02 / Gestão de Necessidades
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF01, RF02
- **Status**: ✅ Concluído (API na Semana 2 · Painel na Semana 3)

---

## Descrição do Requisito
O sistema deve permitir ao coordenador do abrigo definir quais itens são de necessidade urgente e quais itens estão temporariamente bloqueados por excesso/saturação de estoque.

---

## Regras de Negócio (RN)
1. **Permissão Exclusiva**: Apenas usuários com papel `COORDENADOR` (do próprio abrigo) ou `ADMIN` podem alterar o status de necessidade dos itens.
2. **Estados Possíveis** (tabela de domínio `STATUS_NECESSIDADE`, campo `codigo`):
   - `URGENTE` (prioridade 1): Falta crítica do item no abrigo. O item deve ser promovido com destaque no mapa público para doadores.
   - `NORMAL` (prioridade 2): Estoque em nível adequado ou estável (padrão).
   - `BLOQUEADO` (prioridade 3): Abrigo saturado deste item. Nenhum doador deve ser incentivado a enviar este item para este abrigo específico.
3. **Item sem saldo**: um item pode ser marcado como `URGENTE` mesmo que o abrigo ainda não tenha registro dele (quantidade 0) — é justamente o caso mais comum de falta.
4. **Estoque mínimo e promoção automática**: junto com o status, o coordenador define `quantidade_minima` (usada pelo alerta de estoque crítico do RF04). Quando uma movimentação reduz `quantidade` para abaixo de `quantidade_minima` e o status era `NORMAL`, a trigger `fn_aplicar_movimentacao_estoque` promove automaticamente o status para `URGENTE` (sem alterar itens `BLOQUEADO`), destacando o abrigo no roteamento público de doações (RF08).
5. **Reflexo Imediato**: A alteração é refletida nas consultas públicas da API de mapa (cache de CDN de no máximo 10 s).

---

## Critérios de Aceite
- O coordenador visualiza na tabela de estoque de seu abrigo um seletor visual de status para cada item.
- Ao marcar como `BLOQUEADO`, a aplicação pública deixa imediatamente de recomendar o abrigo no filtro correspondente.
- A ação gera registro na tabela de auditoria (`LOG_AUDITORIA`, ação `ESTOQUE_CLASSIFICADO`, com valores antes/depois).

---

## Implementação
- `PATCH /api/abrigos/{id}/estoque/{itemId}` – `{ "statusNecessidade": "URGENTE", "quantidadeMinima": 20 }`
- Código Backend: `classificarItem` em `src/modules/estoque/estoque.service.ts` e trigger `fn_aplicar_movimentacao_estoque`
- Código Frontend: `src/app/admin/inventario/page.tsx`, `src/app/admin/dashboard/page.tsx`
