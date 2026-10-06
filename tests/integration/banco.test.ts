import { describe, expect, it } from "vitest";
import { consultar, consultarUm } from "@/lib/db";
import { normalizarErro } from "@/lib/http";
import { criarAbrigo, criarUsuario, idItem } from "./fixtures";

/** Regras garantidas pelo próprio banco (valem para qualquer caminho de escrita). */
describe("Banco de dados - regras de integridade", () => {
  it("aplica os dados de referência (papéis, status e catálogo)", async () => {
    const papeis = await consultar<{ nome: string }>("SELECT nome FROM papel_usuario ORDER BY nome");
    expect(papeis.map((p) => p.nome)).toEqual(["ADMIN", "COORDENADOR", "VOLUNTARIO"]);

    const status = await consultar<{ codigo: string }>("SELECT codigo FROM status_necessidade ORDER BY nivel_prioridade");
    expect(status.map((s) => s.codigo)).toEqual(["URGENTE", "NORMAL", "BLOQUEADO"]);

    const itens = await consultarUm<{ total: number }>("SELECT count(*) AS total FROM item");
    expect(itens!.total).toBeGreaterThan(20);
  });

  it("gera a localização PostGIS a partir de latitude/longitude", async () => {
    const abrigo = await criarAbrigo({ latitude: -28.2346, longitude: -52.3809 });
    const ponto = await consultarUm<{ wkt: string }>(
      "SELECT ST_AsText(localizacao::geometry) AS wkt FROM abrigo WHERE id = $1",
      [abrigo.id],
    );
    expect(ponto!.wkt).toBe("POINT(-52.3809 -28.2346)");
  });

  it("impede ADMIN com abrigo e COORDENADOR/VOLUNTARIO sem abrigo", async () => {
    const abrigo = await criarAbrigo();
    const comAbrigo = normalizarErro(await criarUsuario("ADMIN", abrigo.id).catch((e) => e));
    expect(comAbrigo.codigo).toBe("VINCULO_INVALIDO");

    const semAbrigo = normalizarErro(await criarUsuario("VOLUNTARIO", null).catch((e) => e));
    expect(semAbrigo.codigo).toBe("VINCULO_INVALIDO");
  });

  it("mantém estoque = soma das movimentações e grava o saldo resultante", async () => {
    const abrigo = await criarAbrigo();
    const usuario = await criarUsuario("VOLUNTARIO", abrigo.id);
    const item = await idItem("Cesta Básica");
    const inserir = (tipo: string, quantidade: number) =>
      consultarUm<{ resultante: number }>(
        `INSERT INTO movimentacao_estoque (id_abrigo, id_item, id_usuario, tipo_movimentacao, quantidade)
         VALUES ($1, $2, $3, $4, $5) RETURNING quantidade_resultante AS resultante`,
        [abrigo.id, item, usuario.id, tipo, quantidade],
      );

    expect((await inserir("ENTRADA_DOACAO", 10))!.resultante).toBe(10);
    expect((await inserir("SAIDA_CONSUMO", -3))!.resultante).toBe(7);
    expect((await inserir("AJUSTE", 1))!.resultante).toBe(8);

    // Saldo negativo é rejeitado e nada é gravado.
    const erro = normalizarErro(await inserir("PERDA", -9).catch((e) => e));
    expect(erro.codigo).toBe("ESTOQUE_INSUFICIENTE");

    // Sinal incoerente com o tipo é rejeitado.
    const sinal = normalizarErro(await inserir("ENTRADA_DOACAO", -1).catch((e) => e));
    expect(sinal.status).toBe(422);

    const conferencia = await consultarUm<{ saldo: number; soma: number }>(
      `SELECT e.quantidade AS saldo, (SELECT sum(quantidade) FROM movimentacao_estoque m
                                       WHERE m.id_abrigo = e.id_abrigo AND m.id_item = e.id_item) AS soma
         FROM estoque_abrigo e WHERE e.id_abrigo = $1 AND e.id_item = $2`,
      [abrigo.id, item],
    );
    expect(conferencia).toEqual({ saldo: 8, soma: 8 });
  });

  it("torna LOG_AUDITORIA, MOVIMENTACAO_ESTOQUE e TRANSFERENCIA_ABRIGADO imutáveis", async () => {
    const abrigo = await criarAbrigo();
    const usuario = await criarUsuario("VOLUNTARIO", abrigo.id);
    await consultar(
      "INSERT INTO log_auditoria (id_usuario, acao, descricao) VALUES ($1, 'TESTE', 'registro de teste')",
      [usuario.id],
    );
    await consultar(
      `INSERT INTO movimentacao_estoque (id_abrigo, id_item, id_usuario, tipo_movimentacao, quantidade)
       VALUES ($1, $2, $3, 'ENTRADA_DOACAO', 1)`,
      [abrigo.id, await idItem("Sabonete"), usuario.id],
    );

    for (const sql of [
      "UPDATE log_auditoria SET descricao = 'adulterado'",
      "DELETE FROM log_auditoria",
      "TRUNCATE log_auditoria",
      "UPDATE movimentacao_estoque SET quantidade = 1000",
      "DELETE FROM movimentacao_estoque",
      "TRUNCATE transferencia_abrigado",
    ]) {
      const erro = normalizarErro(await consultar(sql).catch((e) => e));
      expect(erro.codigo, sql).toBe("REGISTRO_IMUTAVEL");
    }
  });

  it("mantém a lotação do abrigo a partir dos abrigados PRESENTES", async () => {
    const abrigo = await criarAbrigo();
    const lotacao = async () =>
      (await consultarUm<{ lotacao: number }>("SELECT lotacao_atual AS lotacao FROM abrigo WHERE id = $1", [abrigo.id]))!.lotacao;

    const { id } = (await consultarUm<{ id: number }>(
      "INSERT INTO abrigado (id_abrigo_atual, nome_completo) VALUES ($1, 'Pessoa A') RETURNING id",
      [abrigo.id],
    ))!;
    await consultar("INSERT INTO abrigado (id_abrigo_atual, nome_completo) VALUES ($1, 'Pessoa B')", [abrigo.id]);
    expect(await lotacao()).toBe(2);

    await consultar("UPDATE abrigado SET status_acolhimento = 'DESLIGADO', data_saida = now() WHERE id = $1", [id]);
    expect(await lotacao()).toBe(1);
  });

  it("transferência move o abrigado e atualiza a lotação de origem e destino", async () => {
    const origem = await criarAbrigo();
    const destino = await criarAbrigo();
    const usuario = await criarUsuario("COORDENADOR", origem.id);
    const { id } = (await consultarUm<{ id: number }>(
      "INSERT INTO abrigado (id_abrigo_atual, nome_completo) VALUES ($1, 'Pessoa Transferida') RETURNING id",
      [origem.id],
    ))!;

    await consultar(
      `INSERT INTO transferencia_abrigado (id_abrigado, id_abrigo_origem, id_abrigo_destino, id_usuario, motivo)
       VALUES ($1, $2, $3, $4, 'teste')`,
      [id, origem.id, destino.id, usuario.id],
    );

    const lotacoes = await consultar<{ id: number; lotacao: number }>(
      "SELECT id, lotacao_atual AS lotacao FROM abrigo WHERE id = ANY($1::int[]) ORDER BY id",
      [[origem.id, destino.id]],
    );
    expect(lotacoes).toEqual([
      { id: origem.id, lotacao: 0 },
      { id: destino.id, lotacao: 1 },
    ]);

    // Origem que não corresponde ao abrigo atual é rejeitada.
    const erro = normalizarErro(
      await consultar(
        `INSERT INTO transferencia_abrigado (id_abrigado, id_abrigo_origem, id_abrigo_destino, id_usuario, motivo)
         VALUES ($1, $2, $3, $4, 'teste')`,
        [id, origem.id, destino.id, usuario.id],
      ).catch((e) => e),
    );
    expect(erro.codigo).toBe("TRANSFERENCIA_INVALIDA");

    // O histórico de transferências também é imutável.
    const alteracao = normalizarErro(
      await consultar("UPDATE transferencia_abrigado SET motivo = 'adulterado' WHERE id_abrigado = $1", [id]).catch((e) => e),
    );
    expect(alteracao.codigo).toBe("REGISTRO_IMUTAVEL");
  });

  it("resume o status de infraestrutura pela pior ocorrência ativa", async () => {
    const abrigo = await criarAbrigo();
    const usuario = await criarUsuario("COORDENADOR", abrigo.id);
    const status = async () =>
      (await consultarUm<{ s: string }>("SELECT status_infraestrutura AS s FROM abrigo WHERE id = $1", [abrigo.id]))!.s;
    const registrar = (tipo: string, gravidade: string) =>
      consultarUm<{ id: number }>(
        `INSERT INTO ocorrencia_infraestrutura (id_abrigo, id_usuario_registro, tipo, gravidade)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [abrigo.id, usuario.id, tipo, gravidade],
      );

    expect(await status()).toBe("NORMAL");
    await registrar("SEM_ENERGIA", "ALERTA");
    expect(await status()).toBe("ALERTA");
    const critica = await registrar("VIA_BLOQUEADA", "CRITICO");
    expect(await status()).toBe("CRITICO");

    await consultar(
      "UPDATE ocorrencia_infraestrutura SET data_resolucao = now(), id_usuario_resolucao = $2 WHERE id = $1",
      [critica!.id, usuario.id],
    );
    expect(await status()).toBe("ALERTA");
  });
});
