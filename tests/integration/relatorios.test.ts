import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/csv";
import { consultar } from "@/lib/db";
import { validar } from "@/lib/http";
import { desligarAbrigado, registrarEntrada, transferirAbrigado } from "@/modules/abrigados/abrigados.service";
import { estornarMovimentacao, movimentarEstoque } from "@/modules/estoque/estoque.service";
import { moderarOcorrencia, registrarOcorrencia } from "@/modules/ocorrencias/ocorrencias.service";
import { registrarReporteCidadao } from "@/modules/publico/publico.service";
import { atualizarEvento, criarEvento, esquemaCriarEvento } from "@/modules/relatorios/eventos.service";
import { gerarSubsidiosFide, montarCsvFide } from "@/modules/relatorios/fide.service";
import { esquemaPrestacaoContas, gerarPrestacaoContas } from "@/modules/relatorios/prestacao-contas.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario, idItem, logsDoUsuario } from "./fixtures";

// Etapa 4 do plano de integração (.specs/plano-integracao-defesa-civil.md §4.4).
// O banco de testes é compartilhado: os números do consolidado da rede usam um
// período em 2020, onde só existem as estadias que este arquivo coloca lá.

/** CPF válido a partir de uma base aleatória de 9 dígitos (dígitos verificadores calculados). */
function cpfAleatorio(): string {
  const digitos = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const tamanho of [9, 10]) {
    const soma = digitos.slice(0, tamanho).reduce((acc, d, i) => acc + d * (tamanho + 1 - i), 0);
    const resto = (soma * 10) % 11;
    digitos.push(resto === 10 ? 0 : resto);
  }
  return digitos.join("");
}

const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

async function defesaCivil() {
  return contexto(await criarUsuario("DEFESA_CIVIL", null));
}

describe("Eventos de desastre (COBRADE por evento)", () => {
  it("Defesa Civil registra e encerra; coordenação só consulta", async () => {
    const dc = await defesaCivil();
    const evento = await criarEvento(dc, { nome: "Chuvas de teste", cobrade: "1.3.2.1.4", inicio: "2026-11-10", decreto: "Nº 1/2026" });
    expect(evento).toMatchObject({ cobrade: "1.3.2.1.4", cobradeDescricao: "Tempestade local/convectiva: chuvas intensas", emCurso: true, fim: null });

    const encerrado = await atualizarEvento(dc, evento.id, { fim: "2026-11-15" });
    expect(encerrado).toMatchObject({ fim: "2026-11-15", emCurso: false });

    const { coordenador } = await criarCenario();
    expect((await capturarErro(criarEvento(coordenador, { nome: "x", cobrade: "1.2.1.0.0", inicio: "2026-11-01" }))).status).toBe(403);
  });

  it("recusa código COBRADE fora da lista conferida e período invertido", async () => {
    const dc = await defesaCivil();
    // 2.4.2.1.0 aparecia na v1.1 da spec e não existe na COBRADE.
    expect((await capturarErro(criarEvento(dc, { nome: "x", cobrade: "2.4.2.1.0", inicio: "2026-11-01" }))).codigo).toBe("COBRADE_DESCONHECIDO");
    expect(
      (await capturarErro(Promise.resolve().then(() => validar(esquemaCriarEvento, { nome: "x", cobrade: "1.2.1.0.0", inicio: "2026-11-10", fim: "2026-11-01" }))))
        .status,
    ).toBe(400);
  });
});

