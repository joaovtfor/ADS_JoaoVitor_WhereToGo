# RF12 - Gerenciar Abrigados (Acolhimento e Transferências)

## Metadados
- **Identificador**: RF12 *(novo — derivado das entidades ABRIGADO e TRANSFERENCIA_ABRIGADO do DER v2)*
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF01, RF10
- **Status**: ✅ API concluída (Semana 2) · ⏳ Telas (a planejar nas Semanas 3-4)

---

## Descrição do Requisito
O sistema deve registrar as pessoas acolhidas em cada abrigo (entrada e saída) e as transferências entre abrigos, mantendo a lotação real e o histórico de deslocamentos.

---

## Regras de Negócio (RN)
1. **Entrada (check-in)**: Voluntário ou Coordenador do abrigo (ou ADMIN) registra nome completo; CPF e data de nascimento são opcionais (documentos podem ter sido perdidos). CPF é validado pelos dígitos verificadores.
2. **Capacidade**: abrigo lotado (`lotacao_atual >= capacidade_maxima`) ou desativado não recebe novas pessoas (`409 ABRIGO_LOTADO`).
3. **Unicidade**: uma pessoa (CPF) não pode estar `PRESENTE` em dois abrigos. Se o CPF pertence a alguém `DESLIGADO`, o cadastro é reaproveitado (reentrada).
4. **Status**: `PRESENTE` ou `DESLIGADO`. Desligar (saída definitiva) é exclusivo de Coordenador/ADMIN e preenche `data_saida`.
5. **Transferência**: Coordenador do abrigo atual (ou ADMIN) transfere um abrigado `PRESENTE` para outro abrigo **ativo e com vaga**, informando o motivo. O histórico (`TRANSFERENCIA_ABRIGADO`) é imutável e o banco garante que a origem registrada é o abrigo atual.
6. **Lotação automática**: `ABRIGO.lotacao_atual` é recalculada por trigger em toda entrada, saída e transferência (base do RF04 e do RF06).
7. **LGPD**: dados de abrigados nunca aparecem na API pública; cada coordenador vê apenas os abrigados do próprio abrigo.

---

## Critérios de Aceite
- Após o check-in, a lotação e as vagas do abrigo mudam no dashboard e no mapa público.
- Transferência para abrigo lotado é recusada; transferência válida atualiza as duas lotações e aparece no histórico da pessoa.
- Voluntário recebe `403` ao tentar desligar ou transferir abrigados.

---

## Implementação (backend)
- `GET|POST /api/abrigos/{id}/abrigados`, `GET|PATCH /api/abrigados/{id}`
- `POST /api/abrigados/{id}/desligamento`, `GET|POST /api/abrigados/{id}/transferencias`
- Código: `src/modules/abrigados/abrigados.service.ts`; triggers `fn_atualizar_lotacao_abrigo` e `fn_processar_transferencia_abrigado`.
