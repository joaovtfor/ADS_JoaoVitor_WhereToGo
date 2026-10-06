# RF13 - Consultar Auditoria e Histórico

## Metadados
- **Identificador**: RF13 *(novo — derivado do RNF03 e do stakeholder Administrador Geral: "audita os logs de segurança e movimentações")*
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF01, RF02
- **Status**: ✅ API concluída (Semana 2) · ⏳ Tela (Semana 3)

---

## Descrição do Requisito
O sistema deve permitir consultar os logs de auditoria imutáveis e o histórico de movimentações de estoque, com filtros.

---

## Regras de Negócio (RN)
1. **Escopo**: ADMIN consulta todos os eventos; COORDENADOR apenas os do próprio abrigo; VOLUNTARIO não acessa.
2. **Filtros**: usuário, abrigo (ADMIN), código da ação (ex.: `ESTOQUE_MOVIMENTADO`, `LOGIN_FALHA`), período (`de`/`ate`), com paginação.
3. **Imutabilidade**: os registros são somente leitura; o banco recusa UPDATE/DELETE/TRUNCATE em `LOG_AUDITORIA`, `MOVIMENTACAO_ESTOQUE` e `TRANSFERENCIA_ABRIGADO`.
4. **Conteúdo** de cada log: data/hora, usuário, abrigo, ação, descrição legível, detalhes estruturados (JSON) e IP de origem.

---

## Critérios de Aceite
- O ADMIN encontra, para uma movimentação "+1 Água Potável 5 L", quem a fez, quando e de qual IP.
- Tentativas de login malsucedidas aparecem para o ADMIN com o e-mail tentado e o IP.

---

## Implementação (backend)
- `GET /api/auditoria` (logs) e `GET /api/abrigos/{id}/movimentacoes` (histórico de estoque)
- Código: `src/modules/auditoria/auditoria.service.ts`, `src/lib/auditoria.ts`
