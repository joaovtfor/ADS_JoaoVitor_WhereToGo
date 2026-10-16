# RF11 - Gerenciar Usuários da Equipe

## Metadados
- **Identificador**: RF11 *(novo — derivado do stakeholder Administrador Geral: "cadastra novos coordenadores")*
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: RF01, RF10
- **Status**: ✅ Concluído (API na Semana 2 · Telas na Semana 3)

---

## Descrição do Requisito
O sistema deve permitir o cadastro e a manutenção dos usuários do painel interno (Administradores, Coordenadores e Voluntários).

---

## Regras de Negócio (RN)
1. **ADMIN** cria e edita usuários de qualquer papel. ADMIN nunca tem abrigo; COORDENADOR e VOLUNTARIO sempre têm um abrigo **ativo** (garantido também por trigger no banco).
2. **COORDENADOR** cria e gerencia apenas **voluntários do próprio abrigo**, podendo alterar somente nome, senha e status (ativo).
3. **E-mail** único (normalizado em minúsculas). **Senha** com no mínimo 8 caracteres (máx. 72 bytes, limite do bcrypt), armazenada apenas como hash.
4. **Sem exclusão**: usuários são desativados (`ativo = false`), preservando a autoria em logs e movimentações.
5. **Salvaguardas**: ninguém desativa ou altera o papel da própria conta; o sistema mantém ao menos um ADMIN ativo.
6. Alterações geram log (`USUARIO_CRIADO`, `USUARIO_ATUALIZADO`) sem registrar senhas.

---

## Critérios de Aceite
- Coordenador cria um voluntário e ele já consegue logar e operar o Fast-CRUD do abrigo.
- Coordenador recebe `403` ao tentar criar outro coordenador ou um voluntário de outro abrigo.
- Usuário desativado perde o acesso imediatamente, mesmo com token ainda válido.

---

## Implementação
- `GET|POST /api/usuarios`, `GET|PATCH /api/usuarios/{id}`
- Código Backend: `src/modules/usuarios/usuarios.service.ts`
- Código Frontend: `src/app/admin/geral/page.tsx` (aba Equipe e Acessos)
