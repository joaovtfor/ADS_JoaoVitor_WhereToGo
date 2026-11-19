-- =============================================================================
-- WhereToGo - Migration 0013: Eventos de desastre e COBRADE
-- -----------------------------------------------------------------------------
-- Etapa 4 do plano de integração (.specs/plano-integracao-defesa-civil.md §4.4).
--
-- O COBRADE (Classificação e Codificação Brasileira de Desastres) classifica o
-- DESASTRE, um por decreto ou operação, e não cada ocorrência: falta de
-- energia, água ou via bloqueada são danos e prejuízos do evento. Por isso o
-- código fica no "evento de desastre" (ex.: "Enchente de novembro/2026",
-- 1.2.1.0.0), que também define o período dos relatórios para o FIDE.
--
-- A tabela `cobrade` traz só os códigos conferidos na tabela oficial (anexo da
-- IN MI 01/2012) e relevantes para abrigamento em Passo Fundo. Um código novo
-- entra com INSERT, depois de conferido na versão vigente.
-- =============================================================================

CREATE TABLE cobrade (
    codigo     VARCHAR(9)   PRIMARY KEY,
    grupo      VARCHAR(40)  NOT NULL,
    descricao  VARCHAR(120) NOT NULL,
    CONSTRAINT cobrade_codigo_ck CHECK (codigo ~ '^[0-9](\.[0-9]){4}$')
);

INSERT INTO cobrade (codigo, grupo, descricao) VALUES
    ('1.1.3.2.1', 'Natural · Geológico',      'Deslizamentos de solo e/ou rocha'),
    ('1.2.1.0.0', 'Natural · Hidrológico',    'Inundações'),
    ('1.2.2.0.0', 'Natural · Hidrológico',    'Enxurradas'),
    ('1.2.3.0.0', 'Natural · Hidrológico',    'Alagamentos'),
    ('1.3.2.1.1', 'Natural · Meteorológico',  'Tempestade local/convectiva: tornados'),
    ('1.3.2.1.2', 'Natural · Meteorológico',  'Tempestade local/convectiva: tempestade de raios'),
    ('1.3.2.1.3', 'Natural · Meteorológico',  'Tempestade local/convectiva: granizo'),
    ('1.3.2.1.4', 'Natural · Meteorológico',  'Tempestade local/convectiva: chuvas intensas'),
    ('1.3.2.1.5', 'Natural · Meteorológico',  'Tempestade local/convectiva: vendaval'),
    ('2.4.1.0.0', 'Tecnológico · Obras civis', 'Colapso de edificações');

-- Evento de desastre (operação): período e classificação dos relatórios.
-- Datas, não horários: o FIDE trabalha por dia (fuso de Brasília).
CREATE TABLE evento_desastre (
    id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                 VARCHAR(150) NOT NULL,
    cobrade              VARCHAR(9)   NOT NULL,
    inicio               DATE         NOT NULL,
    -- Nulo enquanto o evento está em curso (o relatório vai até hoje).
    fim                  DATE,
    -- Nº do decreto municipal de Situação de Emergência / Calamidade, se houver.
    decreto              VARCHAR(120),
    id_usuario_registro  INTEGER      NOT NULL,
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT evento_desastre_cobrade_fk FOREIGN KEY (cobrade) REFERENCES cobrade (codigo),
    CONSTRAINT evento_desastre_usuario_fk FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id),
    CONSTRAINT evento_desastre_periodo_ck CHECK (fim IS NULL OR fim >= inicio),
    -- Relatório de no máximo um ano: acima disso as séries diárias ficam caras e
    -- um evento tão longo deveria virar outro.
    CONSTRAINT evento_desastre_duracao_ck CHECK (fim IS NULL OR fim - inicio <= 366)
);

CREATE INDEX evento_desastre_inicio_ix ON evento_desastre (inicio DESC);

CREATE TRIGGER trg_evento_desastre_atualizado_em
    BEFORE UPDATE ON evento_desastre
    FOR EACH ROW EXECUTE FUNCTION fn_definir_atualizado_em();
