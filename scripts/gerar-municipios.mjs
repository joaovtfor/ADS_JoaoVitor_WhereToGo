// =============================================================================
// Gera a migration com os municípios de uma UF (nome, slug e contorno), a
// partir da API de dados do IBGE. Roda uma vez por UF, por quem mantém o
// projeto; o SQL gerado vai para db/migrations e passa a valer em todo lugar
// (local, testes, Render, Supabase) pelo executor de migrations.
//
// Uso:
//   node scripts/gerar-municipios.mjs <código da UF> <arquivo de saída>
//   node scripts/gerar-municipios.mjs 43 db/migrations/0017_municipios_rs.sql
//
// Fontes (públicas, sem chave; citar "Fonte: IBGE"):
// - nomes:     servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios
// - contornos: servicodados.ibge.gov.br/api/v3/malhas/estados/{uf}
//              (intrarregiao=municipio, qualidade=intermediaria: ~11 m de
//              precisão; RS inteiro tem ~880 KB. A "minima" tinha só 30
//              vértices para Passo Fundo, pouco para dizer de que lado da
//              divisa um abrigo fica.)
//
// Migration aplicada não se edita: para atualizar os contornos, gere um
// arquivo novo com outro número.
// =============================================================================
import { writeFile } from 'node:fs/promises';

const API = 'https://servicodados.ibge.gov.br/api';
const TIMEOUT_MS = 60_000;

async function baixarJson(url) {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`IBGE respondeu HTTP ${resposta.status} em ${url}`);
  return resposta.json();
}

/** "Sant'Ana do Livramento" -> "santana-do-livramento"; "Não-Me-Toque" -> "nao-me-toque". */
function gerarSlug(nome) {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const textoSql = (valor) => `'${String(valor).replace(/'/g, "''")}'`;

async function gerar(codigoUf, saida) {
  const estado = await baixarJson(`${API}/v1/localidades/estados/${codigoUf}`);
  const uf = estado.sigla;
  if (!/^[A-Z]{2}$/.test(uf ?? '')) throw new Error(`UF ${codigoUf} não encontrada no IBGE.`);

  const [nomes, malha] = await Promise.all([
    baixarJson(`${API}/v1/localidades/estados/${codigoUf}/municipios`),
    baixarJson(
      `${API}/v3/malhas/estados/${codigoUf}?formato=application/vnd.geo%2Bjson&intrarregiao=municipio&qualidade=intermediaria`,
    ),
  ]);

  const nomePorCodigo = new Map(nomes.map((m) => [String(m.id), m.nome]));
  const slugs = new Map();
  const linhas = [];

  for (const feicao of [...malha.features].sort((a, b) => a.properties.codarea.localeCompare(b.properties.codarea))) {
    const codigo = feicao.properties.codarea;
    const nome = nomePorCodigo.get(codigo);
    if (!/^\d{7}$/.test(codigo) || !nome) throw new Error(`Município ${codigo} sem nome no IBGE.`);
    if (!['Polygon', 'MultiPolygon'].includes(feicao.geometry?.type)) throw new Error(`Contorno inesperado em ${codigo}.`);

    const slug = gerarSlug(nome);
    if (slugs.has(slug)) throw new Error(`Slug repetido em ${uf}: "${slug}" (${slugs.get(slug)} e ${codigo}).`);
    slugs.set(slug, codigo);

    linhas.push(`    (${textoSql(codigo)}, ${textoSql(nome)}, ${textoSql(slug)}, ${textoSql(JSON.stringify(feicao.geometry))})`);
  }
  if (linhas.length !== nomes.length) {
    throw new Error(`O IBGE listou ${nomes.length} municípios em ${uf}, mas a malha tem ${linhas.length}.`);
  }

  const sql = `-- =============================================================================
-- WhereToGo - Municípios de ${uf} (${linhas.length}): nome, slug e contorno.
-- -----------------------------------------------------------------------------
-- GERADO por scripts/gerar-municipios.mjs ${codigoUf} em ${new Date().toISOString().slice(0, 10)}. Não edite: gere outro arquivo.
-- Fonte: IBGE (API de localidades e malha municipal, qualidade intermediária).
--
-- Só dados de referência: nenhum município fica ativo aqui. Quem ativa a
-- operação de uma cidade é outra migration (ou o painel, numa fase futura).
-- O centro (latitude/longitude) é um ponto dentro do contorno
-- (ST_PointOnSurface), não a sede: ao ativar a cidade, ajuste para o centro urbano.
-- ST_MakeValid corrige autointerseções que a simplificação do contorno possa ter criado.
-- =============================================================================

INSERT INTO municipio (codigo_ibge, nome, uf, slug, contorno, latitude, longitude)
SELECT d.codigo, d.nome, ${textoSql(uf)}, d.slug, geo.g::geography, ST_Y(ST_PointOnSurface(geo.g)), ST_X(ST_PointOnSurface(geo.g))
  FROM (VALUES
${linhas.join(',\n')}
  ) AS d (codigo, nome, slug, geojson)
 CROSS JOIN LATERAL (
   SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(d.geojson), 4326)), 3)) AS g
 ) AS geo
ON CONFLICT (codigo_ibge) DO NOTHING;
`;

  await writeFile(saida, sql, 'utf8');
  console.log(`[gerar-municipios] ${linhas.length} municípios de ${uf} gravados em ${saida} (${Math.round(sql.length / 1024)} KB).`);
}

const [codigoUf, saida] = process.argv.slice(2);
if (!/^\d{2}$/.test(codigoUf ?? '') || !saida) {
  console.error('Uso: node scripts/gerar-municipios.mjs <código da UF, ex.: 43> <arquivo de saída .sql>');
  process.exit(1);
}
gerar(codigoUf, saida).catch((erro) => {
  console.error('[gerar-municipios] Falha:', erro.message);
  process.exit(1);
});
