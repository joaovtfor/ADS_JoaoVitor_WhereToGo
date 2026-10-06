-- =============================================================================
-- WhereToGo - Migration 0001: Schema inicial (DER v2 revisado)
-- -----------------------------------------------------------------------------
-- Baseado no DER do draw.io (DER_WhereToGo.drawio), com as correções descritas
-- em .specs/context/04-database-model.md (seção "Correções aplicadas ao DER").
-- Convenções:
--   * Tabelas e colunas em snake_case, no singular (igual ao DER).
--   * PKs com IDENTITY; tabelas de alto volume (logs/movimentações) em BIGINT.
--   * Constraints nomeadas (<tabela>_<coluna>_<tipo>) para que a API traduza
--     violações em mensagens de negócio.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- Gestão de acessos (RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE papel_usuario (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(30)  NOT NULL,
    descricao   VARCHAR(255),
    CONSTRAINT papel_usuario_nome_uk UNIQUE (nome),
    CONSTRAINT papel_usuario_nome_ck CHECK (nome ~ '^[A-Z_]+$')
);

-- -----------------------------------------------------------------------------
-- Abrigos
-- -----------------------------------------------------------------------------
CREATE TABLE abrigo (
    id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                  VARCHAR(150)     NOT NULL,
    endereco              VARCHAR(255)     NOT NULL,
    telefone              VARCHAR(20),
    chave_pix             VARCHAR(140),
    titular_pix           VARCHAR(150),
    latitude              DOUBLE PRECISION NOT NULL,
    longitude             DOUBLE PRECISION NOT NULL,
    -- Ponto geográfico derivado de latitude/longitude (PostGIS) para consultas
    -- de proximidade (RF08) com índice espacial GiST.
    localizacao           GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
                              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                          ) STORED,
    capacidade_maxima     INTEGER          NOT NULL,
    -- Cache mantido por trigger a partir de ABRIGADO (status PRESENTE).
    lotacao_atual         INTEGER          NOT NULL DEFAULT 0,
    -- Resumo mantido por trigger a partir de OCORRENCIA_INFRAESTRUTURA ativas.
    status_infraestrutura VARCHAR(10)      NOT NULL DEFAULT 'NORMAL',
    ativo                 BOOLEAN          NOT NULL DEFAULT TRUE,
    criado_em             TIMESTAMPTZ      NOT NULL DEFAULT now(),
    atualizado_em         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT abrigo_nome_ck       CHECK (length(btrim(nome)) > 0),
    CONSTRAINT abrigo_endereco_ck   CHECK (length(btrim(endereco)) > 0),
    CONSTRAINT abrigo_latitude_ck   CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT abrigo_longitude_ck  CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT abrigo_capacidade_ck CHECK (capacidade_maxima > 0),
    CONSTRAINT abrigo_lotacao_ck    CHECK (lotacao_atual >= 0),
    CONSTRAINT abrigo_status_infraestrutura_ck
        CHECK (status_infraestrutura IN ('NORMAL', 'ALERTA', 'CRITICO')),
    CONSTRAINT abrigo_pix_ck        CHECK ((chave_pix IS NULL) = (titular_pix IS NULL))
);

CREATE INDEX abrigo_localizacao_gix ON abrigo USING GIST (localizacao);
CREATE INDEX abrigo_ativo_ix ON abrigo (ativo);

-- -----------------------------------------------------------------------------
-- Usuários da equipe interna
-- -----------------------------------------------------------------------------
CREATE TABLE usuario (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_papel      INTEGER      NOT NULL,
    id_abrigo     INTEGER,
    nome          VARCHAR(150) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    senha_hash    VARCHAR(255) NOT NULL,
    ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT usuario_papel_fk  FOREIGN KEY (id_papel)  REFERENCES papel_usuario (id),
    CONSTRAINT usuario_abrigo_fk FOREIGN KEY (id_abrigo) REFERENCES abrigo (id),
    CONSTRAINT usuario_email_uk  UNIQUE (email),
    -- E-mail sempre normalizado (minúsculas, sem espaços) para unicidade real.
    CONSTRAINT usuario_email_ck  CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
    CONSTRAINT usuario_nome_ck   CHECK (length(btrim(nome)) > 0)
);

CREATE INDEX usuario_id_papel_ix  ON usuario (id_papel);
CREATE INDEX usuario_id_abrigo_ix ON usuario (id_abrigo);

-- -----------------------------------------------------------------------------
-- Catálogo de itens (categoria macro -> item micro)
-- -----------------------------------------------------------------------------
CREATE TABLE categoria_item (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_macro VARCHAR(60) NOT NULL,
    -- Identificador estável usado pelos filtros/ícones do mapa público (RF08).
    slug       VARCHAR(40) NOT NULL,
    CONSTRAINT categoria_item_slug_uk UNIQUE (slug),
    CONSTRAINT categoria_item_slug_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT categoria_item_nome_ck CHECK (length(btrim(nome_macro)) > 0)
);

