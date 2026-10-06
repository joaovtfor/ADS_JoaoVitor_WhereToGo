-- =============================================================================
-- WhereToGo - Migration 0003: Dados de referência
-- -----------------------------------------------------------------------------
-- Domínios dos quais o código depende (papéis e status de necessidade) e o
-- catálogo inicial de suprimentos. Idempotente (ON CONFLICT DO NOTHING).
-- O catálogo pode ser ampliado depois pelo ADMIN via API.
-- =============================================================================

INSERT INTO papel_usuario (nome, descricao) VALUES
    ('ADMIN',       'Administrador Geral: visão sistêmica de todos os abrigos, gestão de usuários, catálogo e auditoria.'),
    ('COORDENADOR', 'Coordenador de Abrigo: gerencia dashboard, necessidades, infraestrutura e acolhidos do seu abrigo.'),
    ('VOLUNTARIO',  'Voluntário Local: registra entradas e saídas rápidas de suprimentos (Fast-CRUD) do seu abrigo.')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO status_necessidade (codigo, descricao, nivel_prioridade) VALUES
    ('URGENTE',   'Falta crítica: item destacado no mapa público para doadores.', 1),
    ('NORMAL',    'Estoque em nível adequado ou estável.', 2),
    ('BLOQUEADO', 'Abrigo saturado: doações deste item não devem ser direcionadas a este abrigo.', 3)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO categoria_item (nome_macro, slug) VALUES
    ('Água',                 'agua'),
    ('Alimentos',            'alimentos'),
    ('Higiene e Limpeza',    'higiene'),
    ('Medicamentos e Saúde', 'medicamentos'),
    ('Roupas e Calçados',    'roupas'),
    ('Cama e Banho',         'cama-e-banho'),
    ('Itens Infantis',       'infantil'),
    ('Itens para Animais',   'animais')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO item (id_categoria, nome_micro, unidade_medida)
SELECT c.id, v.nome_micro, v.unidade_medida
  FROM (VALUES
        ('agua',         'Água Mineral 500 ml',          'garrafa'),
        ('agua',         'Água Mineral 1,5 L',           'garrafa'),
        ('agua',         'Água Potável 5 L',             'galão'),
        ('alimentos',    'Cesta Básica',                 'unidade'),
        ('alimentos',    'Arroz 5 kg',                   'pacote'),
        ('alimentos',    'Feijão 1 kg',                  'pacote'),
        ('alimentos',    'Leite Longa Vida 1 L',         'caixa'),
        ('alimentos',    'Refeição Pronta (Marmita)',    'unidade'),
        ('higiene',      'Kit Higiene Pessoal',          'kit'),
        ('higiene',      'Sabonete',                     'unidade'),
        ('higiene',      'Papel Higiênico',              'rolo'),
        ('higiene',      'Absorvente Higiênico',         'pacote'),
        ('higiene',      'Kit Limpeza',                  'kit'),
        ('medicamentos', 'Kit Primeiros Socorros',       'kit'),
        ('medicamentos', 'Analgésico/Antitérmico',       'caixa'),
        ('medicamentos', 'Soro de Reidratação Oral',     'sachê'),
        ('roupas',       'Roupa Adulto',                 'peça'),
        ('roupas',       'Roupa Infantil',               'peça'),
        ('roupas',       'Roupa Íntima',                 'peça'),
        ('roupas',       'Calçado',                      'par'),
        ('cama-e-banho', 'Cobertor',                     'unidade'),
        ('cama-e-banho', 'Colchão',                      'unidade'),
        ('cama-e-banho', 'Travesseiro',                  'unidade'),
        ('cama-e-banho', 'Toalha de Banho',              'unidade'),
        ('infantil',     'Fralda Infantil',              'pacote'),
        ('infantil',     'Leite em Pó Infantil',         'lata'),
        ('animais',      'Ração para Cães',              'kg'),
        ('animais',      'Ração para Gatos',             'kg')
       ) AS v (slug, nome_micro, unidade_medida)
  JOIN categoria_item c ON c.slug = v.slug
 ORDER BY c.id, v.nome_micro -- ids determinísticos entre ambientes
ON CONFLICT DO NOTHING;
