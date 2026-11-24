-- =============================================================================
-- WhereToGo - Migration 0018: Cidade do abrigo (Tarefa 5, fase 1)
-- -----------------------------------------------------------------------------
-- 1. Passo Fundo passa a operar (ativo), com o centro urbano para o mapa.
-- 2. Cada abrigo ganha a cidade (`municipio_ibge`), sempre a de onde ele fica:
--    um gatilho a calcula a partir do ponto em todo INSERT e em toda mudança
--    de latitude/longitude. Ninguém digita a cidade, então ela e o pino nunca
--    discordam. Ponto fora de qualquer município cadastrado é recusado (WTG05).
--
-- Se a cidade de operação for outra (consórcio), quem dá o acesso é o escopo
-- do usuário (fase 4), e a cidade do abrigo continua sendo a geográfica.
-- =============================================================================

UPDATE municipio
   SET ativo = TRUE, latitude = -28.2628, longitude = -52.4067
 WHERE codigo_ibge = '4314100';

-- -----------------------------------------------------------------------------
-- Coluna e preenchimento dos abrigos que já existem. Sem DEFAULT: um abrigo
-- novo nunca cai em Passo Fundo por engano.
--
-- Um abrigo antigo com ponto fora do RS (dado de teste, coordenada trocada)
-- fica com o município mais próximo, para a migration não travar o deploy; o
-- NOTICE lista quais são. Ao corrigir o ponto, o gatilho recalcula a cidade.
-- -----------------------------------------------------------------------------
ALTER TABLE abrigo ADD COLUMN municipio_ibge CHAR(7) REFERENCES municipio (codigo_ibge);

UPDATE abrigo SET municipio_ibge = fn_municipio_do_ponto(latitude, longitude);

DO $$
DECLARE
    fora RECORD;
BEGIN
    FOR fora IN SELECT id, nome, latitude, longitude FROM abrigo WHERE municipio_ibge IS NULL LOOP
        RAISE NOTICE 'Abrigo % (%) em (%, %) fora dos municípios cadastrados: recebeu o mais próximo.',
            fora.id, fora.nome, fora.latitude, fora.longitude;
    END LOOP;
END
$$;

UPDATE abrigo a
   SET municipio_ibge = (
       SELECT m.codigo_ibge
         FROM municipio m
        ORDER BY m.contorno <-> ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography
        LIMIT 1)
 WHERE a.municipio_ibge IS NULL;

ALTER TABLE abrigo ALTER COLUMN municipio_ibge SET NOT NULL;

CREATE INDEX abrigo_municipio_ix ON abrigo (municipio_ibge) WHERE ativo;

-- -----------------------------------------------------------------------------
-- Gatilho: a cidade sai do ponto. Dispara também quando alguém tenta gravar a
-- cidade direto (UPDATE OF municipio_ibge), e devolve a do ponto.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_definir_municipio_abrigo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR (NEW.latitude, NEW.longitude, NEW.municipio_ibge) IS DISTINCT FROM (OLD.latitude, OLD.longitude, OLD.municipio_ibge) THEN
        NEW.municipio_ibge := fn_municipio_do_ponto(NEW.latitude, NEW.longitude);
        IF NEW.municipio_ibge IS NULL THEN
            RAISE EXCEPTION 'O ponto (%, %) não fica em nenhum município cadastrado.', NEW.latitude, NEW.longitude
                USING ERRCODE = 'WTG05';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_abrigo_municipio
    BEFORE INSERT OR UPDATE OF latitude, longitude, municipio_ibge ON abrigo
    FOR EACH ROW EXECUTE FUNCTION fn_definir_municipio_abrigo();
