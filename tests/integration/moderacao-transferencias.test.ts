import { describe, expect, it } from "vitest";
import { consultar, consultarUm } from "@/lib/db";
import { validar } from "@/lib/http";
import { esquemaTransferenciaLote, registrarEntrada, transferirAbrigadosEmLote } from "@/modules/abrigados/abrigados.service";
import { obterDashboard } from "@/modules/abrigos/abrigos.service";
import { classificarItem, movimentarEstoque } from "@/modules/estoque/estoque.service";
import { listarOcorrencias, registrarOcorrencia, registrarOcorrenciaRegional } from "@/modules/ocorrencias/ocorrencias.service";
import { registrarReporteCidadao } from "@/modules/publico/publico.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario, idItem } from "./fixtures";

// Etapa 3 do plano de integração (.specs/plano-integracao-defesa-civil.md §4.3).
// O banco de testes é compartilhado entre os arquivos: cada teste usa um ponto
// do mapa longe dos demais (e um item que nenhum outro teste usa) para as
// contagens espaciais não pegarem dados alheios.

/** Desloca um ponto `metros` para o norte (1° de latitude ≈ 111 km). */
const aoNorte = (lat: number, metros: number) => lat + metros / 111_000;

async function reportar(idAbrigo: number, tipo: "ALAGAMENTO" | "VIA_BLOQUEADA", latitude: number, longitude: number) {
  const reporte = await registrarReporteCidadao({ idAbrigo, tipo, descricao: "Relato de teste", latitude, longitude });
  return reporte.id;
}

describe("Corroboração comunitária na moderação", () => {
  it("conta relatos iguais a até 300 m e alertas já publicados, e ordena a fila pelos mais corroborados", async () => {
    const [lat, lng] = [-29.9, -51.1];
    const abrigo = await criarAbrigo({ latitude: lat, longitude: lng });
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));

    const isolado = await reportar(abrigo.id, "VIA_BLOQUEADA", aoNorte(lat, 2000), lng);
    const a = await reportar(abrigo.id, "ALAGAMENTO", lat, lng);
    const b = await reportar(abrigo.id, "ALAGAMENTO", aoNorte(lat, 150), lng);
    const c = await reportar(abrigo.id, "ALAGAMENTO", aoNorte(lat, 280), lng);
    const longe = await reportar(abrigo.id, "ALAGAMENTO", aoNorte(lat, 900), lng);
    // Mesmo tipo e mesmo lugar, mas outro tipo de ocorrência não conta.
    await reportar(abrigo.id, "VIA_BLOQUEADA", aoNorte(lat, 100), lng);
    // Um alerta igual já publicado pelo coordenador a 200 m de "a".
    await registrarOcorrencia(coordenador, abrigo.id, { tipo: "ALAGAMENTO", latitude: aoNorte(lat, -200), longitude: lng });

    const lista = await listarOcorrencias(coordenador, abrigo.id, { ativas: true });
    const porId = new Map(lista.map((o) => [o.id, o]));

    expect(porId.get(a)).toMatchObject({ relatosProximos: 2, confirmadosProximos: 1 });
    // b está a 350 m do alerta publicado: fora do raio.
    expect(porId.get(b)).toMatchObject({ relatosProximos: 2, confirmadosProximos: 0 });
    // c está a 280 m de a e 130 m de b, mas a 480 m do alerta publicado.
    expect(porId.get(c)).toMatchObject({ relatosProximos: 2, confirmadosProximos: 0 });
    expect(porId.get(longe)).toMatchObject({ relatosProximos: 0, confirmadosProximos: 0 });
    expect(porId.get(isolado)).toMatchObject({ relatosProximos: 0, confirmadosProximos: 0 });

    // Pendentes primeiro e, entre eles, os mais corroborados (a: 3; b e c: 2; isolados: 0).
    const pendentes = lista.filter((o) => o.statusValidacao === "PENDENTE").map((o) => o.id);
    expect(pendentes[0]).toBe(a);
    expect(pendentes.slice(1, 3).sort()).toEqual([b, c].sort());
    expect(pendentes.indexOf(c)).toBeLessThan(pendentes.indexOf(longe));
  });

  it("só considera relatos pendentes feitos até 2 h antes ou depois", async () => {
    const [lat, lng] = [-29.95, -51.2];
    const abrigo = await criarAbrigo({ latitude: lat, longitude: lng });
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));

    const agora = await reportar(abrigo.id, "ALAGAMENTO", lat, lng);
    const antigo = await reportar(abrigo.id, "ALAGAMENTO", aoNorte(lat, 50), lng);
    await consultar("UPDATE ocorrencia_infraestrutura SET data_registro = now() - interval '5 hours' WHERE id = $1", [antigo]);

    const lista = await listarOcorrencias(coordenador, abrigo.id, { ativas: true });
    expect(lista.find((o) => o.id === agora)).toMatchObject({ relatosProximos: 0 });
  });
});

