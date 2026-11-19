# API REST - WhereToGo (Semanas 1 e 2)

Base: `/api`. JSON em UTF-8. Implementação em `src/app/api/**/route.ts` (rotas) e `src/modules/**` (regras).

## 1. Convenções

**Autenticação.** `POST /api/auth/login` devolve o JWT no corpo e também o grava no cookie `wtg_sessao` (httpOnly, SameSite=Lax). As rotas internas aceitam `Authorization: Bearer <token>` **ou** o cookie. A cada requisição o usuário é revalidado no banco (inativo/desvinculado = 401).

**Envelope de sucesso**
```json
{ "dados": { } }
```
Listagens paginadas (`?pagina=1&tamanho=50`, máx. 200):
```json
{ "dados": { "itens": [], "paginacao": { "pagina": 1, "tamanho": 50, "total": 120, "totalPaginas": 3 } } }
```

**Envelope de erro**
```json
{ "erro": { "codigo": "ESTOQUE_INSUFICIENTE", "mensagem": "Quantidade em estoque insuficiente...", "detalhes": [] } }
```

| HTTP | Códigos (`erro.codigo`) |
|---|---|
| 400 | `REQUISICAO_INVALIDA` (com `detalhes: [{ campo, mensagem }]`) |
| 401 | `NAO_AUTENTICADO` (inclui "Credenciais inválidas.") |
| 403 | `SEM_PERMISSAO`, `USUARIO_INATIVO`, `SEM_VINCULO_ABRIGO`, `ABRIGO_INATIVO` (login) |
| 404 | `NAO_ENCONTRADO` |
| 409 | `ESTOQUE_INSUFICIENTE`, `ABRIGO_LOTADO`, `ABRIGO_INATIVO`, `ITEM_INATIVO`, `ABRIGADO_JA_PRESENTE`, `ABRIGADO_JA_DESLIGADO`, `OCORRENCIA_JA_ATIVA`, `OCORRENCIA_JA_RESOLVIDA`, `CAPACIDADE_ABAIXO_DA_LOTACAO`, `ABRIGO_COM_ABRIGADOS`, `EMAIL_EM_USO`, `CPF_JA_CADASTRADO`, `REGISTRO_IMUTAVEL`, `TRANSFERENCIA_INVALIDA` |
| 422 | `VINCULO_INVALIDO`, `ULTIMO_ADMIN`, `AUTOALTERACAO_BLOQUEADA`, `SENHA_ATUAL_INCORRETA`, `REFERENCIA_INVALIDA` |
| 429 | `MUITAS_TENTATIVAS` (10 falhas de login por IP+e-mail a cada 15 min; rotas públicas por IP: 10 reportes a cada 15 min e 30 buscas de acolhidos a cada 5 min) |

## 2. Matriz RBAC (RNF05)

"Próprio" = somente dados do abrigo ao qual o usuário está vinculado. ADMIN e DEFESA_CIVIL têm visão global (sem vínculo com abrigo). A matriz fica em `src/lib/auth/permissoes.ts`.

| Ação | ADMIN | DEFESA_CIVIL | COORDENADOR | VOLUNTARIO |
|---|:---:|:---:|:---:|:---:|
| Ver abrigo / estoque / ocorrências / abrigados | todos | todos | próprio | próprio |
| Cadastrar abrigo; editar nome, endereço, localização, **PIX**, ativo | ✅ | ❌ | ❌ | ❌ |
| Editar telefone, capacidade e acolhidos não triados do abrigo | ✅ | ❌ | próprio | ❌ |
| Dashboard de triagem (RF04) | ✅ | todos | próprio | ❌ |
| Movimentar estoque +/- (RF02) | ✅ | ❌ | próprio | próprio |
| Ajuste de inventário (AJUSTE) | ✅ | ❌ | próprio | ❌ |
| Transferência de itens entre abrigos | ✅ | todos | próprio | ❌ |
| Status URGENTE/NORMAL/BLOQUEADO e estoque mínimo (RF03) | ✅ | ❌ | próprio | ❌ |
| Histórico de movimentações | ✅ | todos | próprio | ❌ |
| Registrar/resolver/moderar ocorrência de infraestrutura (RF05) | ✅ | todos | próprio | ❌ |
| Ocorrência regional (sem abrigo): registrar e encerrar | ✅ | ✅ | ❌ (consulta) | ❌ (consulta) |
| Registrar entrada de abrigado (check-in) | ✅ | ❌ | próprio | próprio |
| Editar e desligar abrigado | ✅ | ❌ | próprio | ❌ |
| Transferir abrigado | ✅ | todos | próprio | ❌ |
| Gerenciar catálogo (categorias/itens) | ✅ | ❌ | ❌ | ❌ |
| Gerenciar usuários | todos | ❌ | voluntários do próprio abrigo | ❌ |
| Consultar auditoria (RF13) | todos | todos | próprio | ❌ |
| Forçar consulta aos avisos do INMET | ✅ | ✅ | ❌ | ❌ |

