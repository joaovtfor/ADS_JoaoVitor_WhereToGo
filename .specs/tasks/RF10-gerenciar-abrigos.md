# RF10 - Gerenciar Abrigos (Cadastro)

## Metadados
- **Identificador**: RF10 *(novo — derivado do cronograma da Semana 2: "rotas da API para cadastro de abrigos")*
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF01
- **Status**: ✅ API concluída (Semana 2) · ⏳ Telas do ADMIN (Semana 3)

---

## Descrição do Requisito
O sistema deve permitir que o Administrador Geral cadastre, edite e desative abrigos, e que o Coordenador mantenha os dados operacionais do próprio abrigo.

---

## Regras de Negócio (RN)
1. **Cadastro**: somente `ADMIN`. Campos obrigatórios: nome, endereço, latitude, longitude e capacidade máxima (> 0). Telefone, chave PIX e titular são opcionais; chave PIX e titular são informados **juntos**.
2. **Edição por papel**:
   - `ADMIN`: qualquer campo, inclusive localização, chave PIX oficial e `ativo`.
   - `COORDENADOR`: apenas telefone e capacidade máxima do próprio abrigo (a chave PIX fica com o ADMIN para evitar desvio de doações).
3. **Capacidade**: não pode ser reduzida abaixo da lotação atual.
4. **Desativação** (`ativo = false`) em vez de exclusão: o abrigo some do mapa público e a equipe vinculada perde o acesso. Só é permitida com o abrigo **vazio** (transferir ou desligar os abrigados antes).
5. `lotacao_atual` e `status_infraestrutura` não são editáveis: são calculados a partir dos abrigados (RF12) e das ocorrências (RF05).
6. Toda alteração gera log (`ABRIGO_CRIADO`, `ABRIGO_ATUALIZADO`) com os valores antes/depois.

---

## Critérios de Aceite
- O ADMIN cadastra um abrigo e ele aparece imediatamente no mapa público.
- O coordenador consegue atualizar a capacidade do seu abrigo, mas recebe `403` ao tentar alterar a chave PIX.
- Tentativa de desativar abrigo com pessoas presentes retorna `409 ABRIGO_COM_ABRIGADOS`.

---

## Implementação (backend)
- `GET|POST /api/abrigos`, `GET|PATCH /api/abrigos/{id}`
- Código: `src/modules/abrigos/abrigos.service.ts`
