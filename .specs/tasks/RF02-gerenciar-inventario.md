# RF02 - Gerenciar Inventário de Suprimentos (Fast-CRUD)

## Metadados
- **Identificador**: RF02
- **Caso de Uso**: UC02 Gerenciar Inventário (Fast-CRUD)
- **História de Usuário**: HU02 – Atualizar estoque via Fast-CRUD
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF01
- **Status**: ✅ Concluído (API na Semana 2 · Interface touch Fast-CRUD na Semana 3)

---

## Descrição do Requisito
O sistema deve permitir a entrada e saída rápida de itens categorizados (água, medicamentos, alimentos, cobertores, higiene) através de botões de incremento/decremento (`+` e `-`), com persistência assíncrona e baixa latência.

O catálogo é organizado em **categoria macro** (`CATEGORIA_ITEM`, ex.: "Água") e **item micro** (`ITEM`, ex.: "Água Potável 5 L", com unidade de medida). O catálogo é mantido pelo ADMIN; itens não são excluídos, apenas desativados.

---

## Regras de Negócio (RN)
1. **Permissão**: Usuários autenticados com papéis de `VOLUNTARIO` ou `COORDENADOR` podem alterar o estoque do seu respectivo abrigo (`id_abrigo`), e o `ADMIN` pode operar, ajustar e transferir o estoque de qualquer abrigo ativo.
2. **Não-Negatividade**: O estoque não pode assumir valores negativos (quantidade < 0). Garantido no banco (`estoque_abrigo_quantidade_ck`); a operação inteira é recusada com `409 ESTOQUE_INSUFICIENTE`.
3. **Histórico transacional**: toda alteração de saldo é um registro em `MOVIMENTACAO_ESTOQUE` (tipo, quantidade com sinal, saldo resultante, usuário, data/hora). O saldo de `ESTOQUE_ABRIGO` é atualizado por trigger na mesma transação: **saldo = soma das movimentações**.
4. **Tipos de movimentação**: `ENTRADA_DOACAO` (+), `SAIDA_CONSUMO` (-), `PERDA` (-), `AJUSTE` (±, contagem física, somente COORDENADOR do próprio abrigo ou ADMIN, com justificativa), `TRANSFERENCIA_SAIDA`/`TRANSFERENCIA_ENTRADA` (entre abrigos, somente COORDENADOR da origem ou ADMIN, operação atômica).
5. **Auditoria Obrigatória (RNF03)**: Cada incremento ou decremento gera um log automático de auditoria em background contendo:
   - `id_usuario`
   - `id_abrigo`
   - `data_hora`
   - `endereco_ip`
   - `acao` = `ESTOQUE_MOVIMENTADO` e `descricao` (ex: `"+1 Água Potável 5 L (ENTRADA_DOACAO)"`), com detalhes em JSON.
6. Itens desativados no catálogo não recebem entradas (saídas continuam permitidas para zerar o saldo).

---

## Critérios de Aceite
- A interface deve exibir botões de `+` e `-` grandes e responsivos (touch-first) para cada categoria.
- Ao clicar em `+`, a quantidade do item deve aumentar e ser salva instantaneamente no banco sem recarregar a tela (assíncrono).
- Se a quantidade chegar a 0, o botão `-` deve ser desabilitado visualmente e bloquear novos cliques.

---

## Implementação
- `GET /api/abrigos/{id}/estoque?incluirCatalogo=true` – lista para a tela Fast-CRUD (inclui itens com saldo 0)
- `POST /api/abrigos/{id}/estoque/{itemId}/movimentacoes` – `{ "quantidade": 1 }` / `{ "quantidade": -1 }`
- `GET /api/abrigos/{id}/movimentacoes` – histórico paginado
- `POST /api/abrigos/{id}/transferencias-estoque` – transferência de itens entre abrigos
- `GET|POST /api/categorias`, `GET|POST /api/itens`, `PATCH` de ambos – catálogo (ADMIN)
- Código Backend: `src/modules/estoque/estoque.service.ts`, `src/modules/catalogo/catalogo.service.ts`
- Código Frontend: `src/app/admin/inventario/page.tsx`, `src/app/admin/geral/page.tsx`