CREATE UNIQUE INDEX categoria_item_nome_uk ON categoria_item (lower(nome_macro));

CREATE TABLE item (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_categoria   INTEGER      NOT NULL,
    nome_micro     VARCHAR(100) NOT NULL,
    unidade_medida VARCHAR(20)  NOT NULL,
    ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT item_categoria_fk FOREIGN KEY (id_categoria) REFERENCES categoria_item (id),
    CONSTRAINT item_nome_ck      CHECK (length(btrim(nome_micro)) > 0),
    CONSTRAINT item_unidade_ck   CHECK (length(btrim(unidade_medida)) > 0)
);

CREATE UNIQUE INDEX item_nome_uk ON item (lower(nome_micro));
CREATE INDEX item_id_categoria_ix ON item (id_categoria);

-- -----------------------------------------------------------------------------
-- Necessidades e estoque
-- -----------------------------------------------------------------------------
CREATE TABLE status_necessidade (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Código estável usado pelas regras de negócio (URGENTE/NORMAL/BLOQUEADO).
    codigo           VARCHAR(20)  NOT NULL,
    descricao        VARCHAR(255) NOT NULL,
    -- 1 = maior prioridade (mesma convenção de priorização do DVP).
    nivel_prioridade SMALLINT     NOT NULL,
    CONSTRAINT status_necessidade_codigo_uk     UNIQUE (codigo),
    CONSTRAINT status_necessidade_prioridade_uk UNIQUE (nivel_prioridade),
    CONSTRAINT status_necessidade_codigo_ck     CHECK (codigo ~ '^[A-Z_]+$'),
    CONSTRAINT status_necessidade_prioridade_ck CHECK (nivel_prioridade > 0)
);

CREATE TABLE estoque_abrigo (
    id_abrigo             INTEGER     NOT NULL,
    id_item               INTEGER     NOT NULL,
    id_status_necessidade INTEGER     NOT NULL,
    -- Saldo atual. Alterado SOMENTE via MOVIMENTACAO_ESTOQUE (trigger), o que
    -- garante: quantidade = soma das movimentações do par (abrigo, item).
    quantidade            INTEGER     NOT NULL DEFAULT 0,
    -- Limite mínimo para o alerta de estoque crítico do dashboard (RF04).
    quantidade_minima     INTEGER     NOT NULL DEFAULT 0,
    atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT estoque_abrigo_pk        PRIMARY KEY (id_abrigo, id_item),
    CONSTRAINT estoque_abrigo_abrigo_fk FOREIGN KEY (id_abrigo) REFERENCES abrigo (id),
    CONSTRAINT estoque_abrigo_item_fk   FOREIGN KEY (id_item) REFERENCES item (id),
    CONSTRAINT estoque_abrigo_status_fk FOREIGN KEY (id_status_necessidade) REFERENCES status_necessidade (id),
    CONSTRAINT estoque_abrigo_quantidade_ck        CHECK (quantidade >= 0),
    CONSTRAINT estoque_abrigo_quantidade_minima_ck CHECK (quantidade_minima >= 0)
);

CREATE INDEX estoque_abrigo_id_item_ix ON estoque_abrigo (id_item);
CREATE INDEX estoque_abrigo_status_ix  ON estoque_abrigo (id_status_necessidade);

