-- =============================================================================
-- WhereToGo - Migration 0011: Avisos oficiais (INMET)
-- -----------------------------------------------------------------------------
-- Avisos meteorológicos do INMET que incluem o município (Passo Fundo/RS por
-- padrão), lidos de https://apiprevmet3.inmet.gov.br/avisos/ativos.
--
-- Ficam numa tabela própria, e não em `ocorrencia_infraestrutura`: cada aviso
-- cobre centenas ou milhares de municípios. Como AREA_RISCO, ele marcaria todos
-- os abrigos e todas as rotas da cidade como "em risco" em qualquer dia de
-- tempestade (ver .specs/plano-integracao-defesa-civil.md, seção 2.1).
--
-- O polígono não é guardado: o filtro é pelo código IBGE e o contorno
-- continental não serve ao mapa.
-- =============================================================================

CREATE TABLE aviso_oficial (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fonte              VARCHAR(20)  NOT NULL,
    -- Identificador estável do aviso na fonte (INMET: id_aviso). Atualizações
    -- do mesmo aviso chegam com o mesmo id e uma sequência maior.
    id_externo         VARCHAR(40)  NOT NULL,
    sequencia          INTEGER      NOT NULL DEFAULT 1,
    -- Identificador CAP 1.2 (urn:oid:...), para referência cruzada com o XML oficial.
    identificador_cap  VARCHAR(120) NOT NULL,
    evento             VARCHAR(80)  NOT NULL,
    -- Escala CAP: Moderate / Severe / Extreme.
    severidade         VARCHAR(10)  NOT NULL,
    -- Texto original da fonte (ex.: "Perigo Potencial"), exibido ao usuário.
    rotulo_severidade  VARCHAR(40)  NOT NULL,
    cor                VARCHAR(7),
    inicio             TIMESTAMPTZ  NOT NULL,
    fim                TIMESTAMPTZ  NOT NULL,
    riscos             TEXT[]       NOT NULL DEFAULT '{}',
    instrucoes         TEXT[]       NOT NULL DEFAULT '{}',
    link               VARCHAR(300),
    recebido_em        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Preenchido quando a fonte retira o aviso antes do fim previsto.
    encerrado_em       TIMESTAMPTZ,
    CONSTRAINT aviso_oficial_externo_uk UNIQUE (fonte, id_externo),
    CONSTRAINT aviso_oficial_fonte_ck CHECK (fonte IN ('INMET')),
    CONSTRAINT aviso_oficial_severidade_ck CHECK (severidade IN ('MODERADA', 'SEVERA', 'EXTREMA')),
    CONSTRAINT aviso_oficial_periodo_ck CHECK (fim > inicio),
    CONSTRAINT aviso_oficial_cor_ck CHECK (cor IS NULL OR cor ~ '^#[0-9A-Fa-f]{6}$')
);

-- Avisos vigentes ou futuros (a consulta pública filtra por fim > now()).
CREATE INDEX aviso_oficial_vigente_ix ON aviso_oficial (fim) WHERE encerrado_em IS NULL;

-- Estado de cada integração externa: quando foi consultada, se está falhando e
-- até quando está em pausa (circuit breaker). Uma linha por fonte.
CREATE TABLE integracao_estado (
    fonte                VARCHAR(20)  PRIMARY KEY,
    ultima_tentativa     TIMESTAMPTZ,
    ultimo_sucesso       TIMESTAMPTZ,
    falhas_consecutivas  INTEGER      NOT NULL DEFAULT 0,
    pausada_ate          TIMESTAMPTZ,
    ultimo_erro          VARCHAR(500),
    CONSTRAINT integracao_estado_fonte_ck CHECK (fonte IN ('INMET')),
    CONSTRAINT integracao_estado_falhas_ck CHECK (falhas_consecutivas >= 0)
);

INSERT INTO integracao_estado (fonte) VALUES ('INMET');
