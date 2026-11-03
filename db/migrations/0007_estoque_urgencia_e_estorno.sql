-- =============================================================================
-- WhereToGo - Migration 0007: Urgência automática reversível e estorno
-- -----------------------------------------------------------------------------
-- 1. Urgência automática: o trigger da 0002 promovia NORMAL -> URGENTE quando
--    o saldo caía abaixo do mínimo, mas nunca fazia o caminho de volta. O mapa
--    público seguia pedindo itens já repostos. Agora a promoção automática é
--    marcada (`urgente_automatico`) e desfeita quando o saldo volta ao mínimo
--    ou quando a equipe reduz o mínimo. A promoção continua acontecendo só
--    quando o saldo CAI (movimentação): definir um mínimo acima do saldo deixa
--    o item "abaixo do mínimo" no dashboard, sem publicá-lo como URGENTE no
--    mapa. URGENTE definido pela equipe é manual (nunca é revertido sozinho).
-- 2. Estorno: o "Desfazer" do Fast-CRUD gravava o tipo oposto (desfazer uma
--    PERDA virava ENTRADA_DOACAO), inflando doações e consumo. O tipo ESTORNO
--    referencia a movimentação original, com o sinal oposto, uma única vez.
--
-- Novo código de erro: WTG04 - estorno inconsistente com a movimentação original.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Urgência automática
-- -----------------------------------------------------------------------------
ALTER TABLE estoque_abrigo
    ADD COLUMN urgente_automatico BOOLEAN NOT NULL DEFAULT FALSE;

-- Dados existentes: URGENTE abaixo do mínimo é exatamente o que a regra
-- automática produziria, então passa a ser revertido na reposição. URGENTE com
-- saldo já acima do mínimo é tratado como decisão da equipe.
UPDATE estoque_abrigo e
   SET urgente_automatico = TRUE
  FROM status_necessidade s
 WHERE s.id = e.id_status_necessidade
   AND s.codigo = 'URGENTE'
   AND e.quantidade < e.quantidade_minima;

CREATE OR REPLACE FUNCTION fn_avaliar_urgencia_automatica()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status_normal  INTEGER;
    v_status_urgente INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Status alterado explicitamente pela equipe: a decisão manual prevalece.
        IF NEW.id_status_necessidade IS DISTINCT FROM OLD.id_status_necessidade THEN
            NEW.urgente_automatico := FALSE;
            RETURN NEW;
        END IF;
        -- Só mudanças de saldo (promove ou reverte) ou de mínimo (reverte) reavaliam a urgência.
        IF NEW.quantidade = OLD.quantidade AND NEW.quantidade_minima = OLD.quantidade_minima THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT id INTO STRICT v_status_normal  FROM status_necessidade WHERE codigo = 'NORMAL';
    SELECT id INTO STRICT v_status_urgente FROM status_necessidade WHERE codigo = 'URGENTE';

    IF NEW.id_status_necessidade = v_status_normal
       AND NEW.quantidade < NEW.quantidade_minima
       AND TG_OP = 'UPDATE' AND NEW.quantidade <> OLD.quantidade THEN
        NEW.id_status_necessidade := v_status_urgente;
        NEW.urgente_automatico := TRUE;
    ELSIF NEW.id_status_necessidade = v_status_urgente
          AND NEW.urgente_automatico
          AND NEW.quantidade >= NEW.quantidade_minima THEN
        NEW.id_status_necessidade := v_status_normal;
        NEW.urgente_automatico := FALSE;
    END IF;
    -- BLOQUEADO nunca muda sozinho.

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_estoque_abrigo_urgencia
    BEFORE INSERT OR UPDATE ON estoque_abrigo
    FOR EACH ROW EXECUTE FUNCTION fn_avaliar_urgencia_automatica();

-- -----------------------------------------------------------------------------
-- 2. Estorno
-- -----------------------------------------------------------------------------
ALTER TABLE movimentacao_estoque
    ADD COLUMN id_movimentacao_estornada BIGINT;

ALTER TABLE movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_estornada_fk
        FOREIGN KEY (id_movimentacao_estornada) REFERENCES movimentacao_estoque (id),
    DROP CONSTRAINT movimentacao_estoque_tipo_ck,
    ADD CONSTRAINT movimentacao_estoque_tipo_ck CHECK (tipo_movimentacao IN (
        'ENTRADA_DOACAO', 'SAIDA_CONSUMO', 'PERDA',
        'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA', 'AJUSTE', 'ESTORNO'
    )),
    -- ESTORNO (sinal livre, validado pelo trigger) sempre aponta a movimentação original.
    ADD CONSTRAINT movimentacao_estoque_estorno_ck CHECK (
        (tipo_movimentacao = 'ESTORNO') = (id_movimentacao_estornada IS NOT NULL)
    );

-- Cada movimentação só pode ser estornada uma vez.
CREATE UNIQUE INDEX movimentacao_estoque_estornada_uk
    ON movimentacao_estoque (id_movimentacao_estornada)
    WHERE id_movimentacao_estornada IS NOT NULL;

-- A movimentação agora só aplica o saldo; a urgência é avaliada pelo
-- trg_estoque_abrigo_urgencia. Também valida o estorno contra a original.
CREATE OR REPLACE FUNCTION fn_aplicar_movimentacao_estoque()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_saldo         INTEGER;
    v_status_normal INTEGER;
    v_original      movimentacao_estoque%ROWTYPE;
BEGIN
    IF NEW.tipo_movimentacao = 'ESTORNO' THEN
        SELECT * INTO v_original FROM movimentacao_estoque WHERE id = NEW.id_movimentacao_estornada;
        IF NOT FOUND
           OR v_original.id_abrigo <> NEW.id_abrigo
           OR v_original.id_item <> NEW.id_item THEN
            RAISE EXCEPTION 'Movimentação % não pertence a este item/abrigo.', NEW.id_movimentacao_estornada
                USING ERRCODE = 'WTG04';
        END IF;
        IF v_original.tipo_movimentacao NOT IN ('ENTRADA_DOACAO', 'SAIDA_CONSUMO', 'PERDA') THEN
            RAISE EXCEPTION 'Movimentações do tipo % não podem ser estornadas (use um ajuste de inventário).',
                v_original.tipo_movimentacao
                USING ERRCODE = 'WTG04';
        END IF;
        IF NEW.quantidade <> -v_original.quantidade THEN
            RAISE EXCEPTION 'O estorno deve ter a quantidade oposta à da movimentação original (%).',
                -v_original.quantidade
                USING ERRCODE = 'WTG04';
        END IF;
    END IF;

    UPDATE estoque_abrigo
       SET quantidade = quantidade + NEW.quantidade
     WHERE id_abrigo = NEW.id_abrigo
       AND id_item = NEW.id_item
    RETURNING quantidade INTO v_saldo;

    IF NOT FOUND THEN
        -- Primeira movimentação do item neste abrigo: cria o registro de estoque.
        SELECT id INTO STRICT v_status_normal FROM status_necessidade WHERE codigo = 'NORMAL';
        INSERT INTO estoque_abrigo (id_abrigo, id_item, id_status_necessidade, quantidade)
        VALUES (NEW.id_abrigo, NEW.id_item, v_status_normal, NEW.quantidade)
        ON CONFLICT (id_abrigo, id_item)
            DO UPDATE SET quantidade = estoque_abrigo.quantidade + EXCLUDED.quantidade
        RETURNING quantidade INTO v_saldo;
    END IF;

    NEW.quantidade_resultante := v_saldo;
    RETURN NEW;
END;
$$;