-- Histórico transacional (livro-razão) do estoque. Append-only.
CREATE TABLE movimentacao_estoque (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_abrigo             INTEGER     NOT NULL,
    id_item               INTEGER     NOT NULL,
    id_usuario            INTEGER     NOT NULL,
    -- Abrigo do outro lado de uma transferência de itens (origem/destino).
    id_abrigo_contraparte INTEGER,
    tipo_movimentacao     VARCHAR(25) NOT NULL,
    -- Quantidade COM SINAL: positiva = entrada, negativa = saída.
    quantidade            INTEGER     NOT NULL,
    -- Saldo do item no abrigo logo após esta movimentação (preenchido por trigger).
    quantidade_resultante INTEGER     NOT NULL,
    data_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
    observacao            VARCHAR(500),
    CONSTRAINT movimentacao_estoque_abrigo_fk      FOREIGN KEY (id_abrigo) REFERENCES abrigo (id),
    CONSTRAINT movimentacao_estoque_item_fk        FOREIGN KEY (id_item) REFERENCES item (id),
    CONSTRAINT movimentacao_estoque_usuario_fk     FOREIGN KEY (id_usuario) REFERENCES usuario (id),
    CONSTRAINT movimentacao_estoque_contraparte_fk FOREIGN KEY (id_abrigo_contraparte) REFERENCES abrigo (id),
    CONSTRAINT movimentacao_estoque_tipo_ck CHECK (tipo_movimentacao IN (
        'ENTRADA_DOACAO', 'SAIDA_CONSUMO', 'PERDA',
        'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA', 'AJUSTE'
    )),
    -- O sinal da quantidade precisa ser coerente com o tipo da movimentação.
    CONSTRAINT movimentacao_estoque_quantidade_ck CHECK (
        quantidade <> 0 AND CASE
            WHEN tipo_movimentacao IN ('ENTRADA_DOACAO', 'TRANSFERENCIA_ENTRADA') THEN quantidade > 0
            WHEN tipo_movimentacao IN ('SAIDA_CONSUMO', 'PERDA', 'TRANSFERENCIA_SAIDA') THEN quantidade < 0
            ELSE TRUE -- AJUSTE (inventário físico) pode ser positivo ou negativo
        END
    ),
    CONSTRAINT movimentacao_estoque_resultante_ck CHECK (quantidade_resultante >= 0),
    CONSTRAINT movimentacao_estoque_contraparte_ck CHECK (
        (tipo_movimentacao IN ('TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA')) = (id_abrigo_contraparte IS NOT NULL)
        AND id_abrigo_contraparte IS DISTINCT FROM id_abrigo
    )
);

CREATE INDEX movimentacao_estoque_abrigo_item_ix ON movimentacao_estoque (id_abrigo, id_item, data_hora DESC);
CREATE INDEX movimentacao_estoque_abrigo_data_ix ON movimentacao_estoque (id_abrigo, data_hora DESC);
CREATE INDEX movimentacao_estoque_usuario_ix     ON movimentacao_estoque (id_usuario);

-- -----------------------------------------------------------------------------
-- Acolhidos (abrigados) e histórico de transferências
-- -----------------------------------------------------------------------------
CREATE TABLE abrigado (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_abrigo_atual    INTEGER      NOT NULL,
    nome_completo      VARCHAR(150) NOT NULL,
    -- Somente dígitos. Opcional: documentos podem ter sido perdidos no desastre.
    cpf                VARCHAR(11),
    data_nascimento    DATE,
    data_entrada       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    data_saida         TIMESTAMPTZ,
    status_acolhimento VARCHAR(15)  NOT NULL DEFAULT 'PRESENTE',
    criado_em          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT abrigado_abrigo_fk FOREIGN KEY (id_abrigo_atual) REFERENCES abrigo (id),
    CONSTRAINT abrigado_cpf_uk    UNIQUE (cpf),
    CONSTRAINT abrigado_cpf_ck    CHECK (cpf ~ '^[0-9]{11}$'),
    CONSTRAINT abrigado_nome_ck   CHECK (length(btrim(nome_completo)) > 0),
    CONSTRAINT abrigado_status_ck CHECK (status_acolhimento IN ('PRESENTE', 'DESLIGADO')),
    CONSTRAINT abrigado_saida_ck  CHECK (
        (status_acolhimento = 'DESLIGADO') = (data_saida IS NOT NULL)
        AND (data_saida IS NULL OR data_saida >= data_entrada)
    )
);

CREATE INDEX abrigado_abrigo_status_ix ON abrigado (id_abrigo_atual, status_acolhimento);

-- Histórico de transferências entre abrigos. Append-only.
CREATE TABLE transferencia_abrigado (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_abrigado        INTEGER      NOT NULL,
    id_abrigo_origem   INTEGER      NOT NULL,
    id_abrigo_destino  INTEGER      NOT NULL,
    id_usuario         INTEGER      NOT NULL,
    data_transferencia TIMESTAMPTZ  NOT NULL DEFAULT now(),
    motivo             VARCHAR(500) NOT NULL,
    CONSTRAINT transferencia_abrigado_abrigado_fk FOREIGN KEY (id_abrigado) REFERENCES abrigado (id),
    CONSTRAINT transferencia_abrigado_origem_fk   FOREIGN KEY (id_abrigo_origem) REFERENCES abrigo (id),
    CONSTRAINT transferencia_abrigado_destino_fk  FOREIGN KEY (id_abrigo_destino) REFERENCES abrigo (id),
    CONSTRAINT transferencia_abrigado_usuario_fk  FOREIGN KEY (id_usuario) REFERENCES usuario (id),
    CONSTRAINT transferencia_abrigado_abrigos_ck  CHECK (id_abrigo_origem <> id_abrigo_destino),
    CONSTRAINT transferencia_abrigado_motivo_ck   CHECK (length(btrim(motivo)) > 0)
);

