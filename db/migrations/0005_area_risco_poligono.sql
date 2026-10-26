-- =============================================================================
-- WhereToGo - Migration 0005: Demarcação de Áreas de Risco por Polígono no Mapa
-- -----------------------------------------------------------------------------
-- 1. Adiciona o tipo 'AREA_RISCO' ao domínio de `ocorrencia_infraestrutura`.
-- 2. Permite múltiplas ocorrências ativas de 'AREA_RISCO' por abrigo (assim
--    como 'OUTRO'), possibilitando demarcar mais de um perímetro interditado.
-- 3. Adiciona a coluna `poligono_risco JSONB` para armazenar os vértices
--    geográficos ([{ "lat": number, "lng": number }, ...]) que delimitam a
--    área de risco com no mínimo 3 pontos.
-- =============================================================================

ALTER TABLE ocorrencia_infraestrutura
    DROP CONSTRAINT ocorrencia_infraestrutura_tipo_ck,
    ADD CONSTRAINT ocorrencia_infraestrutura_tipo_ck CHECK (tipo IN (
        'SEM_ENERGIA', 'SEM_AGUA', 'SEM_COMUNICACAO', 'VIA_BLOQUEADA',
        'ALAGAMENTO', 'DESLIZAMENTO', 'RISCO_ESTRUTURAL', 'AREA_RISCO', 'OUTRO'
    ));

DROP INDEX IF EXISTS ocorrencia_infraestrutura_ativa_uk;

CREATE UNIQUE INDEX ocorrencia_infraestrutura_ativa_uk
    ON ocorrencia_infraestrutura (id_abrigo, tipo)
    WHERE data_resolucao IS NULL AND tipo NOT IN ('OUTRO', 'AREA_RISCO');

ALTER TABLE ocorrencia_infraestrutura
    ADD COLUMN poligono_risco JSONB,
    ADD CONSTRAINT ocorrencia_infraestrutura_poligono_ck CHECK (
        poligono_risco IS NULL
        OR (jsonb_typeof(poligono_risco) = 'array' AND jsonb_array_length(poligono_risco) >= 3)
    ),
    ADD CONSTRAINT ocorrencia_infraestrutura_area_risco_ck CHECK (
        tipo <> 'AREA_RISCO' OR poligono_risco IS NOT NULL
    );
