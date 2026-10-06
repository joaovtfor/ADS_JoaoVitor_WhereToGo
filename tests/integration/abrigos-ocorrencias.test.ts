import { describe, expect, it } from "vitest";
import { validar } from "@/lib/http";
import { registrarEntrada } from "@/modules/abrigados/abrigados.service";
import {
  atualizarAbrigo,
  criarAbrigo as criarAbrigoService,
  esquemaCriarAbrigo,
  listarAbrigos,
  obterDashboard,
} from "@/modules/abrigos/abrigos.service";
import { classificarItem, movimentarEstoque } from "@/modules/estoque/estoque.service";
import { registrarOcorrencia, resolverOcorrencia } from "@/modules/ocorrencias/ocorrencias.service";
import { capturarErro, criarCenario, idItem } from "./fixtures";

const NOVO_ABRIGO = {
  nome: "Abrigo Novo",
  endereco: "Rua Teste, 1",
  latitude: -28.25,
  longitude: -52.4,
  capacidadeMaxima: 50,
};

describe("RF10 - Cadastro de abrigos", () => {
  it("somente ADMIN cadastra; PIX exige chave e titular juntos", async () => {
    const { admin, coordenador } = await criarCenario();

    expect((await capturarErro(criarAbrigoService(coordenador, NOVO_ABRIGO))).status).toBe(403);
    expect((await capturarErro(Promise.resolve().then(() => validar(esquemaCriarAbrigo, { ...NOVO_ABRIGO, chavePix: "x" })))).status).toBe(400);

    const abrigo = await criarAbrigoService(admin, { ...NOVO_ABRIGO, chavePix: "pix@abrigo.org", titularPix: "Entidade" });
    expect(abrigo).toMatchObject({ nome: "Abrigo Novo", lotacaoAtual: 0, statusInfraestrutura: "NORMAL", ativo: true });
    expect(abrigo.ocupacao).toMatchObject({ vagasDisponiveis: 50, nivel: "VERDE" });
  });

  it("coordenador altera só telefone/capacidade do próprio abrigo; PIX e cadastro são do ADMIN", async () => {
    const { abrigo, coordenador, voluntario, admin } = await criarCenario();

    const atualizado = await atualizarAbrigo(coordenador, abrigo.id, { telefone: "(54) 90000-0000", capacidadeMaxima: 120 });
    expect(atualizado).toMatchObject({ telefone: "(54) 90000-0000", capacidadeMaxima: 120 });

    expect((await capturarErro(atualizarAbrigo(coordenador, abrigo.id, { chavePix: "golpe@pix", titularPix: "Golpista" }))).status).toBe(403);
    expect((await capturarErro(atualizarAbrigo(voluntario, abrigo.id, { capacidadeMaxima: 10 }))).status).toBe(403);
    expect((await listarAbrigos(coordenador, {})).map((a) => a.id)).toEqual([abrigo.id]);

    const comPix = await atualizarAbrigo(admin, abrigo.id, { chavePix: "oficial@pix", titularPix: "Prefeitura" });
    expect(comPix.chavePix).toBe("oficial@pix");
  });

  it("não reduz capacidade abaixo da lotação nem desativa abrigo com pessoas", async () => {
    const { abrigo, voluntario, admin } = await criarCenario();
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa 1" });
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa 2" });

    expect((await capturarErro(atualizarAbrigo(admin, abrigo.id, { capacidadeMaxima: 1 }))).codigo).toBe("CAPACIDADE_ABAIXO_DA_LOTACAO");
    expect((await capturarErro(atualizarAbrigo(admin, abrigo.id, { ativo: false }))).codigo).toBe("ABRIGO_COM_ABRIGADOS");
  });
});

describe("RF05 - Ocorrências de infraestrutura", () => {
  it("registra, impede duplicidade ativa e recalcula o status ao resolver", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario();

    expect((await capturarErro(registrarOcorrencia(voluntario, abrigo.id, { tipo: "SEM_ENERGIA" }))).status).toBe(403);

    const energia = await registrarOcorrencia(coordenador, abrigo.id, { tipo: "SEM_ENERGIA" });
    expect(energia).toMatchObject({ statusInfraestrutura: "ALERTA", ocorrencia: { gravidade: "ALERTA", ativa: true } });

    const via = await registrarOcorrencia(coordenador, abrigo.id, {
      tipo: "VIA_BLOQUEADA",
      descricao: "Ponte interditada",
      latitude: -28.26,
      longitude: -52.41,
    });
    expect(via.statusInfraestrutura).toBe("CRITICO");

    const duplicada = await capturarErro(registrarOcorrencia(coordenador, abrigo.id, { tipo: "SEM_ENERGIA" }));
    expect(duplicada).toMatchObject({ status: 409, codigo: "OCORRENCIA_JA_ATIVA" });

    const resolvida = await resolverOcorrencia(coordenador, abrigo.id, via.ocorrencia.id, {});
    expect(resolvida).toMatchObject({ statusInfraestrutura: "ALERTA", ocorrencia: { ativa: false } });
    expect((await capturarErro(resolverOcorrencia(coordenador, abrigo.id, via.ocorrencia.id, {}))).codigo).toBe("OCORRENCIA_JA_RESOLVIDA");
  });
});

describe("RF04 - Dashboard de triagem", () => {
  it("consolida ocupação, itens críticos e ocorrências", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario({ capacidade: 4 });
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa 1" });
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa 2" });
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa 3" });

    const agua = await idItem("Água Mineral 500 ml");
    const fralda = await idItem("Fralda Infantil");
    await movimentarEstoque(voluntario, abrigo.id, agua, { quantidade: 5 });
    await classificarItem(coordenador, abrigo.id, agua, { quantidadeMinima: 20 });
    await classificarItem(coordenador, abrigo.id, fralda, { statusNecessidade: "URGENTE" });
    await registrarOcorrencia(coordenador, abrigo.id, { tipo: "SEM_AGUA" });

    const dashboard = await obterDashboard(coordenador, abrigo.id);
    expect(dashboard.ocupacao).toMatchObject({ lotacaoAtual: 3, percentual: 75, nivel: "AMARELO", vagasDisponiveis: 1 });
    expect(dashboard.acolhidos).toMatchObject({ presentes: 3, entradas24h: 3 });
    expect(dashboard.estoque.itensCriticos.map((i) => [i.nome, i.motivo])).toEqual([
      ["Fralda Infantil", "URGENTE"],
      ["Água Mineral 500 ml", "ABAIXO_DO_MINIMO"],
    ]);
    expect(dashboard.ocorrenciasAtivas).toHaveLength(1);
    expect(dashboard.ultimasMovimentacoes).toHaveLength(1);

    expect((await capturarErro(obterDashboard(voluntario, abrigo.id))).status).toBe(403);
  });
});