CREATE INDEX transferencia_abrigado_abrigado_ix ON transferencia_abrigado (id_abrigado, data_transferencia DESC);
CREATE INDEX transferencia_abrigado_origem_ix   ON transferencia_abrigado (id_abrigo_origem);
CREATE INDEX transferencia_abrigado_destino_ix  ON transferencia_abrigado (id_abrigo_destino);

-- -----------------------------------------------------------------------------
-- Ocorrências de infraestrutura (RF05 / RF09) - entidade adicionada ao DER
-- -----------------------------------------------------------------------------
CREATE TABLE ocorrencia_infraestrutura (
    id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_abrigo            INTEGER      NOT NULL,
    id_usuario_registro  INTEGER      NOT NULL,
    id_usuario_resolucao INTEGER,
    tipo                 VARCHAR(25)  NOT NULL,
    gravidade            VARCHAR(10)  NOT NULL,
    descricao            VARCHAR(500),
    -- Local exato do problema (ex.: ponto da via colapsada). Nulo = local do abrigo.
    latitude             DOUBLE PRECISION,
    longitude            DOUBLE PRECISION,
    data_registro        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    data_resolucao       TIMESTAMPTZ,
    CONSTRAINT ocorrencia_infraestrutura_abrigo_fk    FOREIGN KEY (id_abrigo) REFERENCES abrigo (id),
    CONSTRAINT ocorrencia_infraestrutura_registro_fk  FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id),
    CONSTRAINT ocorrencia_infraestrutura_resolucao_fk FOREIGN KEY (id_usuario_resolucao) REFERENCES usuario (id),
    CONSTRAINT ocorrencia_infraestrutura_tipo_ck CHECK (tipo IN (
        'SEM_ENERGIA', 'SEM_AGUA', 'SEM_COMUNICACAO', 'VIA_BLOQUEADA',
        'ALAGAMENTO', 'DESLIZAMENTO', 'RISCO_ESTRUTURAL', 'OUTRO'
    )),
    CONSTRAINT ocorrencia_infraestrutura_gravidade_ck CHECK (gravidade IN ('ALERTA', 'CRITICO')),
    CONSTRAINT ocorrencia_infraestrutura_coordenadas_ck CHECK (
        (latitude IS NULL) = (longitude IS NULL)
        AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
        AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    ),
    CONSTRAINT ocorrencia_infraestrutura_resolucao_ck CHECK (
        (data_resolucao IS NULL) = (id_usuario_resolucao IS NULL)
        AND (data_resolucao IS NULL OR data_resolucao >= data_registro)
    )
);

-- No máximo uma ocorrência ATIVA de cada tipo por abrigo (exceto OUTRO).
CREATE UNIQUE INDEX ocorrencia_infraestrutura_ativa_uk
    ON ocorrencia_infraestrutura (id_abrigo, tipo)
    WHERE data_resolucao IS NULL AND tipo <> 'OUTRO';
CREATE INDEX ocorrencia_infraestrutura_abrigo_ix ON ocorrencia_infraestrutura (id_abrigo, data_registro DESC);
CREATE INDEX ocorrencia_infraestrutura_ativas_ix ON ocorrencia_infraestrutura (id_abrigo) WHERE data_resolucao IS NULL;

-- -----------------------------------------------------------------------------
-- Auditoria geral (RNF03). Append-only.
-- -----------------------------------------------------------------------------
CREATE TABLE log_auditoria (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Nulo apenas para eventos anônimos de segurança (ex.: login com e-mail inexistente).
    id_usuario  INTEGER,
    id_abrigo   INTEGER,
    -- Código da ação (ex.: ESTOQUE_MOVIMENTADO, LOGIN_FALHA).
    acao        VARCHAR(60)  NOT NULL,
    -- Descrição legível (ex.: "+1 Água Potável 5 L").
    descricao   VARCHAR(500) NOT NULL,
    -- Dados estruturados do evento (ids, valores antes/depois).
    detalhes    JSONB,
    data_hora   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    endereco_ip VARCHAR(45),
    CONSTRAINT log_auditoria_usuario_fk FOREIGN KEY (id_usuario) REFERENCES usuario (id),
    CONSTRAINT log_auditoria_abrigo_fk  FOREIGN KEY (id_abrigo) REFERENCES abrigo (id),
    CONSTRAINT log_auditoria_acao_ck    CHECK (acao ~ '^[A-Z_]+$')
);

CREATE INDEX log_auditoria_data_ix    ON log_auditoria (data_hora DESC);
CREATE INDEX log_auditoria_usuario_ix ON log_auditoria (id_usuario, data_hora DESC);
CREATE INDEX log_auditoria_abrigo_ix  ON log_auditoria (id_abrigo, data_hora DESC);
CREATE INDEX log_auditoria_acao_ix    ON log_auditoria (acao, data_hora DESC);
