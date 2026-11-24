# Guia — Login com Google (One Tap) real

> **Documento de configuração (v1.0, 23/11/2026)**
> **Projeto:** WhereToGo — Plataforma de Gestão de Crise para Abrigos Emergenciais
> **Situação:** código pronto. Falta criar o Client ID no Google Cloud e colocá-lo nas variáveis de cada ambiente (passos 1 a 4).

---

## 1. Como funciona

```
/login ──GET /api/auth/google──▶ { clientId, nonce }  + cookie httpOnly wtg_google_nonce
  │
  ├─ Google Identity Services (script accounts.google.com/gsi/client)
  │    One Tap no canto da tela (Chrome usa o diálogo do próprio navegador, FedCM)
  │    ou o botão "Continuar com o Google"
  │
  └─ ID Token (JWT assinado pelo Google) ──POST /api/auth/google──▶ servidor confere:
       assinatura (chaves públicas do Google), emissor, validade, destinatário = nosso
       Client ID, e-mail verificado e nonce do token = nonce do cookie deste navegador
         ├─ conta liberada ............ entra (cookie de sessão), 1 toque
         ├─ e-mail novo ............... escolhe o abrigo → pedido fica PENDENTE
         └─ pedido pendente ........... "aguarda aprovação"
```

- **Só o Client ID** é necessário. O One Tap não usa *client secret* nem URI de redirecionamento.
- O Client ID é público (vai para o navegador). O servidor o lê de `GOOGLE_CLIENT_ID`; a tela o recebe pelo `GET /api/auth/google`, então não há variável `NEXT_PUBLIC_` nem novo build ao trocá-lo.
- **Google simulado** (só nome e e-mail, sem token): existe apenas em `npm run dev` e nos testes, sem `GOOGLE_CLIENT_ID`. Em produção (Render, Vercel) nunca vale. Antes desta mudança ele ficava ligado em produção sempre que o Client ID faltava, e qualquer pessoa entrava como qualquer usuário só informando o e-mail.
- As contas de demonstração do seed (`@wheretogo.local`) não são contas Google: continuam entrando por senha.

## 2. Passo a passo no Google Cloud

Console: <https://console.cloud.google.com>. Os nomes dos menus podem variar um pouco.

1. **Projeto:** no seletor do topo, **Novo projeto** → nome `WhereToGo` → Criar. Deixe-o selecionado.
2. **Tela de consentimento** (menu **Google Auth Platform**, antigo "Tela de consentimento OAuth"):
   1. **Branding (Informações do app):** nome `WhereToGo`, e-mail de suporte (o seu), e-mail de contato do desenvolvedor. Logo é opcional: com logo, o Google pede verificação da marca antes de exibi-lo.
   2. **Domínios autorizados:** `wheretogo-upf.vercel.app` (ou o nome escolhido na Vercel) e o domínio do Render (`<serviço>.onrender.com`). Como `vercel.app` e `onrender.com` são sufixos públicos, entra o endereço completo do app.
   3. **Público (Audience):** tipo **Externo**.
      - Em **Teste**, só os e-mails da lista **Usuários de teste** (até 100) conseguem entrar. Bom para a apresentação: adicione o seu e o de quem vai demonstrar.
      - Em **Produção** (botão **Publicar app**), qualquer conta Google entra. Com os escopos básicos (`openid`, `email`, `profile`), não há verificação do Google.
   4. **Acesso a dados (escopos):** não precisa adicionar nada. O Sign in with Google usa só os básicos.
3. **Cliente OAuth:** **Clientes** (ou **APIs e serviços → Credenciais**) → **Criar cliente** → tipo **Aplicativo da Web** → nome `WhereToGo Web`.
   - **Origens JavaScript autorizadas** (esquema + domínio + porta, sem barra no fim):

     | Origem | Para quê |
     |---|---|
     | `http://localhost` | o Google exige esta além da com porta |
     | `http://localhost:3000` | `npm run dev` padrão |
     | `http://localhost:3100` | preview usado nas sessões com o Claude |
     | `https://wheretogo-upf.vercel.app` | produção na Vercel (o nome escolhido) |
     | `https://<serviço>.onrender.com` | Render, até a Fase 4 da migração |

   - **URIs de redirecionamento autorizados:** deixe vazio (o login é por popup e callback em JavaScript).
   - **Criar** → copie o **ID do cliente** (`123456789012-abc...apps.googleusercontent.com`). O "segredo do cliente" não é usado.