## 3. Endpoints

### 3.1. Públicos (sem login - RNF02)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Saúde da aplicação + banco + versão do PostGIS |
| GET | `/api/referencias` | Domínios: papéis, status de necessidade, tipos de movimentação/ocorrência, níveis de ocupação |
| GET | `/api/public/abrigos` | RF06/RF08 - abrigos ativos. Query: `lat`, `lng`, `raioKm`, `necessidade` (slugs, ex. `agua,cama-e-banho`), `item` (ids), `somenteDestaque`, `formato=json\|geojson` |
| GET | `/api/public/abrigos/{id}` | RF07 - card: ocupação, contato, `pix`, `rotas` (Google Maps/Waze), necessidades, ocorrências ativas |
| GET | `/api/public/categorias` | RF08 - categorias e itens ativos para o menu de filtros |
| GET | `/api/public/alertas` | RF09 - ocorrências ativas com coordenadas (`formato=json\|geojson`) |
| GET | `/api/public/mapa` | Abrigos, alertas e `avisos` (INMET) numa resposta só, com ETag (304 sem corpo quando nada mudou). Query: `lat`, `lng`, `raioKm` |
| GET | `/api/public/avisos` | Avisos meteorológicos oficiais do INMET vigentes ou previstos para o município: `evento`, `severidade` (`MODERADA\|SEVERA\|EXTREMA`), `rotuloSeveridade`, `inicio`, `fim`, `riscos`, `instrucoes`, `link` |

As leituras de `/api/public/mapa`, `/api/public/avisos` e `/api/integracoes/avisos` também disparam, depois da resposta, a consulta ao INMET quando a última tem mais de `INTERVALO_AVISOS_MIN` (ver `.specs/plano-integracao-defesa-civil.md` §3).

Regras do filtro (RF08): `destaque: true` quando o abrigo tem item **URGENTE** na categoria/item escolhido; itens **BLOQUEADOS** nunca geram destaque. Ordenação: destacados primeiro, depois menor distância (PostGIS). Dados pessoais e quantidades de estoque **não** são expostos.

```http
GET /api/public/abrigos?lat=-28.25&lng=-52.40&necessidade=agua
```
```json
{ "dados": [ {
  "id": 3, "nome": "Escola Estadual Bairro Boqueirão", "latitude": -28.2486, "longitude": -52.423,
  "ocupacao": { "capacidadeMaxima": 80, "lotacaoAtual": 3, "vagasDisponiveis": 77, "percentual": 3.8, "nivel": "VERDE" },
  "statusInfraestrutura": "CRITICO",
  "ocorrenciasAtivas": [ { "tipo": "VIA_BLOQUEADA", "gravidade": "CRITICO" } ],
  "necessidades": { "urgentes": [ { "id": 3, "nome": "Água Potável 5 L", "categoria": "agua" } ], "bloqueados": [] },
  "destaque": true, "distanciaKm": 2.26, "atualizadoEm": "2026-10-06T22:58:15.000Z"
} ] }
```

### 3.2. Autenticação (RF01)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | `{ email, senha }` → `{ token, expiraEm, usuario, redirecionarPara }` + cookie |
| POST | `/api/auth/logout` | Remove o cookie de sessão (204) |
| GET | `/api/auth/me` | Dados da sessão atual e rota inicial do perfil |
| PUT | `/api/auth/senha` | `{ senhaAtual, novaSenha }` (mín. 8 caracteres) → 204 |

Redirecionamento por perfil: `VOLUNTARIO → /admin/inventario`, `COORDENADOR → /admin/dashboard`, `DEFESA_CIVIL → /admin/ocorrencias`, `ADMIN → /admin/geral`.

