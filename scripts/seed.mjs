// =============================================================================
// Seed de DESENVOLVIMENTO: abrigos de Passo Fundo/RS, usuários de cada perfil,
// estoque (via movimentações), necessidades, abrigados, ocorrências e uma
// transferência. Todos os dados são fictícios. Idempotente: pode rodar de novo.
//
// Uso: node scripts/seed.mjs   (requer as migrations aplicadas)
// =============================================================================
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { carregarEnvLocal } from './migrate.mjs';

const ABRIGOS = [
  {
    chave: 'central',
    nome: 'Abrigo Central UPF',
    endereco: 'Campus I - BR-285, Bairro São José, Passo Fundo/RS',
    telefone: '(54) 99999-0001',
    chavePix: 'pix.central@wheretogo.local',
    titularPix: 'Abrigo Central UPF (dados fictícios)',
    latitude: -28.2346,
    longitude: -52.3809,
    capacidade: 300,
  },
  {
    chave: 'centro',
    nome: 'Ginásio Poliesportivo do Centro',
    endereco: 'Rua Fictícia, 100 - Centro, Passo Fundo/RS',
    telefone: '(54) 99999-0002',
    chavePix: 'pix.centro@wheretogo.local',
    titularPix: 'Associação Ginásio do Centro (dados fictícios)',
    latitude: -28.262,
    longitude: -52.4083,
    capacidade: 150,
  },
  {
    chave: 'boqueirao',
    nome: 'Escola Estadual Bairro Boqueirão',
    endereco: 'Avenida Exemplo, 500 - Boqueirão, Passo Fundo/RS',
    telefone: '(54) 99999-0003',
    chavePix: null,
    titularPix: null,
    latitude: -28.2486,
    longitude: -52.423,
    capacidade: 80,
  },
  {
    chave: 'saocristovao',
    nome: 'Centro Comunitário São Cristóvão',
    endereco: 'Rua Modelo, 42 - São Cristóvão, Passo Fundo/RS',
    telefone: null,
    chavePix: 'pix.saocristovao@wheretogo.local',
    titularPix: 'Centro Comunitário São Cristóvão (dados fictícios)',
    latitude: -28.2795,
    longitude: -52.387,
    capacidade: 12,
  },
];

const USUARIOS = [
  { email: 'admin@wheretogo.local', nome: 'Administração Geral', papel: 'ADMIN', abrigo: null },
  { email: 'coordenador@wheretogo.local', nome: 'Coordenação - Abrigo Central UPF', papel: 'COORDENADOR', abrigo: 'central' },
  { email: 'voluntario@wheretogo.local', nome: 'Voluntário - Abrigo Central UPF', papel: 'VOLUNTARIO', abrigo: 'central' },
  { email: 'coordenador.centro@wheretogo.local', nome: 'Coordenação - Ginásio do Centro', papel: 'COORDENADOR', abrigo: 'centro' },
  { email: 'voluntario.centro@wheretogo.local', nome: 'Voluntário - Ginásio do Centro', papel: 'VOLUNTARIO', abrigo: 'centro' },
  { email: 'coordenador.boqueirao@wheretogo.local', nome: 'Coordenação - Escola Boqueirão', papel: 'COORDENADOR', abrigo: 'boqueirao' },
  { email: 'coordenador.saocristovao@wheretogo.local', nome: 'Coordenação - São Cristóvão', papel: 'COORDENADOR', abrigo: 'saocristovao' },
];

