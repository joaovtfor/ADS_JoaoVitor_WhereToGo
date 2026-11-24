-- =============================================================================
-- WhereToGo - Migration 0016: Municípios (Tarefa 5, fase 1)
-- -----------------------------------------------------------------------------
-- Base para operar mais de uma cidade (.specs/plano-tarefas-pendentes.md,
-- Tarefa 5). Esta migration só cria a tabela e a busca por ponto; os dados do
-- RS vêm na 0017 (gerada do IBGE) e a ligação com os abrigos na 0018.
--
-- A tabela guarda todos os municípios das UFs atendidas, não só os que operam
-- no WhereToGo (`ativo`). Os demais servem para dizer de que cidade é um
-- ponto (o cadastro de abrigo hoje; o GPS do mapa público numa fase futura) e
-- para nomear a cidade numa mensagem ("fica em Marau/RS").
-- =============================================================================

CREATE TABLE municipio (
    codigo_ibge   CHAR(7)                       PRIMARY KEY,
    nome          VARCHAR(120)                  NOT NULL,
    uf            CHAR(2)                       NOT NULL,
    -- Endereço público futuro (/rs/passo-fundo). Único só dentro da UF: há
    -- "Bom Jesus" em cinco estados.
    slug          VARCHAR(80)                   NOT NULL,
    -- Regional da Defesa Civil (ex.: "CREPDEC 7 - Planalto"), para a visão estadual.
    regional      VARCHAR(60),
    -- Malha municipal do IBGE, simplificada (~11 m de precisão).
    contorno      GEOGRAPHY(MULTIPOLYGON, 4326) NOT NULL,
    -- Ponto para enquadrar a cidade no mapa (o centro urbano, nas cidades ativas).
    latitude      DOUBLE PRECISION              NOT NULL,
    longitude     DOUBLE PRECISION              NOT NULL,
    zoom_inicial  SMALLINT                      NOT NULL DEFAULT 13,
    -- Tem operação no WhereToGo: abrigos podem ser cadastrados aqui.
    ativo         BOOLEAN                       NOT NULL DEFAULT FALSE,
    CONSTRAINT municipio_ibge_ck CHECK (codigo_ibge ~ '^[0-9]{7}$'),
    CONSTRAINT municipio_uf_ck CHECK (uf ~ '^[A-Z]{2}$'),
    CONSTRAINT municipio_slug_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT municipio_nome_ck CHECK (length(btrim(nome)) > 0),
    CONSTRAINT municipio_latitude_ck CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT municipio_longitude_ck CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT municipio_zoom_ck CHECK (zoom_inicial BETWEEN 3 AND 18),
    CONSTRAINT municipio_slug_uk UNIQUE (uf, slug)
);

CREATE INDEX municipio_contorno_gix ON municipio USING GIST (contorno);
CREATE INDEX municipio_ativo_ix ON municipio (ativo) WHERE ativo;

-- -----------------------------------------------------------------------------
-- Município de um ponto (latitude, longitude) ou NULL.
--
-- 1. O contorno que cobre o ponto (ST_Covers: a divisa conta como dentro).
-- 2. Senão, o contorno mais próximo a até 2 km. O contorno simplificado pode
--    deixar frestas entre vizinhos e cortar curvas de rio da divisa; 2 km cobre
--    isso com folga sem levar um ponto de outra UF para dentro do RS.
-- Empate (ponto exatamente na divisa): fica o município ativo, depois o menor código.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_municipio_do_ponto(p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION)
RETURNS CHAR(7)
LANGUAGE sql
STABLE
AS $$
    WITH ponto AS (
        SELECT ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography AS g
    )
    SELECT COALESCE(
        (SELECT m.codigo_ibge
           FROM municipio m, ponto
          WHERE ST_Covers(m.contorno, ponto.g)
          ORDER BY m.ativo DESC, m.codigo_ibge
          LIMIT 1),
        (SELECT m.codigo_ibge
           FROM municipio m, ponto
          WHERE ST_DWithin(m.contorno, ponto.g, 2000)
          ORDER BY ST_Distance(m.contorno, ponto.g), m.ativo DESC, m.codigo_ibge
          LIMIT 1)
    );
$$;
