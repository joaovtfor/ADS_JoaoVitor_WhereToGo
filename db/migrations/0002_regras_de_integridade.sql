-- =============================================================================
-- WhereToGo - Migration 0002: Regras de integridade (functions + triggers)
-- -----------------------------------------------------------------------------
-- Regras que precisam valer para QUALQUER caminho de escrita (API, scripts,
-- acesso manual ao banco) ficam no banco. Políticas de negócio (permissões,
-- capacidade, etc.) ficam na API.
--
-- Códigos de erro próprios (SQLSTATE) traduzidos pela API (src/lib/http.ts):
--   WTG01 - tentativa de alterar/excluir registro imutável (append-only)
--   WTG02 - vínculo inválido entre papel do usuário e abrigo
--   WTG03 - transferência de abrigado inconsistente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- atualizado_em automático
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_definir_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_abrigo_atualizado_em
    BEFORE UPDATE ON abrigo
    FOR EACH ROW EXECUTE FUNCTION fn_definir_atualizado_em();

CREATE TRIGGER trg_usuario_atualizado_em
    BEFORE UPDATE ON usuario
    FOR EACH ROW EXECUTE FUNCTION fn_definir_atualizado_em();

CREATE TRIGGER trg_abrigado_atualizado_em
    BEFORE UPDATE ON abrigado
    FOR EACH ROW EXECUTE FUNCTION fn_definir_atualizado_em();

CREATE TRIGGER trg_estoque_abrigo_atualizado_em
    BEFORE UPDATE ON estoque_abrigo
    FOR EACH ROW EXECUTE FUNCTION fn_definir_atualizado_em();

-- -----------------------------------------------------------------------------
-- Tabelas imutáveis (RNF03): LOG_AUDITORIA, MOVIMENTACAO_ESTOQUE e
-- TRANSFERENCIA_ABRIGADO aceitam apenas INSERT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bloquear_alteracao_imutavel()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'A tabela "%" é imutável (append-only): operação % não permitida.', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'WTG01';
END;
$$;

CREATE TRIGGER trg_log_auditoria_imutavel
    BEFORE UPDATE OR DELETE ON log_auditoria
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_alteracao_imutavel();
CREATE TRIGGER trg_log_auditoria_sem_truncate
    BEFORE TRUNCATE ON log_auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_alteracao_imutavel();

CREATE TRIGGER trg_movimentacao_estoque_imutavel
    BEFORE UPDATE OR DELETE ON movimentacao_estoque
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_alteracao_imutavel();
CREATE TRIGGER trg_movimentacao_estoque_sem_truncate
    BEFORE TRUNCATE ON movimentacao_estoque
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_alteracao_imutavel();

CREATE TRIGGER trg_transferencia_abrigado_imutavel
    BEFORE UPDATE OR DELETE ON transferencia_abrigado
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_alteracao_imutavel();
CREATE TRIGGER trg_transferencia_abrigado_sem_truncate
    BEFORE TRUNCATE ON transferencia_abrigado
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_alteracao_imutavel();

-- -----------------------------------------------------------------------------
-- Usuário: ADMIN não tem abrigo; COORDENADOR/VOLUNTARIO precisam de um.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_vinculo_usuario()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_papel papel_usuario.nome%TYPE;
BEGIN
    SELECT nome INTO v_papel FROM papel_usuario WHERE id = NEW.id_papel;

    IF v_papel = 'ADMIN' AND NEW.id_abrigo IS NOT NULL THEN
        RAISE EXCEPTION 'Usuários ADMIN não podem ser vinculados a um abrigo.'
            USING ERRCODE = 'WTG02';
    ELSIF v_papel <> 'ADMIN' AND NEW.id_abrigo IS NULL THEN
        RAISE EXCEPTION 'Usuários % devem estar vinculados a um abrigo.', v_papel
            USING ERRCODE = 'WTG02';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_vinculo
    BEFORE INSERT OR UPDATE OF id_papel, id_abrigo ON usuario
    FOR EACH ROW EXECUTE FUNCTION fn_validar_vinculo_usuario();

-- -----------------------------------------------------------------------------
-- Estoque: toda movimentação atualiza o saldo de ESTOQUE_ABRIGO na mesma
-- transação e grava o saldo resultante. Saldo negativo viola
-- estoque_abrigo_quantidade_ck e aborta a movimentação inteira.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_aplicar_movimentacao_estoque()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_saldo          INTEGER;
    v_status_normal  INTEGER;
    v_status_urgente INTEGER;
BEGIN
    SELECT id INTO STRICT v_status_normal  FROM status_necessidade WHERE codigo = 'NORMAL';
    SELECT id INTO STRICT v_status_urgente FROM status_necessidade WHERE codigo = 'URGENTE';

    UPDATE estoque_abrigo
       SET quantidade = quantidade + NEW.quantidade,
           -- Promove automaticamente de NORMAL para URGENTE quando o saldo cai abaixo do mínimo
           -- (respeitando itens marcados como BLOQUEADO).
           id_status_necessidade = CASE
               WHEN id_status_necessidade = v_status_normal AND (quantidade + NEW.quantidade) < quantidade_minima
                   THEN v_status_urgente
               ELSE id_status_necessidade
           END
     WHERE id_abrigo = NEW.id_abrigo
       AND id_item = NEW.id_item
    RETURNING quantidade INTO v_saldo;

    IF NOT FOUND THEN
        -- Primeira movimentação do item neste abrigo: cria o registro de estoque.
        INSERT INTO estoque_abrigo (id_abrigo, id_item, id_status_necessidade, quantidade)
        VALUES (NEW.id_abrigo, NEW.id_item, v_status_normal, NEW.quantidade)
        ON CONFLICT (id_abrigo, id_item)
            DO UPDATE SET
                quantidade = estoque_abrigo.quantidade + EXCLUDED.quantidade,
                id_status_necessidade = CASE
                    WHEN estoque_abrigo.id_status_necessidade = v_status_normal
                         AND (estoque_abrigo.quantidade + EXCLUDED.quantidade) < estoque_abrigo.quantidade_minima
                        THEN v_status_urgente
                    ELSE estoque_abrigo.id_status_necessidade
                END
        RETURNING quantidade INTO v_saldo;
    END IF;

    NEW.quantidade_resultante := v_saldo;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_movimentacao_estoque_aplicar
    BEFORE INSERT ON movimentacao_estoque
    FOR EACH ROW EXECUTE FUNCTION fn_aplicar_movimentacao_estoque();