// [item, quantidade inicial, estoque mínimo, status]
const ESTOQUE = {
  central: [
    ['Água Potável 5 L', 12, 50, 'URGENTE'],
    ['Água Mineral 500 ml', 240, 100, 'NORMAL'],
    ['Cesta Básica', 35, 20, 'NORMAL'],
    ['Cobertor', 400, 50, 'BLOQUEADO'],
    ['Colchão', 15, 40, 'NORMAL'],
    ['Kit Higiene Pessoal', 60, 30, 'NORMAL'],
    ['Fralda Infantil', 4, 20, 'URGENTE'],
    ['Ração para Cães', 30, 10, 'NORMAL'],
  ],
  centro: [
    ['Água Mineral 1,5 L', 80, 40, 'NORMAL'],
    ['Cesta Básica', 10, 15, 'NORMAL'],
    ['Roupa Adulto', 500, 0, 'BLOQUEADO'],
    ['Kit Primeiros Socorros', 2, 10, 'URGENTE'],
    ['Leite em Pó Infantil', 0, 10, 'URGENTE'],
  ],
  boqueirao: [
    ['Água Potável 5 L', 5, 30, 'URGENTE'],
    ['Arroz 5 kg', 40, 10, 'NORMAL'],
    ['Cobertor', 20, 30, 'NORMAL'],
    ['Absorvente Higiênico', 0, 10, 'URGENTE'],
  ],
  saocristovao: [
    ['Kit Limpeza', 15, 5, 'NORMAL'],
    ['Sabonete', 100, 20, 'NORMAL'],
    ['Calçado', 150, 0, 'BLOQUEADO'],
    ['Toalha de Banho', 3, 15, 'URGENTE'],
  ],
};

// [nome, base de 9 dígitos do CPF (dígitos verificadores calculados) ou null, nascimento]
const ABRIGADOS = {
  central: [
    ['Ana Paula Ferreira', '123456780', '1985-03-12'],
    ['Bruno Henrique Souza', '234567891', '1979-11-02'],
    ['Carla Regina Lopes', null, '1992-07-25'],
    ['Daniel Augusto Ramos', '345678912', '2010-01-30'],
    ['Eduarda Martins Costa', null, null],
    ['Fábio Lima Andrade', '456789123', '1968-05-17'],
    ['Gabriela Rocha Pinto', '567891234', '2015-09-09'],
    ['Heitor Alves Nunes', null, '1950-12-01'],
  ],
  centro: [
    ['Isabela Moraes Teixeira', '678912345', '1988-04-04'],
    ['João Pedro Cardoso', null, '2001-06-21'],
    ['Karina Duarte Silva', '789123456', '1995-02-14'],
    ['Lucas Gabriel Fontes', null, null],
    ['Marina Albuquerque Reis', '891234567', '1973-08-30'],
  ],
  boqueirao: [
    ['Nelson Pereira Barros', '912345678', '1960-10-10'],
    ['Olívia Campos Machado', null, '2018-03-03'],
    ['Paulo Roberto Vieira', '135792468', '1982-12-24'],
  ],
  saocristovao: [
    ['Quitéria Santos Melo', '246813579', '1957-01-15'],
    ['Rafael Cunha Azevedo', null, '1999-05-05'],
  ],
};

const OCORRENCIAS = {
  centro: [['SEM_ENERGIA', 'ALERTA', 'Queda de energia desde as 14h; gerador atende apenas a cozinha.', null, null]],
  boqueirao: [
    ['VIA_BLOQUEADA', 'CRITICO', 'Ponte de acesso pela avenida principal interditada. Use o acesso pela rua lateral.', [-28.2471, -52.4252], null],
    [
      'AREA_RISCO',
      'CRITICO',
      'Perímetro interditado por alagamento severo e risco de solapamento de margem. Não transite nesta área.',
      [-28.2512, -52.4195],
      [
        { lat: -28.2495, lng: -52.4215 },
        { lat: -28.2498, lng: -52.4168 },
        { lat: -28.2532, lng: -52.4172 },
        { lat: -28.2528, lng: -52.4222 },
      ],
    ],
  ],
};

