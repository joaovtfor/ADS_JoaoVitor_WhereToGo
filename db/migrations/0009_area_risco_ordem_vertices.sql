-- =============================================================================
-- WhereToGo - Migration 0009: Área de risco com pontos marcados fora de ordem
-- -----------------------------------------------------------------------------
-- A 0008 passou a recusar polígonos cujas bordas se cruzam. Na prática isso
-- acontece quando o coordenador marca os cantos fora da sequência do contorno
-- (ex.: os 4 cantos de uma quadra em "Z"), algo que antes era aceito. Agora,
-- se o polígono marcado é inválido, os mesmos pontos são ligados em volta do
-- centro (ordem angular), que forma o contorno pretendido.
--
-- Pontos alinhados (ou quase: 3 cliques sobre a mesma rua) formavam uma "lasca"
-- com área próxima de zero que passava no ST_IsValid. O CHECK passa a exigir
-- ao menos 100 m², tamanho abaixo do qual uma área de risco não orienta ninguém.
-- =============================================================================

ALTER TABLE ocorrencia_infraestrutura
    DROP CONSTRAINT ocorrencia_infraestrutura_area_risco_valida_ck,
    ADD CONSTRAINT ocorrencia_infraestrutura_area_risco_valida_ck CHECK (
        area_risco IS NULL OR (ST_IsValid(area_risco::geometry) AND ST_Area(area_risco) >= 100)
    );

CREATE OR REPLACE FUNCTION fn_area_risco_de_vertices(p_vertices JSONB)
RETURNS GEOGRAPHY
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_pontos    GEOMETRY[];
    v_marcado   GEOMETRY;
    v_centro    GEOMETRY;
    v_contorno  GEOMETRY;
BEGIN
    IF p_vertices IS NULL OR jsonb_array_length(p_vertices) < 3 THEN
        RETURN NULL;
    END IF;

    SELECT array_agg(ST_SetSRID(ST_MakePoint((v.ponto ->> 'lng')::float8, (v.ponto ->> 'lat')::float8), 4326) ORDER BY v.ordem)
      INTO v_pontos
      FROM jsonb_array_elements(p_vertices) WITH ORDINALITY AS v(ponto, ordem);

    -- Na ordem em que foram marcados (preserva áreas côncavas desenhadas em sequência).
    v_marcado := ST_MakePolygon(ST_AddPoint(ST_MakeLine(v_pontos), v_pontos[1]));
    IF ST_IsValid(v_marcado) THEN
        RETURN v_marcado::geography;
    END IF;

    -- Bordas se cruzando: liga os pontos em volta do centro.
    v_centro := ST_Centroid(ST_Collect(v_pontos));
    SELECT ST_MakeLine(p ORDER BY ST_Azimuth(v_centro, p) NULLS LAST)
      INTO v_contorno
      FROM unnest(v_pontos) AS p;
    v_contorno := ST_MakePolygon(ST_AddPoint(v_contorno, ST_StartPoint(v_contorno)));
    IF ST_IsValid(v_contorno) THEN
        RETURN v_contorno::geography;
    END IF;

    -- Sem área (pontos alinhados/repetidos): o CHECK da tabela recusa com 422.
    -- Também cai aqui o caso de um contorno válido, mas menor que 100 m².
    RETURN v_marcado::geography;
END;
$$;