4. A liberação de uma origem nova pode levar de 5 minutos a algumas horas.

## 3. Variáveis de ambiente

| Ambiente | Onde | O que fazer |
|---|---|---|
| Local | `.env` | `GOOGLE_CLIENT_ID=<id>` e reiniciar o `npm run dev` |
| Vercel | Project → Settings → Environment Variables (Production) | `GOOGLE_CLIENT_ID=<id>`; depois **Actions → CI → Run workflow** na `main` (variável nova só vale no próximo deploy) |
| Render | Serviço → Environment | `GOOGLE_CLIENT_ID=<id>` → Save (o Render publica de novo) |

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` ainda é lida como nome antigo, mas não é necessária. `PERMITIR_GOOGLE_SIMULADO` também não (em produção o simulado não existe).

## 4. Testar o fluxo completo

1. Abra `/login` numa janela em que você esteja logado no Google. O One Tap aparece no canto superior (no Chrome, como diálogo do navegador). Se não aparecer, use o botão **Continuar com o Google**.
2. **Primeiro acesso de um e-mail novo:** a tela pede o abrigo de atuação → **Solicitar acesso** → "Solicitação de acesso registrada".
3. Entre com a conta de demonstração **Coordenador • Central UPF** (ou Administração Geral) → **Equipe** → **Pedidos de acesso** → **Aprovar**.
4. Saia, volte a `/login` e toque no Google: entra direto no painel do voluntário.
5. **Pré-cadastro:** em **Equipe**, cadastre uma pessoa com o e-mail Google dela e a senha em branco. No primeiro toque no Google ela já entra, sem aprovação.

## 5. Problemas comuns

| Sintoma | Causa e correção |
|---|---|
| Console: `The given origin is not allowed for the given client ID` | A origem exata (esquema, domínio e porta) não está no cliente OAuth. Adicione e espere a propagação. |
| "Acesso bloqueado: o app não concluiu o processo de verificação" / `access_denied` | App em **Teste** e o e-mail não está em **Usuários de teste**. |
| One Tap não aparece | Depois de fechar o One Tap, o Google espera cada vez mais para mostrar de novo; no Chrome, **Configurações → Privacidade → Login de terceiros** precisa estar permitido; sem sessão no Google não há o que sugerir. O botão funciona em todos os casos. |
| "Não foi possível carregar o login com Google" | Um bloqueador de conteúdo ou a rede impediu o script de `accounts.google.com`. |
| `401 GOOGLE_NONCE_INVALIDO` | A página ficou aberta mais de 30 min (o nonce venceu) ou o token veio de outra página. A tela busca um nonce novo sozinha: é só tocar de novo. |
| `503 GOOGLE_NAO_CONFIGURADO` | `GOOGLE_CLIENT_ID` não chegou ao servidor (faltou o novo deploy). |
| `409 CONFLITO_CONTA_GOOGLE` | O e-mail já está ligado a outra conta Google (outro `sub`). |
| `403 USUARIO_INATIVO` | A conta foi desativada no painel: o Google não a reativa. |

## 6. Segurança (o que o código garante)

- **Token conferido no servidor** com as chaves públicas do Google (`jose`): assinatura, emissor `accounts.google.com`, validade, `aud` igual ao nosso Client ID e `email_verified`.
- **Nonce por navegador** (`src/lib/auth/google.ts`): um ID Token roubado ou emitido para outra página não serve sem o cookie `wtg_google_nonce` (httpOnly, `SameSite=Strict`, só em `/api/auth/google`, 30 min). O cookie é apagado depois do login.
- **Simulado nunca em produção** (`modoGoogleSimuladoHabilitado`).
- **CSP** já libera só `https://accounts.google.com/gsi/` (script, estilo, iframe do botão e chamadas). Ver `next.config.ts`.
- Testes: `tests/unit/google.test.ts` (token assinado por uma chave de teste no lugar da do Google) e `tests/integration/auth.test.ts` (auto-cadastro, aprovação e vínculo).