describe("Rota bloqueada nas sugestões de troca", () => {
  it("marca a sugestão cujo trajeto direto cruza uma área de risco ativa e a manda para o fim", async () => {
    const papel = await idItem("Papel Higiênico");
    const { abrigo: aqui, coordenador, voluntario } = await criarCenario();
    await consultar("UPDATE abrigo SET latitude = -29.8, longitude = -51.3 WHERE id = $1", [aqui.id]);
    const parceiro = await criarAbrigo({ latitude: -29.8, longitude: -51.26 });
    const volParceiro = contexto(await criarUsuario("VOLUNTARIO", parceiro.id));
    const coordParceiro = contexto(await criarUsuario("COORDENADOR", parceiro.id));

    await movimentarEstoque(voluntario, aqui.id, papel, { quantidade: 2 });
    await classificarItem(coordenador, aqui.id, papel, { quantidadeMinima: 30, statusNecessidade: "URGENTE" });
    await movimentarEstoque(volParceiro, parceiro.id, papel, { quantidade: 90 });
    await classificarItem(coordParceiro, parceiro.id, papel, { quantidadeMinima: 10, statusNecessidade: "NORMAL" });

    const sugestao = async () =>
      (await obterDashboard(coordenador, aqui.id)).sugestoesTransferencia.find((s) => s.idItem === papel && s.idAbrigoParceiro === parceiro.id);

    expect(await sugestao()).toMatchObject({ direcao: "RECEBER", rotaBloqueada: false });

    // Área de risco regional bem no meio do caminho (entre as longitudes -51.3 e -51.26).
    const admin = contexto(await criarUsuario("ADMIN", null));
    await registrarOcorrenciaRegional(admin, {
      tipo: "AREA_RISCO",
      poligono: [
        { lat: -29.79, lng: -51.285 },
        { lat: -29.79, lng: -51.275 },
        { lat: -29.81, lng: -51.275 },
        { lat: -29.81, lng: -51.285 },
      ],
    });
    expect(await sugestao()).toMatchObject({ rotaBloqueada: true });
  });
});

