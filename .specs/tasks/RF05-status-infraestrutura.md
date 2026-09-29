# RF05 - Reportar Status de Infraestrutura

## Metadados
- **Identificador**: RF05
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF01

---

## Descrição do Requisito
O sistema deve permitir o registro e atualização rápida de incidentes operacionais do abrigo, tais como: vias de acesso colapsadas, deslizamentos próximos, falta de energia elétrica, abastecimento de água interrompido ou operação regular.

---

## Regras de Negócio (RN)
1. **Permissão**: Coordenadores de abrigo e Administradores Gerais.
2. **Atualização de Estado**: Atualiza o campo `status_infraestrutura` na tabela `ABRIGO`.
3. **Propagação**: As informações devem ser disponibilizadas no feed/mapa público para que cidadãos e equipes de resgate evitem rotas intransitáveis.

---

## Critérios de Aceite
- Interface simples no Painel do Coordenador com toggle/dropdown dos status de infraestrutura (ex: "Operando Normalmente", "Sem Energia", "Acesso Bloqueado / Via Colapsada").
- Registro de log da modificação com timestamp e usuário responsável.