describe("Subsídios para o FIDE", () => {
  it("conta desabrigados uma vez por pessoa (reentrada e transferência), suprime faixas pequenas e acha o pico", async () => {
    const { abrigo, voluntario, coordenador } = await criarCenario({ capacidade: 50 });
    const outro = await criarAbrigo({ capacidade: 50 });
    const dc = await defesaCivil();
    const evento = await criarEvento(dc, { nome: "Enchente de teste 2020", cobrade: "1.2.1.0.0", inicio: "2020-01-01" });
    await atualizarEvento(dc, evento.id, { fim: "2020-01-31" });

    const registrar = async (nome: string, nascimento: string | null, cpf: string | null = cpfAleatorio()) =>
      (await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: nome, cpf, dataNascimento: nascimento })).abrigado.id;
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) ids.push(await registrar(`Adulto Teste FIDE ${i}`, "1990-05-10"));
    ids.push(await registrar("Criança Teste FIDE", "2015-03-01"));
    ids.push(await registrar("Idosa Teste FIDE", "1950-08-20"));

    // Uma pessoa que saiu e voltou (mesmo CPF, dois cadastros) conta uma vez.
    const cpfReentrada = cpfAleatorio();
    const primeira = await registrar("Reentrada Teste FIDE", "1985-01-01", cpfReentrada);
    await desligarAbrigado(coordenador, primeira, { motivo: "Voltou para casa" });
    const segunda = await registrar("Reentrada Teste FIDE", "1985-01-01", cpfReentrada);

    // Transferida para outro abrigo: continua uma pessoa só no consolidado.
    await transferirAbrigado(coordenador, ids[0]!, { idAbrigoDestino: outro.id, motivo: "Teste" });

    // Leva as estadias para janeiro de 2020.
    await consultar("UPDATE abrigado SET data_entrada = '2020-01-05 12:00-03' WHERE id = ANY($1::int[])", [ids]);
    await consultar("UPDATE abrigado SET data_entrada = '2020-01-03 12:00-03', data_saida = '2020-01-08 12:00-03' WHERE id = $1", [primeira]);
    await consultar("UPDATE abrigado SET data_entrada = '2020-01-20 12:00-03' WHERE id = $1", [segunda]);

    const r = await gerarSubsidiosFide(dc, { idEvento: evento.id });
    expect(r.periodo).toEqual({ inicio: "2020-01-01", fim: "2020-01-31" });
    expect(r.evento).toMatchObject({ cobrade: "1.2.1.0.0", emCurso: false });
    expect(r.danosHumanos.desabrigados).toBe(9);
    // De 05/01 a 07/01 estão as 8 + a reentrada (1ª estadia): pico de 9.
    expect(r.danosHumanos.pico).toEqual({ data: "2020-01-05", pessoas: 9 });

    const faixa = (chave: string) => r.danosHumanos.faixasEtarias.find((f) => f.chave === chave)!.pessoas;
    expect(faixa("adultos")).toBe(7); // 6 adultos + a pessoa da reentrada
    expect(faixa("criancas")).toBeNull(); // 1 criança: "menos de 5"
    expect(faixa("idosos")).toBeNull();
    expect(faixa("naoInformado")).toBe(0);

    // LGPD: nenhum nome nem CPF sai no relatório.
    const json = JSON.stringify(r);
    expect(json).not.toContain("Teste FIDE");
    expect(json).not.toContain(cpfReentrada);
    const csv = montarCsvFide(r);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("menos de 5");
    expect(csv).toContain("1.2.1.0.0 Inundações");
  });

  it("assistência humanitária desconta estornos, e só entram ocorrências aprovadas", async () => {
    const { abrigo, voluntario, coordenador } = await criarCenario();
    const dc = await defesaCivil();
    const evento = await criarEvento(dc, { nome: "Evento em curso de teste", cobrade: "1.3.2.1.5", inicio: hojeBrasilia() });
    const sabonete = await idItem("Sabonete");

    await movimentarEstoque(voluntario, abrigo.id, sabonete, { quantidade: 50 });
    await movimentarEstoque(voluntario, abrigo.id, sabonete, { quantidade: -20 });
    const desfeita = await movimentarEstoque(voluntario, abrigo.id, sabonete, { quantidade: -5 });
    await estornarMovimentacao(voluntario, abrigo.id, desfeita.movimentacao!.id, {});
    await movimentarEstoque(voluntario, abrigo.id, sabonete, { tipo: "PERDA", quantidade: -3 });

    await registrarOcorrencia(coordenador, abrigo.id, { tipo: "SEM_AGUA" });
    const reporte = await registrarReporteCidadao({ idAbrigo: abrigo.id, tipo: "ALAGAMENTO", descricao: "Falso alarme", latitude: -28.26, longitude: -52.4 });
    await moderarOcorrencia(coordenador, abrigo.id, reporte.id, { acao: "REJEITAR" });

    // Sem pedir abrigo, a coordenação recebe o do próprio abrigo.
    const r = await gerarSubsidiosFide(coordenador, { idEvento: evento.id });
    expect(r.escopo.abrigo?.id).toBe(abrigo.id);
    expect(r.danosHumanos.pico).toBeNull(); // pico só no consolidado
    expect(r.assistenciaHumanitaria).toEqual([
      expect.objectContaining({ item: "Sabonete", distribuido: 20, doacoesRecebidas: 50, perdas: 3 }),
    ]);
    expect(r.ocorrencias).toEqual([
      expect.objectContaining({ tipo: "SEM_AGUA", registradas: 1, aindaAtivas: 1, campoFide: "Prejuízos públicos: abastecimento de água potável" }),
    ]);
  });

  it("respeita o escopo: coordenação não gera de outro abrigo; voluntário não gera", async () => {
    const { coordenador, voluntario } = await criarCenario();
    const outro = await criarAbrigo();
    const dc = await defesaCivil();
    const evento = await criarEvento(dc, { nome: "Escopo de teste", cobrade: "1.2.3.0.0", inicio: hojeBrasilia() });

    expect((await capturarErro(gerarSubsidiosFide(coordenador, { idEvento: evento.id, idAbrigo: outro.id }))).status).toBe(403);
    expect((await capturarErro(gerarSubsidiosFide(voluntario, { idEvento: evento.id }))).status).toBe(403);
    expect((await gerarSubsidiosFide(dc, { idEvento: evento.id, idAbrigo: outro.id })).escopo.abrigo?.id).toBe(outro.id);
  });
});

