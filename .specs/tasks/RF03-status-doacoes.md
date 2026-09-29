# RF03 - Gerenciar Status de Doações (Urgente / Bloqueado)

## Metadados
- **Identificador**: RF03
- **Caso de Uso**: UC02 / Gestão de Necessidades
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF01, RF02

---

## Descrição do Requisito
O sistema deve permitir ao coordenador do abrigo definir quais itens são de necessidade urgente e quais itens estão temporariamente bloqueados por excesso/saturação de estoque.

---

## Regras de Negócio (RN)
1. **Permissão Exclusiva**: Apenas usuários com papel `COORDENADOR` (ou `ADMIN`) podem alterar o status de necessidade dos itens do seu abrigo.
2. **Estados Possíveis (`status_necessidade`)**:
   - `URGENTE`: Falta crítica do item no abrigo. O item deve ser promovido com destaque no mapa público para doadores.
   - `NORMAL`: Estoque em nível adequado ou estável.
   - `BLOQUEADO`: Abrigo saturado deste item. Nenhum doador deve ser incentivado a enviar este item para este abrigo específico.
3. **Reflexo Imediato**: A alteração deve ser refletida nas consultas públicas da API de mapa em tempo real.

---

## Critérios de Aceite
- O coordenador visualiza na tabela de estoque de seu abrigo um seletor visual de status para cada item.
- Ao marcar como `BLOQUEADO`, a aplicação pública deixa imediatamente de recomendar o abrigo no filtro correspondente.
- A ação gera registro na tabela de auditoria (`LOG_AUDITORIA`).
