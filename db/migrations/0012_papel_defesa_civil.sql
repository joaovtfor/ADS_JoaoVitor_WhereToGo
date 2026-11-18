-- =============================================================================
-- WhereToGo - Migration 0012: Papel DEFESA_CIVIL e ocorrências regionais
-- -----------------------------------------------------------------------------
-- Etapa 2 do plano de integração (.specs/plano-integracao-defesa-civil.md §4.2).
--
-- 1. Papel DEFESA_CIVIL (comando municipal no SCO): visão de todos os abrigos,
--    sem vínculo com um abrigo, como o ADMIN; mas sem gestão de usuários,
--    catálogo nem cadastro de abrigo (chave PIX). As permissões ficam na API
--    (src/lib/auth/permissoes.ts); aqui só a regra de vínculo.
-- 2. Ocorrência regional: `id_abrigo` nulo para alertas do território (via
--    interditada, área de risco, alagamento, deslizamento), que não pertencem
--    a um abrigo. A RN3 da RF09 deixava isso fora do MVP por falta deste papel.
--    Uma área de risco regional marca os abrigos cobertos por ela pelo
--    `emAreaDeRisco` (ST_Covers, já existente), mas NÃO altera o
--    `status_infraestrutura` deles: o status fala da infraestrutura do próprio
--    abrigo (decisão do responsável em 17/11/2026).
-- =============================================================================

INSERT INTO papel_usuario (nome, descricao) VALUES
    ('DEFESA_CIVIL', 'Defesa Civil Municipal (comando SCO): visão de todos os abrigos, ocorrências regionais, moderação e remanejamento. Sem gestão de usuários, catálogo ou chave PIX.')
ON CONFLICT (nome) DO NOTHING;

-- ADMIN e DEFESA_CIVIL não pertencem a um abrigo; os demais papéis, sim.
CREATE OR REPLACE FUNCTION fn_validar_vinculo_usuario()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_papel        papel_usuario.nome%TYPE;
    v_visao_global BOOLEAN;
BEGIN
    SELECT nome INTO v_papel FROM papel_usuario WHERE id = NEW.id_papel;
    v_visao_global := v_papel IN ('ADMIN', 'DEFESA_CIVIL');

    IF v_visao_global AND NEW.id_abrigo IS NOT NULL THEN
        RAISE EXCEPTION 'Usuários % não podem ser vinculados a um abrigo.', v_papel
            USING ERRCODE = 'WTG02';
    ELSIF NOT v_visao_global AND NEW.id_abrigo IS NULL THEN
        RAISE EXCEPTION 'Usuários % devem estar vinculados a um abrigo.', v_papel
            USING ERRCODE = 'WTG02';
    END IF;

    RETURN NEW;
END;
$$;

-- Ocorrência regional: sem abrigo, só tipos que fazem sentido no território e
-- sempre com local (ponto ou polígono; o rótulo do polígono é posicionado pelo
-- trigger BEFORE INSERT antes de o CHECK ser avaliado).
ALTER TABLE ocorrencia_infraestrutura
    ALTER COLUMN id_abrigo DROP NOT NULL,
    ADD CONSTRAINT ocorrencia_infraestrutura_regional_ck CHECK (
        id_abrigo IS NOT NULL
        OR (
            tipo IN ('VIA_BLOQUEADA', 'ALAGAMENTO', 'DESLIZAMENTO', 'AREA_RISCO', 'OUTRO')
            AND latitude IS NOT NULL
        )
    );

CREATE INDEX ocorrencia_infraestrutura_regional_ix
    ON ocorrencia_infraestrutura (data_registro DESC)
    WHERE id_abrigo IS NULL;

-- O recálculo do status do abrigo ignora ocorrências regionais (id_abrigo nulo).
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
        CONTINUE WHEN v_id_abrigo IS NULL;

        PERFORM 1 FROM abrigo WHERE id = v_id_abrigo FOR UPDATE;

        UPDATE abrigo
           SET status_infraestrutura = COALESCE((
                   SELECT CASE WHEN bool_or(o.gravidade = 'CRITICO') THEN 'CRITICO' ELSE 'ALERTA' END
                     FROM ocorrencia_infraestrutura o
                    WHERE o.id_abrigo = v_id_abrigo
                      AND o.data_resolucao IS NULL
                      AND o.status_validacao = 'APROVADA'
                   HAVING count(*) > 0
               ), 'NORMAL')
         WHERE id = v_id_abrigo;
    END LOOP;

    RETURN NULL;
END;
$$;