describe("Prestação de contas", () => {
  it("exporta movimentações e eventos críticos, neutraliza fórmulas e grava o SHA-256 na auditoria", async () => {
    const { abrigo, voluntario, coordenador, usuarios } = await criarCenario();
    const agua = await idItem("Água Mineral 500 ml");
    await movimentarEstoque(voluntario, abrigo.id, agua, { quantidade: 30, observacao: "=HIPERLINK(\"http://golpe\")" });
    await movimentarEstoque(voluntario, abrigo.id, agua, { quantidade: -10 });

    const hoje = hojeBrasilia();
    const exportacao = await gerarPrestacaoContas(coordenador, { inicio: hoje, fim: hoje });

    expect(exportacao.sha256).toBe(sha256(exportacao.csv));
    expect(exportacao.linhas).toBe(2);
    expect(exportacao.nomeArquivo).toBe(`prestacao-contas_abrigo-${abrigo.id}_${hoje}_${hoje}.csv`);
    expect(exportacao.csv).toContain("ENTRADA_DOACAO");
    expect(exportacao.csv).toContain("SAIDA_CONSUMO");
    expect(exportacao.csv).toContain("'=HIPERLINK");
    expect(exportacao.csv).not.toMatch(/;=HIPERLINK/);

    const logs = await logsDoUsuario(usuarios.coordenador.id);
    const registro = logs.find((l) => l.acao === "PRESTACAO_CONTAS_EXPORTADA");
    expect(registro?.detalhes).toMatchObject({ sha256: exportacao.sha256, linhas: 2, idAbrigo: abrigo.id });
  });

  it("valida o período e o escopo", async () => {
    const { coordenador } = await criarCenario();
    const outro = await criarAbrigo();
    const periodo = (inicio: string, fim: string) => capturarErro(Promise.resolve().then(() => validar(esquemaPrestacaoContas, { inicio, fim })));
    expect((await periodo("2026-11-10", "2026-11-01")).status).toBe(400);
    expect((await periodo("2024-01-01", "2026-01-01")).status).toBe(400);
    expect((await capturarErro(gerarPrestacaoContas(coordenador, { inicio: "2026-11-01", fim: "2026-11-02", idAbrigo: outro.id }))).status).toBe(403);
  });
});