/** Completa uma base de 9 dígitos com os dígitos verificadores do CPF. */
function gerarCpf(base) {
  const digitos = base.split('').map(Number);
  for (const tamanho of [9, 10]) {
    const soma = digitos.slice(0, tamanho).reduce((acc, d, i) => acc + d * (tamanho + 1 - i), 0);
    const resto = (soma * 10) % 11;
    digitos.push(resto === 10 ? 0 : resto);
  }
  return digitos.join('');
}

/**
 * @param {{ connectionString: string, senha: string, log?: (msg: string) => void }} opcoes
 */
export async function executarSeed({ connectionString, senha, log = console.log }) {
  const client = new pg.Client({ connectionString, application_name: 'wheretogo-seed' });
  await client.connect();

  try {
    await client.query('BEGIN');

    // --- Abrigos -------------------------------------------------------------
    const idsAbrigo = {};
    for (const a of ABRIGOS) {
      const existente = await client.query('SELECT id FROM abrigo WHERE nome = $1', [a.nome]);
      if (existente.rows[0]) {
        idsAbrigo[a.chave] = existente.rows[0].id;
        continue;
      }
      const { rows } = await client.query(
        `INSERT INTO abrigo (nome, endereco, telefone, chave_pix, titular_pix, latitude, longitude, capacidade_maxima)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [a.nome, a.endereco, a.telefone, a.chavePix, a.titularPix, a.latitude, a.longitude, a.capacidade],
      );
      idsAbrigo[a.chave] = rows[0].id;
    }
    log(`[seed] ${ABRIGOS.length} abrigos prontos.`);

    // --- Usuários (senha redefinida para a padrão a cada execução) ------------
    const senhaHash = await bcrypt.hash(senha, 12);
    const idsUsuario = {};
    for (const u of USUARIOS) {
      const { rows } = await client.query(
        `INSERT INTO usuario (id_papel, id_abrigo, nome, email, senha_hash)
         VALUES ((SELECT id FROM papel_usuario WHERE nome = $1), $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
            SET id_papel = EXCLUDED.id_papel, id_abrigo = EXCLUDED.id_abrigo, nome = EXCLUDED.nome,
                senha_hash = EXCLUDED.senha_hash, ativo = TRUE
         RETURNING id`,
        [u.papel, u.abrigo ? idsAbrigo[u.abrigo] : null, u.nome, u.email, senhaHash],
      );
      idsUsuario[u.email] = rows[0].id;
    }
    log(`[seed] ${USUARIOS.length} usuários prontos (senha padrão: SEED_SENHA_PADRAO).`);

    const responsavel = (chaveAbrigo) =>
      idsUsuario[USUARIOS.find((u) => u.abrigo === chaveAbrigo && u.papel === 'COORDENADOR').email];

    // --- Estoque: somente via movimentações (mantém o livro-razão coerente) ---
    for (const [chave, itens] of Object.entries(ESTOQUE)) {
      const idAbrigo = idsAbrigo[chave];
      const { rows } = await client.query('SELECT count(*)::int AS total FROM movimentacao_estoque WHERE id_abrigo = $1', [idAbrigo]);
      if (rows[0].total > 0) continue;

      for (const [nomeItem, quantidade, minima, status] of itens) {
        const item = await client.query('SELECT id FROM item WHERE nome_micro = $1', [nomeItem]);
        if (!item.rows[0]) throw new Error(`Item "${nomeItem}" não existe no catálogo.`);
        const idItem = item.rows[0].id;

        if (quantidade > 0) {
          await client.query(
            `INSERT INTO movimentacao_estoque (id_abrigo, id_item, id_usuario, tipo_movimentacao, quantidade, observacao)
             VALUES ($1, $2, $3, 'ENTRADA_DOACAO', $4, 'Carga inicial (seed)')`,
            [idAbrigo, idItem, responsavel(chave), quantidade],
          );
        }
        await client.query(
          `INSERT INTO estoque_abrigo (id_abrigo, id_item, id_status_necessidade, quantidade_minima)
           VALUES ($1, $2, (SELECT id FROM status_necessidade WHERE codigo = $3), $4)
           ON CONFLICT (id_abrigo, id_item) DO UPDATE
              SET id_status_necessidade = EXCLUDED.id_status_necessidade, quantidade_minima = EXCLUDED.quantidade_minima`,
          [idAbrigo, idItem, status, minima],
        );
      }
    }
    log('[seed] estoques e necessidades prontos.');

    // --- Abrigados -----------------------------------------------------------
    for (const [chave, pessoas] of Object.entries(ABRIGADOS)) {
      const idAbrigo = idsAbrigo[chave];
      const { rows } = await client.query('SELECT count(*)::int AS total FROM abrigado WHERE id_abrigo_atual = $1', [idAbrigo]);
      if (rows[0].total > 0) continue;

      for (const [nome, baseCpf, nascimento] of pessoas) {
        await client.query(
          `INSERT INTO abrigado (id_abrigo_atual, nome_completo, cpf, data_nascimento, data_entrada)
           VALUES ($1, $2, $3, $4, now() - (random() * interval '72 hours'))
           ON CONFLICT (cpf) WHERE status_acolhimento = 'PRESENTE' AND cpf IS NOT NULL DO NOTHING`,
          [idAbrigo, nome, baseCpf ? gerarCpf(baseCpf) : null, nascimento],
        );
      }
    }
    log('[seed] abrigados prontos.');

    // --- Ocorrências de infraestrutura ---------------------------------------
    for (const [chave, ocorrencias] of Object.entries(OCORRENCIAS)) {
      const idAbrigo = idsAbrigo[chave];
      for (const [tipo, gravidade, descricao, coordenadas, poligono] of ocorrencias) {
        const { rows } = await client.query(
          'SELECT count(*)::int AS total FROM ocorrencia_infraestrutura WHERE id_abrigo = $1 AND tipo = $2 AND data_resolucao IS NULL',
          [idAbrigo, tipo],
        );
        if (rows[0].total > 0) continue;

        await client.query(
          `INSERT INTO ocorrencia_infraestrutura (id_abrigo, id_usuario_registro, tipo, gravidade, descricao, latitude, longitude, poligono_risco)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            idAbrigo,
            responsavel(chave),
            tipo,
            gravidade,
            descricao,
            coordenadas?.[0] ?? null,
            coordenadas?.[1] ?? null,
            poligono ? JSON.stringify(poligono) : null,
          ],
        );
      }
    }
    log('[seed] ocorrências prontas.');

    // --- Uma transferência de exemplo (histórico) ----------------------------
    const transferencias = await client.query('SELECT count(*)::int AS total FROM transferencia_abrigado');
    if (transferencias.rows[0].total === 0) {
      const pessoa = await client.query(
        `SELECT id FROM abrigado WHERE nome_completo = 'Heitor Alves Nunes' AND status_acolhimento = 'PRESENTE'`,
      );
      if (pessoa.rows[0]) {
        await client.query(
          `INSERT INTO transferencia_abrigado (id_abrigado, id_abrigo_origem, id_abrigo_destino, id_usuario, motivo)
           VALUES ($1, $2, $3, $4, 'Reunificação familiar: filha acolhida no abrigo de destino.')`,
          [pessoa.rows[0].id, idsAbrigo.central, idsAbrigo.saocristovao, responsavel('central')],
        );
      }
    }

    await client.query('COMMIT');
    log('[seed] concluído.');
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    await client.end();
  }
}

const executadoDiretamente = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  carregarEnvLocal();
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] o seed de desenvolvimento não deve rodar com NODE_ENV=production.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('[seed] DATABASE_URL não definida.');
    process.exit(1);
  }

  executarSeed({
    connectionString: process.env.DATABASE_URL,
    senha: process.env.SEED_SENHA_PADRAO || 'WhereToGo@2026',
  }).catch((erro) => {
    console.error(`[seed] ${erro.message}`);
    process.exit(1);
  });
}
