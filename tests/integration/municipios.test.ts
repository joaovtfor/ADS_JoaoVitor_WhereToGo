import { describe, expect, it } from "vitest";
import { consultar, consultarUm } from "@/lib/db";
import { atualizarAbrigo, criarAbrigo as criarAbrigoService } from "@/modules/abrigos/abrigos.service";
import { localizarMunicipio } from "@/modules/municipios/municipios.service";
import { obterAbrigoPublico } from "@/modules/publico/publico.service";
import { capturarErro, criarAbrigo, criarCenario } from "./fixtures";

// Tarefa 5, fase 1 (migrations 0016 a 0018): municípios do RS com contorno do
// IBGE e a cidade do abrigo calculada do ponto.

const PASSO_FUNDO = { codigoIbge: "4314100", nome: "Passo Fundo", uf: "RS" };
const PONTO_PASSO_FUNDO = { latitude: -28.2628, longitude: -52.4067 };
const PONTO_MARAU = { latitude: -28.449, longitude: -52.199 };
const PONTO_BAHIA = { latitude: -12.97, longitude: -38.5 };

const novoAbrigo = (ponto: { latitude: number; longitude: number }) => ({
  nome: "Abrigo da Cidade",
  endereco: "Rua Teste, 1",
  capacidadeMaxima: 40,
  ...ponto,
});

describe("Municípios e cidade do abrigo", () => {
  it("carrega os 497 municípios do RS, com Passo Fundo em operação", async () => {
    const resumo = await consultarUm<{ total: number; ativos: string[] }>(
      `SELECT count(*)::int AS total, array_agg(codigo_ibge) FILTER (WHERE ativo) AS ativos FROM municipio WHERE uf = 'RS'`,
    );
    expect(resumo).toEqual({ total: 497, ativos: ["4314100"] });

    const slug = await consultarUm<{ slug: string }>(`SELECT slug FROM municipio WHERE codigo_ibge = '4317103'`);
    expect(slug?.slug).toBe("santana-do-livramento");
  });

  it("acha o município de um ponto pelo contorno do IBGE", async () => {
    expect(await localizarMunicipio(PONTO_PASSO_FUNDO.latitude, PONTO_PASSO_FUNDO.longitude)).toEqual({ ...PASSO_FUNDO, ativo: true });
    expect(await localizarMunicipio(PONTO_MARAU.latitude, PONTO_MARAU.longitude)).toEqual({
      codigoIbge: "4311809",
      nome: "Marau",
      uf: "RS",
      ativo: false,
    });
    expect(await localizarMunicipio(PONTO_BAHIA.latitude, PONTO_BAHIA.longitude)).toBeNull();
  });

  it("aceita um ponto até 2 km fora do contorno (fresta da simplificação), e não além", async () => {
    // Município de teste: quadrado de ~11 km longe do RS.
    await consultar(
      `INSERT INTO municipio (codigo_ibge, nome, uf, slug, contorno, latitude, longitude)
       VALUES ('9999901', 'Quadrado de Teste', 'ZZ', 'quadrado-de-teste',
               ST_Multi(ST_MakeEnvelope(-40.10, -10.10, -40.00, -10.00, 4326))::geography, -10.05, -40.05)`,
    );
    try {
      // 1 grau de longitude perto de -10° de latitude ~ 109,6 km.
      expect((await localizarMunicipio(-10.05, -40.0 + 1 / 109.6))?.codigoIbge).toBe("9999901");
      expect(await localizarMunicipio(-10.05, -40.0 + 3 / 109.6)).toBeNull();
    } finally {
      await consultar(`DELETE FROM municipio WHERE codigo_ibge = '9999901'`);
    }
  });

  it("o banco calcula a cidade do abrigo pelo ponto, recalcula ao mover e ignora a cidade escrita à mão", async () => {
    const abrigo = await criarAbrigo(PONTO_PASSO_FUNDO);
    const cidade = () => consultarUm<{ municipio: string }>(`SELECT municipio_ibge AS municipio FROM abrigo WHERE id = $1`, [abrigo.id]);
    expect(await cidade()).toEqual({ municipio: "4314100" });

    await consultar(`UPDATE abrigo SET latitude = $2, longitude = $3 WHERE id = $1`, [abrigo.id, PONTO_MARAU.latitude, PONTO_MARAU.longitude]);
    expect(await cidade()).toEqual({ municipio: "4311809" });

    await consultar(`UPDATE abrigo SET municipio_ibge = '4314100' WHERE id = $1`, [abrigo.id]);
    expect(await cidade()).toEqual({ municipio: "4311809" });
  });

  it("o banco recusa abrigo fora dos municípios cadastrados", async () => {
    const erro = await capturarErro(criarAbrigo(PONTO_BAHIA));
    expect(erro).toMatchObject({ status: 422, codigo: "FORA_DOS_MUNICIPIOS" });
  });

  it("o cadastro só aceita abrigo em cidade onde o WhereToGo opera, com a mensagem da cidade", async () => {
    const { admin } = await criarCenario();

    const emPassoFundo = await criarAbrigoService(admin, novoAbrigo(PONTO_PASSO_FUNDO));
    expect(emPassoFundo.municipio).toEqual(PASSO_FUNDO);

    const emMarau = await capturarErro(criarAbrigoService(admin, novoAbrigo(PONTO_MARAU)));
    expect(emMarau).toMatchObject({ status: 422, codigo: "MUNICIPIO_NAO_ATENDIDO" });
    expect(emMarau.message).toContain("Marau/RS");

    const naBahia = await capturarErro(criarAbrigoService(admin, novoAbrigo(PONTO_BAHIA)));
    expect(naBahia).toMatchObject({ status: 422, codigo: "FORA_DOS_MUNICIPIOS" });
  });

  it("a edição confere a cidade só quando o ponto muda", async () => {
    const { admin, abrigo } = await criarCenario();

    const movido = await atualizarAbrigo(admin, abrigo.id, { latitude: -28.25, longitude: -52.41 });
    expect(movido.municipio).toEqual(PASSO_FUNDO);

    const paraMarau = await capturarErro(atualizarAbrigo(admin, abrigo.id, PONTO_MARAU));
    expect(paraMarau).toMatchObject({ status: 422, codigo: "MUNICIPIO_NAO_ATENDIDO" });
    // Só a longitude também conta: o ponto final (latitude antiga + longitude nova) é conferido.
    expect((await capturarErro(atualizarAbrigo(admin, abrigo.id, { longitude: -38.5 }))).codigo).toBe("FORA_DOS_MUNICIPIOS");

    const renomeado = await atualizarAbrigo(admin, abrigo.id, { nome: "Abrigo Renomeado" });
    expect(renomeado).toMatchObject({ nome: "Abrigo Renomeado", municipio: PASSO_FUNDO });
  });

  it("o PIX do mapa público usa a cidade do cadastro, mesmo com endereço sem cidade", async () => {
    const abrigo = await criarAbrigo(PONTO_PASSO_FUNDO); // endereço "Endereço de teste"
    await consultar(`UPDATE abrigo SET chave_pix = 'pix@abrigo.org', titular_pix = 'Entidade' WHERE id = $1`, [abrigo.id]);

    const card = await obterAbrigoPublico(abrigo.id);
    // Campo 60 (cidade): "PASSO FUNDO", 11 caracteres. Antes saía "BRASIL".
    expect(card.pix?.brCode).toContain("6011PASSO FUNDO");
  });
});
