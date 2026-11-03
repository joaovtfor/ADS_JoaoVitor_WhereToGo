-- =============================================================================
-- WhereToGo - Migration 0008: Áreas de risco como geometria PostGIS
-- -----------------------------------------------------------------------------
-- A 0005 guardava o polígono em JSONB e o rótulo era a média dos vértices, que
-- cai FORA da área em polígonos côncavos (ex.: uma encosta em "U"). Em JSONB
-- também não havia como validar a forma nem consultar "quais abrigos estão
-- dentro de uma área de risco".
--
-- Agora:
--   * `area_risco GEOGRAPHY(POLYGON)` com índice GiST e validade garantida
--     (sem bordas que se cruzam);
--   * o ponto do rótulo (latitude/longitude) vem de ST_PointOnSurface, que
--     está sempre dentro do polígono;
--   * a API continua expondo os vértices como [{ "lat", "lng" }] via
--     `fn_vertices_area_risco`, sem mudar o contrato do frontend.
-- =============================================================================

ALTER TABLE ocorrencia_infraestrutura
    ADD COLUMN area_risco GEOGRAPHY(POLYGON, 4326);

-- [{lat, lng}, ...] -> polígono (anel fechado automaticamente).
CREATE OR REPLACE FUNCTION fn_area_risco_de_vertices(p_vertices JSONB)
RETURNS GEOGRAPHY
LANGUAGE sql IMMUTABLE AS $$
    SELECT ST_MakePolygon(ST_AddPoint(linha, ST_StartPoint(linha)))::geography
      FROM (
          SELECT ST_SetSRID(ST_MakeLine(
                     ST_MakePoint((v.ponto ->> 'lng')::float8, (v.ponto ->> 'lat')::float8) ORDER BY v.ordem
                 ), 4326) AS linha
            FROM jsonb_array_elements(p_vertices) WITH ORDINALITY AS v(ponto, ordem)
      ) l
     WHERE p_vertices IS NOT NULL AND jsonb_array_length(p_vertices) >= 3;
$$;

-- Polígono -> [{lat, lng}, ...] sem repetir o ponto de fechamento.
CREATE OR REPLACE FUNCTION fn_vertices_area_risco(p_area GEOGRAPHY)
RETURNS JSONB
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_agg(jsonb_build_object('lat', ST_Y(d.geom), 'lng', ST_X(d.geom)) ORDER BY d.path[2])
      FROM ST_DumpPoints(p_area::geometry) d
     WHERE p_area IS NOT NULL
       AND d.path[1] = 1
       AND d.path[2] < ST_NPoints(ST_ExteriorRing(p_area::geometry));
$$;

-- Dados existentes. Polígonos que se cruzam viram o contorno convexo dos
-- mesmos pontos; pontos alinhados (sem área) viram um círculo de 50 m.
UPDATE ocorrencia_infraestrutura o
   SET area_risco = CASE
       WHEN ST_IsValid(g.poligono) AND ST_Area(g.poligono) > 0 THEN g.poligono::geography
       WHEN GeometryType(ST_ConvexHull(g.poligono)) = 'POLYGON' THEN ST_ConvexHull(g.poligono)::geography
       ELSE ST_Buffer(ST_Centroid(g.poligono)::geography, 50)
   END
  FROM (
      SELECT id, fn_area_risco_de_vertices(poligono_risco)::geometry AS poligono
        FROM ocorrencia_infraestrutura
       WHERE poligono_risco IS NOT NULL
  ) g
 WHERE o.id = g.id;

ALTER TABLE ocorrencia_infraestrutura
    DROP CONSTRAINT ocorrencia_infraestrutura_area_risco_ck,
    DROP CONSTRAINT ocorrencia_infraestrutura_poligono_ck,
    DROP COLUMN poligono_risco,
    ADD CONSTRAINT ocorrencia_infraestrutura_area_risco_ck CHECK (
        tipo <> 'AREA_RISCO' OR area_risco IS NOT NULL
    ),
    ADD CONSTRAINT ocorrencia_infraestrutura_area_risco_valida_ck CHECK (
        area_risco IS NULL OR (ST_IsValid(area_risco::geometry) AND ST_Area(area_risco) > 0)
    );

CREATE INDEX ocorrencia_infraestrutura_area_risco_gix
    ON ocorrencia_infraestrutura USING GIST (area_risco)
    WHERE area_risco IS NOT NULL;

-- O rótulo/pino da área de risco fica sempre dentro dela.
CREATE OR REPLACE FUNCTION fn_posicionar_rotulo_area_risco()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_ponto GEOMETRY;
BEGIN
    IF NEW.area_risco IS NOT NULL AND NEW.latitude IS NULL THEN
        v_ponto := ST_PointOnSurface(NEW.area_risco::geometry);
        NEW.latitude := round(ST_Y(v_ponto)::numeric, 6);
        NEW.longitude := round(ST_X(v_ponto)::numeric, 6);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ocorrencia_area_risco_rotulo
    BEFORE INSERT ON ocorrencia_infraestrutura
    FOR EACH ROW EXECUTE FUNCTION fn_posicionar_rotulo_area_risco();

-- Rótulos de áreas existentes calculados pela média dos vértices.
UPDATE ocorrencia_infraestrutura
   SET latitude = round(ST_Y(ST_PointOnSurface(area_risco::geometry))::numeric, 6),
       longitude = round(ST_X(ST_PointOnSurface(area_risco::geometry))::numeric, 6)
 WHERE area_risco IS NOT NULL;
