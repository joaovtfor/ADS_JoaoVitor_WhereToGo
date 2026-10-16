# RF01 - Gerenciar Acesso (Autenticação e RBAC)

## Metadados
- **Identificador**: RF01
- **Caso de Uso**: UC01 Gerenciar Login
- **História de Usuário**: HU01 – Autenticação e Direcionamento por Perfil (RBAC)
- **Importância**: Essencial
- **Priorização**: 1
- **Dependências**: Nenhuma
- **Status**: ✅ Concluído (API na Semana 1 · Tela de login e Proxy na Semana 3)

---

## Descrição do Requisito
O sistema deve permitir o login e controle de acesso baseado em papéis (**RBAC**):
- **Administrador Geral (`ADMIN`)**
- **Coordenador de Abrigo (`COORDENADOR`)**
- **Voluntário Local (`VOLUNTARIO`)**

---

## Regras de Negócio (RN)
1. **Validação de Credenciais**: O sistema deve validar e-mail e senha (hash bcrypt, custo 12) no banco de dados.
2. **Geração de Sessão JWT**: Ao confirmar o login, o sistema lê o papel do usuário (`PAPEL_USUARIO`) e gera um token JWT (HS256) com as claims: `sub` (id), `nome`, `email`, `papel`, `idAbrigo`. O token é devolvido no corpo e gravado em cookie `httpOnly`.
3. **Bloqueio de Inativos/Desvinculados**: O acesso é negado se o usuário estiver inativo (`USUARIO.ativo = false`) ou desvinculado de um abrigo ativo (sem abrigo ou abrigo desativado), exceto o Administrador Geral, que não pertence a abrigo.
4. **Revalidação por requisição**: a cada chamada autenticada o usuário é relido no banco; desativação, troca de papel ou desativação do abrigo têm efeito imediato, sem esperar o token expirar.
5. **Proteção contra força bruta**: após 10 falhas por (IP + e-mail) ou 25 falhas por e-mail em 15 minutos, novas tentativas recebem `429`. A comparação de senha roda mesmo para e-mails inexistentes (tempo de resposta igual).
6. **Auditoria**: login com sucesso, falha e bloqueio são registrados em `LOG_AUDITORIA` (`LOGIN_SUCESSO`, `LOGIN_FALHA`, `LOGIN_BLOQUEADO`) com IP.

---

## Critérios de Aceite
- **Login de Voluntário**: Se as credenciais forem de um Voluntário, o sistema deve redirecioná-lo diretamente para a tela do Gerenciador de Inventário (`/admin/inventario` - Fast-CRUD), ocultando botões administrativos.
- **Login de Coordenador**: Se as credenciais forem de um Coordenador, o sistema deve redirecioná-lo para o Dashboard de Triagem (`/admin/dashboard`), exibindo alertas críticos e infraestrutura.
- **Login de Administrador**: Acesso global ao gerenciamento de coordenadores e auditoria (`/admin/geral`).
- **Falha de Segurança**: Se o usuário inserir dados errados, o sistema deve exibir `"Credenciais inválidas"` (sem especificar se foi o e-mail ou a senha que errou, para mitigar ataques de enumeração e força bruta).

---

## Implementação
- Backend:
  - `POST /api/auth/login` → `{ token, expiraEm, usuario, redirecionarPara }` + cookie `wtg_sessao`
  - `GET /api/auth/me`, `POST /api/auth/logout`, `PUT /api/auth/senha`
  - Código: `src/modules/auth/auth.service.ts`, `src/lib/auth/*` (jwt, sessão, rbac, senha)
- Frontend & Proteção de Rota (Semana 3):
  - `src/app/login/page.tsx`, `src/proxy.ts`, `src/app/admin/contexto-admin.tsx`, `src/app/admin/layout.tsx`
- Testes: `tests/integration/auth.test.ts`, `tests/e2e/api.test.ts`
