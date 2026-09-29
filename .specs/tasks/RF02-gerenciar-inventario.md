# RF02 - Gerenciar Inventário de Suprimentos (Fast-CRUD)

## Metadados
- **Identificador**: RF02
- **Caso de Uso**: UC02 Gerenciar Inventário (Fast-CRUD)
- **História de Usuário**: HU02 – Atualizar estoque via Fast-CRUD
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF01

---

## Descrição do Requisito
O sistema deve permitir a entrada e saída rápida de itens categorizados (água, medicamentos, alimentos, cobertores, higiene) através de botões de incremento/decremento (`+` e `-`), com persistência assíncrona e baixa latência.

---

## Regras de Negócio (RN)
1. **Permissão**: Apenas usuários autenticados com papéis de `VOLUNTARIO` ou `COORDENADOR` podem alterar o estoque do seu respectivo abrigo (`id_abrigo`).
2. **Não-Negatividade**: O estoque não pode assumir valores negativos (quantidade < 0).
3. **Auditoria Obrigatória (RNF03)**: Cada incremento ou decremento deve gerar um log automático de auditoria em background contendo:
   - `id_usuario`
   - `id_abrigo`
   - `timestamp`
   - `endereco_ip`
   - `acao` (ex: `"+1 Água Potável"`, `"-1 Kit Primeiros Socorros"`)

---

## Critérios de Aceite
- A interface deve exibir botões de `+` e `-` grandes e responsivos (touch-first) para cada categoria.
- Ao clicar em `+`, a quantidade do item deve aumentar e ser salva instantaneamente no banco sem recarregar a tela (assíncrono).
- Se a quantidade chegar a 0, o botão `-` deve ser desabilitado visualmente e bloquear novos cliques.
