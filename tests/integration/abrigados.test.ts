import { describe, expect, it } from "vitest";
import type { Contexto } from "@/lib/auth/rbac";
import { validar } from "@/lib/http";
import { atualizarAbrigo, obterAbrigo, obterDashboard } from "@/modules/abrigos/abrigos.service";
import {
  desligarAbrigado,
  esquemaRegistrarAbrigado,
  listarAbrigados,
  listarTransferencias,
  registrarEntrada as registrarEntradaService,
  transferirAbrigado,
} from "@/modules/abrigados/abrigados.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario } from "./fixtures";

/** Mesmo fluxo da rota: valida/normaliza o corpo com o schema antes do service. */
const registrarEntrada = async (ctx: Contexto, idAbrigo: number, corpo: unknown) =>
  registrarEntradaService(ctx, idAbrigo, validar(esquemaRegistrarAbrigado, corpo));

// CPFs fictícios com dígitos verificadores válidos.
const CPF_A = "529.982.247-25";
const CPF_B = "11144477735";

describe("RF12 - Abrigados (acolhimento e transferências)", () => {
  it("registra entrada, atualiza a lotação e bloqueia abrigo lotado", async () => {
    const { abrigo, voluntario, admin } = await criarCenario({ capacidade: 2 });

    const { abrigado, reentrada } = await registrarEntrada(voluntario, abrigo.id, {
      nomeCompleto: "Maria da Silva",
      cpf: "",
      dataNascimento: "1980-02-20",
    });
    expect(reentrada).toBe(false);
    expect(abrigado).toMatchObject({ statusAcolhimento: "PRESENTE", cpf: null, dataNascimento: "1980-02-20" });

    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "José Souza" });
    expect((await obterAbrigo(admin, abrigo.id)).ocupacao).toMatchObject({ lotacaoAtual: 2, vagasDisponiveis: 0, nivel: "VERMELHO" });

    const lotado = await capturarErro(registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Terceira Pessoa" }));
    expect(lotado).toMatchObject({ status: 409, codigo: "ABRIGO_LOTADO" });
  });

  it("não aceita a mesma pessoa (CPF) presente duas vezes e preserva histórico na reentrada", async () => {
    const { abrigo, voluntario, coordenador } = await criarCenario();
    const { abrigado } = await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa CPF", cpf: CPF_A });
    expect(abrigado.cpf).toBe("52998224725");

    const duplicado = await capturarErro(registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Outra", cpf: CPF_A }));
    expect(duplicado.codigo).toBe("ABRIGADO_JA_PRESENTE");

    await desligarAbrigado(coordenador, abrigado.id, { motivo: "Retornou para casa" });
    const volta = await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa CPF", cpf: CPF_A });
    expect(volta.reentrada).toBe(true);
    expect(volta.abrigado.id).not.toBe(abrigado.id);
    expect(volta.abrigado).toMatchObject({ statusAcolhimento: "PRESENTE", dataSaida: null });

    const todos = await listarAbrigados(coordenador, abrigo.id, { status: "TODOS" }, { pagina: 1, tamanho: 10 });
    expect(todos.itens.filter((a) => a.cpf === "52998224725")).toHaveLength(2);
  });

  it("permite ajuste rápido de acolhidos não triados e conversão em check-in nominal", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario({ capacidade: 5 });

    const atualizado = await atualizarAbrigo(coordenador, abrigo.id, { acolhidosNaoTriados: 5 });
    expect(atualizado).toMatchObject({ acolhidosNaoTriados: 5, lotacaoAtual: 5 });

    // Sem descontar da triagem, o abrigo já está com 5/5 ocupados.
    const semDesconto = await capturarErro(registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Nominal Extra" }));
    expect(semDesconto.codigo).toBe("ABRIGO_LOTADO");

    // Com descontarDaTriagem: true, converte 1 não triado em 1 nominal mantendo lotação 5/5.
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Nominal Triado", descontarDaTriagem: true });
    const aposTriagem = await obterAbrigo(coordenador, abrigo.id);
    expect(aposTriagem).toMatchObject({ acolhidosNaoTriados: 4, lotacaoAtual: 5 });

    const dash = await obterDashboard(coordenador, abrigo.id);
    expect(dash.acolhidos).toMatchObject({ presentes: 1, naoTriados: 4 });
  });

  it("desligamento libera a vaga e só pode ser feito por coordenador/admin", async () => {
    const { abrigo, voluntario, coordenador, admin } = await criarCenario();
    const { abrigado } = await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa Desligada" });

    expect((await capturarErro(desligarAbrigado(voluntario, abrigado.id, {}))).status).toBe(403);
    const desligado = await desligarAbrigado(coordenador, abrigado.id, {});
    expect(desligado.statusAcolhimento).toBe("DESLIGADO");
    expect(desligado.dataSaida).not.toBeNull();
    expect((await obterAbrigo(admin, abrigo.id)).lotacaoAtual).toBe(0);

    expect((await capturarErro(desligarAbrigado(coordenador, abrigado.id, {}))).codigo).toBe("ABRIGADO_JA_DESLIGADO");
  });

  it("transfere para abrigo com vaga, registra histórico e respeita permissões", async () => {
    const { abrigo: origem, voluntario, coordenador, admin } = await criarCenario();
    const destino = await criarAbrigo({ capacidade: 1 });
    const { abrigado } = await registrarEntrada(voluntario, origem.id, { nomeCompleto: "Pessoa Transferida", cpf: CPF_B });

    expect((await capturarErro(transferirAbrigado(voluntario, abrigado.id, { idAbrigoDestino: destino.id, motivo: "x" }))).status).toBe(403);

    const { transferencia, abrigado: movido } = await transferirAbrigado(coordenador, abrigado.id, {
      idAbrigoDestino: destino.id,
      motivo: "Reunificação familiar",
    });
    expect(transferencia).toMatchObject({ origem: { id: origem.id }, destino: { id: destino.id } });
    expect(movido.idAbrigoAtual).toBe(destino.id);
    expect((await obterAbrigo(admin, origem.id)).lotacaoAtual).toBe(0);
    expect((await obterAbrigo(admin, destino.id)).lotacaoAtual).toBe(1);

    const historico = await listarTransferencias(admin, abrigado.id);
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({ motivo: "Reunificação familiar", idAbrigoOrigem: origem.id });

    // Depois da transferência o coordenador de origem não gerencia mais a pessoa.
    expect((await capturarErro(desligarAbrigado(coordenador, abrigado.id, {}))).status).toBe(403);

    // Destino lotado.
    const outro = await registrarEntrada(voluntario, origem.id, { nomeCompleto: "Mais Uma Pessoa" });
    const lotado = await capturarErro(transferirAbrigado(admin, outro.abrigado.id, { idAbrigoDestino: destino.id, motivo: "x" }));
    expect(lotado.codigo).toBe("ABRIGO_LOTADO");
  });

  it("valida CPF e isola os dados entre abrigos", async () => {
    const { abrigo, voluntario } = await criarCenario();
    const cpfInvalido = await capturarErro(registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "X", cpf: "123.456.789-00" }));
    expect(cpfInvalido).toMatchObject({ status: 400, detalhes: [{ campo: "cpf", mensagem: "CPF inválido." }] });

    const nascimentoFuturo = await capturarErro(
      registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "X", dataNascimento: "2999-01-01" }),
    );
    expect(nascimentoFuturo.status).toBe(400);

    const outroAbrigo = await criarAbrigo();
    const coordenadorDeOutro = contexto(await criarUsuario("COORDENADOR", outroAbrigo.id));
    expect(
      (await capturarErro(listarAbrigados(coordenadorDeOutro, abrigo.id, { status: "PRESENTE" }, { pagina: 1, tamanho: 10 }))).status,
    ).toBe(403);
  });
});