-- -----------------------------------------------------------------------------
-- Lotação: ABRIGO.lotacao_atual = nº de ABRIGADOs PRESENTES + acolhidos_nao_triados.
-- Incrementos/decrementos atômicos (seguros sob concorrência).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sincronizar_nao_triados_abrigo()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.lotacao_atual := NEW.acolhidos_nao_triados;
    ELSIF NEW.acolhidos_nao_triados <> OLD.acolhidos_nao_triados THEN
        NEW.lotacao_atual := OLD.lotacao_atual + (NEW.acolhidos_nao_triados - OLD.acolhidos_nao_triados);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_abrigo_nao_triados
    BEFORE INSERT OR UPDATE OF acolhidos_nao_triados ON abrigo
    FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_nao_triados_abrigo();

CREATE OR REPLACE FUNCTION fn_atualizar_lotacao_abrigo()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.status_acolhimento = NEW.status_acolhimento
       AND OLD.id_abrigo_atual = NEW.id_abrigo_atual THEN
        RETURN NULL;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status_acolhimento = 'PRESENTE' THEN
        UPDATE abrigo SET lotacao_atual = lotacao_atual - 1 WHERE id = OLD.id_abrigo_atual;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status_acolhimento = 'PRESENTE' THEN
        UPDATE abrigo SET lotacao_atual = lotacao_atual + 1 WHERE id = NEW.id_abrigo_atual;
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_abrigado_lotacao
    AFTER INSERT OR DELETE OR UPDATE OF status_acolhimento, id_abrigo_atual ON abrigado
    FOR EACH ROW EXECUTE FUNCTION fn_atualizar_lotacao_abrigo();

-- -----------------------------------------------------------------------------
-- Transferência de abrigado: valida a origem e move o abrigado para o destino.
-- O histórico (TRANSFERENCIA_ABRIGADO) e o abrigo atual nunca divergem.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_processar_transferencia_abrigado()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_abrigo_atual abrigado.id_abrigo_atual%TYPE;
    v_status       abrigado.status_acolhimento%TYPE;
BEGIN
    SELECT id_abrigo_atual, status_acolhimento
      INTO v_abrigo_atual, v_status
      FROM abrigado
     WHERE id = NEW.id_abrigado
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Abrigado % não encontrado.', NEW.id_abrigado USING ERRCODE = 'WTG03';
    END IF;

    IF v_status <> 'PRESENTE' THEN
        RAISE EXCEPTION 'Somente abrigados com status PRESENTE podem ser transferidos.'
            USING ERRCODE = 'WTG03';
    END IF;

    IF v_abrigo_atual <> NEW.id_abrigo_origem THEN
        RAISE EXCEPTION 'O abrigo de origem (%) não é o abrigo atual do abrigado (%).',
            NEW.id_abrigo_origem, v_abrigo_atual
            USING ERRCODE = 'WTG03';
    END IF;

    UPDATE abrigado SET id_abrigo_atual = NEW.id_abrigo_destino WHERE id = NEW.id_abrigado;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transferencia_abrigado_processar
    BEFORE INSERT ON transferencia_abrigado
    FOR EACH ROW EXECUTE FUNCTION fn_processar_transferencia_abrigado();

-- -----------------------------------------------------------------------------
-- Status de infraestrutura do abrigo = pior gravidade entre as ocorrências
-- ativas (NORMAL quando não há nenhuma).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_atualizar_status_infraestrutura()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_id_abrigo INTEGER;
BEGIN
    FOREACH v_id_abrigo IN ARRAY (
        CASE TG_OP
            WHEN 'INSERT' THEN ARRAY[NEW.id_abrigo]
            WHEN 'DELETE' THEN ARRAY[OLD.id_abrigo]
            ELSE ARRAY[OLD.id_abrigo, NEW.id_abrigo]
        END
    ) LOOP
        -- Serializa recálculos concorrentes do mesmo abrigo antes de agregar.
        PERFORM 1 FROM abrigo WHERE id = v_id_abrigo FOR UPDATE;

        UPDATE abrigo
           SET status_infraestrutura = COALESCE((
                   SELECT CASE WHEN bool_or(o.gravidade = 'CRITICO') THEN 'CRITICO' ELSE 'ALERTA' END
                     FROM ocorrencia_infraestrutura o
                    WHERE o.id_abrigo = v_id_abrigo
                      AND o.data_resolucao IS NULL
                   HAVING count(*) > 0
               ), 'NORMAL')
         WHERE id = v_id_abrigo;
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_ocorrencia_infraestrutura_status
    AFTER INSERT OR DELETE OR UPDATE OF gravidade, data_resolucao, id_abrigo ON ocorrencia_infraestrutura
    FOR EACH ROW EXECUTE FUNCTION fn_atualizar_status_infraestrutura();