describe("Transferência de acolhidos em lote", () => {
  async function cenarioComTresPessoas(capacidadeDestino: number) {
    const { abrigo: origem, coordenador, voluntario } = await criarCenario();
    const destino = await criarAbrigo({ capacidade: capacidadeDestino });
    const ids: number[] = [];
    for (const nome of ["Pessoa Lote A", "Pessoa Lote B", "Pessoa Lote C"]) {
      ids.push((await registrarEntrada(voluntario, origem.id, { nomeCompleto: nome })).abrigado.id);
    }
    return { origem, destino, coordenador, ids };
  }

  const lotacao = async (id: number) => (await consultarUm<{ lotacao: number }>("SELECT lotacao_atual AS lotacao FROM abrigo WHERE id = $1", [id]))!.lotacao;

  it("transfere todos numa transação, com histórico e lotação dos dois abrigos atualizados", async () => {
    const { origem, destino, coordenador, ids } = await cenarioComTresPessoas(10);
    const resultado = await transferirAbrigadosEmLote(coordenador, origem.id, { idsAbrigados: ids, idAbrigoDestino: destino.id, motivo: "Evacuação preventiva" });

    expect(resultado).toMatchObject({ transferidos: 3, destino: { id: destino.id } });
    expect(await lotacao(origem.id)).toBe(0);
    expect(await lotacao(destino.id)).toBe(3);
    const historico = await consultar("SELECT 1 FROM transferencia_abrigado WHERE id_abrigado = ANY($1::int[]) AND motivo = 'Evacuação preventiva'", [ids]);
    expect(historico).toHaveLength(3);
  });

  it("é tudo ou nada: sem vaga para todos, ninguém é transferido", async () => {
    const { origem, destino, coordenador, ids } = await cenarioComTresPessoas(2);
    const erro = await capturarErro(transferirAbrigadosEmLote(coordenador, origem.id, { idsAbrigados: ids, idAbrigoDestino: destino.id, motivo: "Teste" }));
    expect(erro).toMatchObject({ status: 409, codigo: "VAGAS_INSUFICIENTES" });
    expect(await lotacao(origem.id)).toBe(3);
    expect(await lotacao(destino.id)).toBe(0);
  });

  it("recusa o lote inteiro se alguém já não está mais no abrigo de origem", async () => {
    const { origem, destino, coordenador, ids } = await cenarioComTresPessoas(10);
    const outro = await criarAbrigo();
    await transferirAbrigadosEmLote(coordenador, origem.id, { idsAbrigados: [ids[0]!], idAbrigoDestino: outro.id, motivo: "Antes" });

    const erro = await capturarErro(transferirAbrigadosEmLote(coordenador, origem.id, { idsAbrigados: ids, idAbrigoDestino: destino.id, motivo: "Depois" }));
    expect(erro).toMatchObject({ status: 409, codigo: "ABRIGADOS_INDISPONIVEIS" });
    expect(await lotacao(origem.id)).toBe(2);
    expect(await lotacao(destino.id)).toBe(0);
  });

  it("respeita o RBAC: coordenador só do próprio abrigo, voluntário não, Defesa Civil de qualquer um", async () => {
    const { origem, destino, ids } = await cenarioComTresPessoas(10);
    const coordenadorDeOutro = contexto(await criarUsuario("COORDENADOR", destino.id));
    const voluntario = contexto(await criarUsuario("VOLUNTARIO", origem.id));
    const defesaCivil = contexto(await criarUsuario("DEFESA_CIVIL", null));
    const dados = { idsAbrigados: ids, idAbrigoDestino: destino.id, motivo: "Remanejamento" };

    expect((await capturarErro(transferirAbrigadosEmLote(coordenadorDeOutro, origem.id, dados))).status).toBe(403);
    expect((await capturarErro(transferirAbrigadosEmLote(voluntario, origem.id, dados))).status).toBe(403);
    expect((await transferirAbrigadosEmLote(defesaCivil, origem.id, dados)).transferidos).toBe(3);
  });

  it("valida a entrada: lista vazia, repetida ou destino igual à origem", async () => {
    const validarLote = (dados: unknown) => capturarErro(Promise.resolve().then(() => validar(esquemaTransferenciaLote, dados)));
    expect((await validarLote({ idsAbrigados: [], idAbrigoDestino: 2, motivo: "x" })).status).toBe(400);
    expect((await validarLote({ idsAbrigados: [1, 1], idAbrigoDestino: 2, motivo: "x" })).status).toBe(400);

    const { origem, coordenador, ids } = await cenarioComTresPessoas(10);
    expect((await capturarErro(transferirAbrigadosEmLote(coordenador, origem.id, { idsAbrigados: ids, idAbrigoDestino: origem.id, motivo: "x" }))).status).toBe(400);
  });
});
