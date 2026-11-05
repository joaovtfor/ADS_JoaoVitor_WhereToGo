-- =============================================================================
-- WhereToGo - Migration 0010: Melhorias da Semana 7 (Benchmark de Plataformas)
-- -----------------------------------------------------------------------------
-- 1. Tags de perfil e acessibilidade do abrigo (`aceita_pets`, `acessivel_pcd`),
--    inspiradas no SOS RS / Ajuda RS.
-- 2. Suporte a Reporte Cidadão de Incidentes com fila de moderação
--    (`status_validacao` = PENDENTE | APROVADA | REJEITADA, `relator_nome`,
--    `relator_contato` e `id_usuario_registro` opcional), inspirado no
--    Ushahidi e Waze Crisis.
-- =============================================================================

ALTER TABLE abrigo
    ADD COLUMN aceita_pets   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN acessivel_pcd BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE abrigo
   SET aceita_pets   = (id % 2 = 1),
       acessivel_pcd = TRUE;

ALTER TABLE ocorrencia_infraestrutura
    ALTER COLUMN id_usuario_registro DROP NOT NULL,
    ADD COLUMN status_validacao VARCHAR(15) NOT NULL DEFAULT 'APROVADA',
    ADD COLUMN relator_nome     VARCHAR(100),
    ADD COLUMN relator_contato  VARCHAR(40),
    ADD CONSTRAINT ocorrencia_infraestrutura_validacao_ck
        CHECK (status_validacao IN ('PENDENTE', 'APROVADA', 'REJEITADA'));

DROP INDEX IF EXISTS ocorrencia_infraestrutura_ativa_uk;

CREATE UNIQUE INDEX ocorrencia_infraestrutura_ativa_uk
    ON ocorrencia_infraestrutura (id_abrigo, tipo)
    WHERE data_resolucao IS NULL
      AND status_validacao = 'APROVADA'
      AND tipo NOT IN ('OUTRO', 'AREA_RISCO');

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

DROP TRIGGER IF EXISTS trg_ocorrencia_infraestrutura_status ON ocorrencia_infraestrutura;

CREATE TRIGGER trg_ocorrencia_infraestrutura_status
    AFTER INSERT OR DELETE OR UPDATE OF gravidade, data_resolucao, id_abrigo, status_validacao
    ON ocorrencia_infraestrutura
    FOR EACH ROW EXECUTE FUNCTION fn_atualizar_status_infraestrutura();
