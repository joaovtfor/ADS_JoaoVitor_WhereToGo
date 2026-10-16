import { describe, expect, it } from "vitest";
import { consultarUm } from "@/lib/db";
import {
  classificarItem,
  listarEstoque,
  listarMovimentacoes,
  movimentarEstoque,
  transferirEstoque,
} from "@/modules/estoque/estoque.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario, idItem, logsDoUsuario } from "./fixtures";

describe("RF02 - Fast-CRUD de inventário", () => {
  it("incrementa e decrementa com histórico e log de auditoria", async () => {
    const { abrigo, voluntario } = await criarCenario();
    const agua = await idItem("Água Potável 5 L");

    const entrada = await movimentarEstoque(voluntario, abrigo.id, agua, { quantidade: 1 });
    expect(entrada.quantidadeAtual).toBe(1);
    expect(entrada.movimentacao).toMatchObject({ tipo: "ENTRADA_DOACAO", quantidade: 1, quantidadeResultante: 1 });

    await movimentarEstoque(voluntario, abrigo.id, agua, { quantidade: 5 });
    const saida = await movimentarEstoque(voluntario, abrigo.id, agua, { quantidade: -1 });
    expect(saida).toMatchObject({ quantidadeAtual: 5, movimentacao: { tipo: "SAIDA_CONSUMO", quantidade: -1 } });

    const logs = await logsDoUsuario(voluntario.usuario.id);
    expect(logs.map((l) => l.descricao)).toEqual(["+1 Água Potável 5 L (ENTRADA_DOACAO)", "+5 Água Potável 5 L (ENTRADA_DOACAO)", "-1 Água Potável 5 L (SAIDA_CONSUMO)"]);
    expect(logs[0]).toMatchObject({ acao: "ESTOQUE_MOVIMENTADO", id_abrigo: abrigo.id, endereco_ip: "127.0.0.1" });
  });

  it("não permite estoque negativo", async () => {
    const { abrigo, voluntario } = await criarCenario();
    const item = await idItem("Cobertor");
    await movimentarEstoque(voluntario, abrigo.id, item, { quantidade: 2 });

    const erro = await capturarErro(movimentarEstoque(voluntario, abrigo.id, item, { quantidade: -3 }));
    expect(erro).toMatchObject({ status: 409, codigo: "ESTOQUE_INSUFICIENTE" });

    const estoque = await listarEstoque(voluntario, abrigo.id, {});
    expect(estoque.find((e) => e.idItem === item)?.quantidade).toBe(2);
  });

  it("RBAC: voluntário só altera o próprio abrigo e ADMIN pode movimentar qualquer abrigo", async () => {
    const { abrigo, admin } = await criarCenario();
    const outroAbrigo = await criarAbrigo();
    const voluntarioDeOutro = contexto(await criarUsuario("VOLUNTARIO", outroAbrigo.id));
    const item = await idItem("Sabonete");

    expect((await capturarErro(movimentarEstoque(voluntarioDeOutro, abrigo.id, item, { quantidade: 1 }))).status).toBe(403);
    const movAdmin = await movimentarEstoque(admin, abrigo.id, item, { quantidade: 2 });
    expect(movAdmin.quantidadeAtual).toBe(2);
  });

  it("AJUSTE por contagem física é exclusivo de coordenador/admin e calcula a diferença", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario();
    const item = await idItem("Colchão");
    await movimentarEstoque(voluntario, abrigo.id, item, { quantidade: 10 });

    const ajusteDoVoluntario = movimentarEstoque(voluntario, abrigo.id, item, {
      tipo: "AJUSTE",
      quantidadeFinal: 7,
      observacao: "contagem",
    });
    expect((await capturarErro(ajusteDoVoluntario)).status).toBe(403);

    const ajuste = await movimentarEstoque(coordenador, abrigo.id, item, {
      tipo: "AJUSTE",
      quantidadeFinal: 7,
      observacao: "Contagem física do depósito",
    });
    expect(ajuste).toMatchObject({ quantidadeAtual: 7, movimentacao: { tipo: "AJUSTE", quantidade: -3 } });

    const semDiferenca = await movimentarEstoque(coordenador, abrigo.id, item, {
      tipo: "AJUSTE",
      quantidadeFinal: 7,
      observacao: "Recontagem",
    });
    expect(semDiferenca).toMatchObject({ quantidadeAtual: 7, movimentacao: null });
  });

  it("lista o catálogo completo para a tela Fast-CRUD e pagina o histórico", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario();
    const item = await idItem("Arroz 5 kg");
    for (let i = 0; i < 3; i++) await movimentarEstoque(voluntario, abrigo.id, item, { quantidade: 1 });

    const somenteComSaldo = await listarEstoque(voluntario, abrigo.id, {});
    const comCatalogo = await listarEstoque(voluntario, abrigo.id, { incluirCatalogo: true });
    expect(somenteComSaldo).toHaveLength(1);
    expect(comCatalogo.length).toBeGreaterThan(20);
    expect(comCatalogo.find((e) => e.idItem === item)?.quantidade).toBe(3);

    const pagina = await listarMovimentacoes(coordenador, abrigo.id, {}, { pagina: 1, tamanho: 2 });
    expect(pagina.itens).toHaveLength(2);
    expect(pagina.paginacao).toMatchObject({ total: 3, totalPaginas: 2 });
    expect((await capturarErro(listarMovimentacoes(voluntario, abrigo.id, {}, { pagina: 1, tamanho: 2 }))).status).toBe(403);
  });
});