### 3.3. Abrigos (RF10, RF04)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/abrigos` | Lista (ADMIN: todos; demais: o próprio). Query: `ativo`, `busca` |
| POST | `/api/abrigos` | Cadastra: `{ nome, endereco, latitude, longitude, capacidadeMaxima, telefone?, chavePix?, titularPix? }` |
| GET | `/api/abrigos/{id}` | Detalhe com `ocupacao` |
| PATCH | `/api/abrigos/{id}` | Atualização parcial (campos conforme papel). `ativo: false` exige abrigo vazio |
| GET | `/api/abrigos/{id}/dashboard` | RF04 - ocupação, acolhidos (24h), itens críticos, ocorrências ativas, últimas movimentações e `sugestoesTransferencia` (cada uma com `rotaBloqueada`: o trajeto direto até o parceiro cruza área de risco ativa; essas vêm por último) |

### 3.4. Estoque (RF02, RF03)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/abrigos/{id}/estoque` | Itens do abrigo. `incluirCatalogo=true` traz também itens sem saldo (tela Fast-CRUD). `categoria=<slug>` |
| POST | `/api/abrigos/{id}/estoque/{itemId}/movimentacoes` | **Fast-CRUD** (ver abaixo) |
| PATCH | `/api/abrigos/{id}/estoque/{itemId}` | `{ statusNecessidade?: "URGENTE"\|"NORMAL"\|"BLOQUEADO", quantidadeMinima? }` |
| GET | `/api/abrigos/{id}/movimentacoes` | Histórico paginado. Query: `idItem`, `tipo`, `de`, `ate` |
| POST | `/api/abrigos/{id}/transferencias-estoque` | `{ idAbrigoDestino, idItem, quantidade, observacao }` - saída e entrada atômicas |

Corpos aceitos pelo Fast-CRUD:
```jsonc
{ "quantidade": 1 }                                   // + : ENTRADA_DOACAO
{ "quantidade": -1 }                                  // - : SAIDA_CONSUMO
{ "quantidade": -2, "tipo": "PERDA", "observacao": "Avaria" }
{ "tipo": "AJUSTE", "quantidadeFinal": 40, "observacao": "Contagem física" }   // só COORDENADOR
```
Resposta `201`: `{ idAbrigo, idItem, item, unidadeMedida, quantidadeAtual, movimentacao: { id, tipo, quantidade, quantidadeResultante, dataHora } }`. Saldo insuficiente → `409 ESTOQUE_INSUFICIENTE` (nada é gravado). O log de auditoria (`ESTOQUE_MOVIMENTADO`, "+1 Água Potável 5 L") é gravado em background.

### 3.5. Ocorrências de infraestrutura (RF05, RF09)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/abrigos/{id}/ocorrencias` | Query `ativas=true\|false`. Reportes pendentes trazem `relatosProximos` (outros reportes iguais a até 300 m, feitos até 2 h antes ou depois) e `confirmadosProximos` (alertas iguais já aprovados a até 300 m); a fila vem ordenada pelos mais corroborados |
| POST | `/api/abrigos/{id}/ocorrencias` | `{ tipo, gravidade?, descricao?, latitude?, longitude? }` → ocorrência + novo `statusInfraestrutura` |
| POST | `/api/abrigos/{id}/ocorrencias/{ocorrenciaId}/resolucao` | `{ observacao? }` → resolve e recalcula o status |
| GET | `/api/ocorrencias` | Ocorrências regionais (do município, sem abrigo). Query `ativas=true\|false`. Qualquer usuário logado |
| POST | `/api/ocorrencias` | ADMIN e DEFESA_CIVIL: `{ tipo, gravidade?, descricao?, latitude, longitude }` ou `{ tipo, poligono }`. Tipos: `VIA_BLOQUEADA`, `AREA_RISCO`, `ALAGAMENTO`, `DESLIZAMENTO`, `OUTRO`. Entra aprovada; área de risco marca os abrigos cobertos (`emAreaDeRisco`) sem mudar o status deles |
| POST | `/api/ocorrencias/{ocorrenciaId}/resolucao` | ADMIN e DEFESA_CIVIL: encerra a ocorrência regional |

Tipos: `SEM_ENERGIA`, `SEM_AGUA`, `SEM_COMUNICACAO`, `VIA_BLOQUEADA`, `ALAGAMENTO`, `DESLIZAMENTO`, `RISCO_ESTRUTURAL`, `OUTRO` (exige descrição). Gravidade padrão: CRITICO para via/alagamento/deslizamento/risco estrutural; ALERTA para os demais.

