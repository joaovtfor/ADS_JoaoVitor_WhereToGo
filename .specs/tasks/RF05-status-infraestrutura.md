# RF05 - Reportar Status de Infraestrutura

## Metadados
- **Identificador**: RF05
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF01
- **Status**: ✅ API concluída (Semana 2) · ⏳ Tela (Semana 3)

---

## Descrição do Requisito
O sistema deve permitir o registro e atualização rápida de incidentes operacionais do abrigo, tais como: vias de acesso colapsadas, deslizamentos próximos, falta de energia elétrica, abastecimento de água interrompido ou operação regular.

---

## Regras de Negócio (RN)
1. **Permissão**: Coordenadores (do próprio abrigo) e Administradores Gerais.
2. **Ocorrências independentes**: cada incidente é um registro em `OCORRENCIA_INFRAESTRUTURA` (tipo, gravidade, descrição, local opcional, quem registrou/resolveu e quando). Vários incidentes podem estar ativos ao mesmo tempo (ex.: sem energia **e** via bloqueada), mas no máximo um ativo de cada tipo.
3. **Tipos**: `SEM_ENERGIA`, `SEM_AGUA`, `SEM_COMUNICACAO`, `VIA_BLOQUEADA` (via colapsada/obstruída), `ALAGAMENTO`, `DESLIZAMENTO`, `RISCO_ESTRUTURAL`, `OUTRO` (exige descrição). Gravidade `ALERTA` ou `CRITICO` (sugerida pelo tipo).
4. **Resumo no abrigo**: `ABRIGO.status_infraestrutura` é recalculado automaticamente (trigger): `NORMAL` sem ocorrências ativas; senão a pior gravidade ativa (`ALERTA`/`CRITICO`). "Operando normalmente" = nenhuma ocorrência ativa.
5. **Propagação**: As informações ficam disponíveis no mapa público (RF09) para que cidadãos e equipes de resgate evitem rotas intransitáveis.

---

## Critérios de Aceite
- Interface simples no Painel do Coordenador com toggles para cada tipo de incidente (ativar = registrar ocorrência; desativar = resolver).
- Registro de log da modificação com timestamp e usuário responsável (`OCORRENCIA_REGISTRADA` / `OCORRENCIA_RESOLVIDA`).

---

## Implementação (backend)
- `GET|POST /api/abrigos/{id}/ocorrencias`, `POST /api/abrigos/{id}/ocorrencias/{ocorrenciaId}/resolucao`
- Código: `src/modules/ocorrencias/ocorrencias.service.ts`; trigger `fn_atualizar_status_infraestrutura`.