describe("RF03 - Status de necessidade (URGENTE / BLOQUEADO)", () => {
  it("coordenador classifica item mesmo sem saldo; voluntário não pode", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario();
    const item = await idItem("Leite em Pó Infantil");

    expect((await capturarErro(classificarItem(voluntario, abrigo.id, item, { statusNecessidade: "URGENTE" }))).status).toBe(403);

    const classificado = await classificarItem(coordenador, abrigo.id, item, { statusNecessidade: "URGENTE", quantidadeMinima: 10 });
    expect(classificado).toMatchObject({ statusNecessidade: "URGENTE", quantidade: 0, quantidadeMinima: 10, critico: true });

    const logs = await logsDoUsuario(coordenador.usuario.id);
    expect(logs.at(-1)).toMatchObject({ acao: "ESTOQUE_CLASSIFICADO", descricao: "Status de Leite em Pó Infantil: NORMAL -> URGENTE" });
  });

  it("ADMIN pode classificar itens de qualquer abrigo", async () => {
    const { abrigo, admin } = await criarCenario();
    const resultado = await classificarItem(admin, abrigo.id, await idItem("Cobertor"), { statusNecessidade: "BLOQUEADO" });
    expect(resultado.statusNecessidade).toBe("BLOQUEADO");
  });

  it("promove automaticamente status NORMAL para URGENTE quando saldo cai abaixo de quantidadeMinima", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario();
    const item = await idItem("Fralda Infantil");

    await movimentarEstoque(voluntario, abrigo.id, item, { quantidade: 10 });
    await classificarItem(coordenador, abrigo.id, item, { statusNecessidade: "NORMAL", quantidadeMinima: 5 });

    // Saída que derruba saldo para 4 (< 5): promove automaticamente de NORMAL para URGENTE.
    await movimentarEstoque(voluntario, abrigo.id, item, { quantidade: -6 });
    const aposQueda = (await listarEstoque(voluntario, abrigo.id, {})).find((e) => e.idItem === item);
    expect(aposQueda).toMatchObject({ quantidade: 4, quantidadeMinima: 5, statusNecessidade: "URGENTE", critico: true });
  });
});

describe("Transferência de itens entre abrigos", () => {
  it("debita a origem e credita o destino de forma atômica", async () => {
    const { abrigo: origem, coordenador, voluntario } = await criarCenario();
    const destino = await criarAbrigo();
    const item = await idItem("Kit Higiene Pessoal");
    await movimentarEstoque(voluntario, origem.id, item, { quantidade: 10 });

    const resultado = await transferirEstoque(coordenador, origem.id, {
      idAbrigoDestino: destino.id,
      idItem: item,
      quantidade: 4,
      observacao: "Remanejamento",
    });
    expect(resultado.origem.quantidadeAtual).toBe(6);
    expect(resultado.destino.quantidadeAtual).toBe(4);
    expect(resultado.movimentacoes.saida).toMatchObject({ tipo: "TRANSFERENCIA_SAIDA", quantidade: -4 });

    // Sem saldo suficiente: nada é gravado em nenhum dos dois abrigos.
    const erro = await capturarErro(
      transferirEstoque(coordenador, origem.id, { idAbrigoDestino: destino.id, idItem: item, quantidade: 50, observacao: "x" }),
    );
    expect(erro.codigo).toBe("ESTOQUE_INSUFICIENTE");
    const saldoDestino = await consultarUm<{ quantidade: number }>(
      "SELECT quantidade FROM estoque_abrigo WHERE id_abrigo = $1 AND id_item = $2",
      [destino.id, item],
    );
    expect(saldoDestino!.quantidade).toBe(4);
  });
});
