# RF01 - Gerenciar Acesso (Autenticação e RBAC)

## Metadados
- **Identificador**: RF01
- **Caso de Uso**: UC01 Gerenciar Login
- **História de Usuário**: HU01 – Autenticação e Direcionamento por Perfil (RBAC)
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: Nenhuma

---

## Descrição do Requisito
O sistema deve permitir o login e controle de acesso baseado em papéis (**RBAC**):
- **Administrador Geral (`ADMIN`)**
- **Coordenador de Abrigo (`COORDENADOR`)**
- **Voluntário Local (`VOLUNTARIO`)**

---

## Regras de Negócio (RN)
1. **Validação de Credenciais**: O sistema deve validar e-mail e senha (criptografada com bcrypt/argon2) no banco de dados.
2. **Geração de Sessão JWT**: Ao confirmar o login, o sistema deve ler a coluna `papel` (Role) do usuário e gerar um token de sessão (`JWT`) com as permissões e claims exatas (id, nome, email, papel, id_abrigo).
3. **Bloqueio de Inativos/Desvinculados**: O acesso deve ser negado caso o usuário esteja inativo ou desvinculado de um abrigo (com exceção do Administrador Geral).

---

## Critérios de Aceite
- **Login de Voluntário**: Se as credenciais forem de um Voluntário, o sistema deve redirecioná-lo diretamente para a tela do Gerenciador de Inventário (`/admin/inventario` - Fast-CRUD), ocultando botões administrativos.
- **Login de Coordenador**: Se as credenciais forem de um Coordenador, o sistema deve redirecioná-lo para o Dashboard de Triagem (`/admin/dashboard`), exibindo alertas críticos e infraestrutura.
- **Login de Administrador**: Acesso global ao gerenciamento de coordenadores e auditoria.
- **Falha de Segurança**: Se o usuário inserir dados errados, o sistema deve exibir `"Credenciais inválidas"` (sem especificar se foi o e-mail ou a senha que errou, para mitigar ataques de enumeração e força bruta).