### 3.6. Abrigados (RF12)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/abrigos/{id}/abrigados` | Query: `status=PRESENTE\|DESLIGADO\|TODOS`, `busca` (nome ou CPF), paginação |
| POST | `/api/abrigos/{id}/abrigados` | Check-in `{ nomeCompleto, cpf?, dataNascimento? }`. CPF de pessoa DESLIGADA = reentrada (200) |
| GET | `/api/abrigados/{id}` | Detalhe |
| PATCH | `/api/abrigados/{id}` | Corrige `nomeCompleto`, `cpf`, `dataNascimento` |
| POST | `/api/abrigados/{id}/desligamento` | `{ motivo? }` - saída definitiva, libera a vaga |
| GET | `/api/abrigados/{id}/transferencias` | Histórico |
| POST | `/api/abrigados/{id}/transferencias` | `{ idAbrigoDestino, motivo }` - destino precisa estar ativo e com vaga |
| POST | `/api/abrigos/{id}/transferencias-lote` | `{ idsAbrigados (1 a 200, sem repetir), idAbrigoDestino, motivo }` - várias pessoas de uma vez, tudo ou nada: `409 VAGAS_INSUFICIENTES` se o destino não comporta todos, `409 ABRIGADOS_INDISPONIVEIS` se alguém já saiu ou foi movido. Audita `ABRIGADOS_TRANSFERIDOS_LOTE` |

### 3.7. Catálogo, usuários e auditoria (RF02, RF11, RF13)
| Método | Rota | Descrição |
|---|---|---|
| GET / POST | `/api/categorias` | Lista / cria `{ nome, slug? }` (slug gerado do nome) |
| PATCH | `/api/categorias/{id}` | `{ nome?, slug? }` |
| GET / POST | `/api/itens` | Lista (`categoria`, `ativo`, `busca`) / cria `{ idCategoria, nome, unidadeMedida }` |
| PATCH | `/api/itens/{id}` | `{ idCategoria?, nome?, unidadeMedida?, ativo? }` (sem exclusão física) |
| GET / POST | `/api/usuarios` | Lista (`papel`, `idAbrigo`, `ativo`, `busca`) / cria `{ nome, email, senha, papel, idAbrigo? }` |
| GET / PATCH | `/api/usuarios/{id}` | Detalhe / atualiza `{ nome?, email?, senha?, papel?, idAbrigo?, ativo? }` |
| GET | `/api/auditoria` | Logs imutáveis. Query: `idUsuario`, `idAbrigo`, `acao`, `de`, `ate`, paginação |

### 3.8. Avisos oficiais do INMET
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/integracoes/avisos` | Qualquer usuário logado (`aviso:ver`): `{ avisos, estado }`, com última consulta, falhas seguidas, pausa do breaker e último erro |
| POST | `/api/integracoes/avisos/sincronizacao` | ADMIN e DEFESA_CIVIL (`aviso:sincronizar`): consulta o INMET na hora, ignorando o intervalo e a pausa. Audita `AVISOS_CONSULTADOS` |

### 3.9. Eventos de desastre e relatórios (Etapa 4)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/eventos` | ADMIN, DEFESA_CIVIL, COORDENADOR: `{ eventos, cobrade }` (eventos com o COBRADE e a lista de códigos conferidos) |
| POST | `/api/eventos` | ADMIN e DEFESA_CIVIL: `{ nome, cobrade, inicio, fim?, decreto? }` (datas `AAAA-MM-DD`). Código fora da lista → `422 COBRADE_DESCONHECIDO` |
| PATCH | `/api/eventos/{id}` | Ajusta; `{ fim }` encerra o evento |
| GET | `/api/relatorios/fide` | `?idEvento=&idAbrigo=&formato=json\|csv`. Subsídios para o FIDE: desabrigados (pessoas distintas, pico diário no consolidado, faixas etárias com supressão de 1 a 4), assistência humanitária (descontados estornos) e ocorrências aprovadas com campo sugerido no FIDE. Coordenação: só o próprio abrigo. Audita `RELATORIO_FIDE_GERADO` |
| GET | `/api/relatorios/prestacao-contas` | `?inicio=&fim=&idAbrigo=` (até um ano). CSV (`;`, BOM UTF-8) com movimentações de estoque e eventos críticos da auditoria; SHA-256 dos bytes em `X-Conteudo-SHA256`, gravado em `PRESTACAO_CONTAS_EXPORTADA` |

## 4. Exemplo de uso (curl)
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"voluntario@wheretogo.local","senha":"WhereToGo@2026"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).dados.token")

curl -s -X POST http://localhost:3000/api/abrigos/1/estoque/3/movimentacoes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"quantidade":1}'
```
