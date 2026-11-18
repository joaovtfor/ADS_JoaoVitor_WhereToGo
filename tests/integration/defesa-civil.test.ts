import { describe, expect, it } from "vitest";
import { consultar, consultarUm } from "@/lib/db";
import { validar } from "@/lib/http";
import { atualizarAbrigo, listarAbrigos, obterDashboard } from "@/modules/abrigos/abrigos.service";
import { listarLogs } from "@/modules/auditoria/auditoria.service";
import { movimentarEstoque } from "@/modules/estoque/estoque.service";
import {
  esquemaRegistrarOcorrenciaRegional,
  listarOcorrenciasRegionais,
  registrarOcorrencia,
  registrarOcorrenciaRegional,
  resolverOcorrencia,
  resolverOcorrenciaRegional,
} from "@/modules/ocorrencias/ocorrencias.service";
import { consultarLinhasAbrigosPublicos, listarAlertasPublicos } from "@/modules/publico/publico.service";
import { criarUsuario as criarUsuarioService, listarUsuarios } from "@/modules/usuarios/usuarios.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario, idItem } from "./fixtures";

/** Quadrado de ~400 m em volta de um ponto (vértices em ordem). */
function quadradoEmVolta(lat: number, lng: number) {
  const d = 0.002;
  return [
    { lat: lat + d, lng: lng - d },
    { lat: lat + d, lng: lng + d },
    { lat: lat - d, lng: lng + d },
    { lat: lat - d, lng: lng - d },
  ];
}

async function defesaCivil() {
  return contexto(await criarUsuario("DEFESA_CIVIL", null));
}

describe("Papel DEFESA_CIVIL (Etapa 2)", () => {
  it("não tem vínculo com abrigo (trigger fn_validar_vinculo_usuario)", async () => {
    const abrigo = await criarAbrigo();
    const erro = await capturarErro(criarUsuario("DEFESA_CIVIL", abrigo.id));
    expect(erro).toMatchObject({ status: 422, codigo: "VINCULO_INVALIDO" });
    expect(erro.message).toContain("DEFESA_CIVIL");
    expect((await defesaCivil()).usuario.idAbrigo).toBeNull();
  });

  it("ADMIN cria conta da Defesa Civil sem abrigo; coordenador não cria", async () => {
    const { admin, coordenador, abrigo } = await criarCenario();
    const dados = { nome: "Defesa Civil PF", email: `dc.${Date.now()}@teste.local`, papel: "DEFESA_CIVIL" as const };

    expect((await capturarErro(criarUsuarioService(admin, { ...dados, idAbrigo: abrigo.id }))).codigo).toBe("VINCULO_INVALIDO");
    const criado = await criarUsuarioService(admin, dados);
    expect(criado).toMatchObject({ papel: "DEFESA_CIVIL", idAbrigo: null });

    expect((await capturarErro(criarUsuarioService(coordenador, { ...dados, email: `outro.${Date.now()}@teste.local` }))).status).toBe(403);
  });

  it("vê todos os abrigos, o painel de qualquer um e a auditoria de toda a rede", async () => {
    const [a, b] = [await criarAbrigo(), await criarAbrigo()];
    const dc = await defesaCivil();

    const ids = (await listarAbrigos(dc, {})).map((abrigo) => abrigo.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect((await obterDashboard(dc, b.id)).abrigo.id).toBe(b.id);
    await expect(listarLogs(dc, { idAbrigo: a.id }, { pagina: 1, tamanho: 10 })).resolves.toBeDefined();
  });

  it("não administra a plataforma nem opera o abrigo: PIX, usuários e lançamento de estoque dão 403", async () => {
    const { abrigo } = await criarCenario();
    const dc = await defesaCivil();

    expect((await capturarErro(atualizarAbrigo(dc, abrigo.id, { chavePix: "golpe@pix", titularPix: "Golpista" }))).status).toBe(403);
    expect((await capturarErro(atualizarAbrigo(dc, abrigo.id, { capacidadeMaxima: 10 }))).status).toBe(403);
    expect((await capturarErro(listarUsuarios(dc, {}, { pagina: 1, tamanho: 10 }))).status).toBe(403);
    expect((await capturarErro(movimentarEstoque(dc, abrigo.id, await idItem("Água Potável 5 L"), { quantidade: 1 }))).status).toBe(403);
  });

  it("modera e resolve ocorrências de qualquer abrigo", async () => {
    const { abrigo, coordenador } = await criarCenario();
    const dc = await defesaCivil();
    const { ocorrencia } = await registrarOcorrencia(coordenador, abrigo.id, { tipo: "SEM_AGUA" });

    const resolvida = await resolverOcorrencia(dc, abrigo.id, ocorrencia.id, { observacao: "Caminhão-pipa enviado" });
    expect(resolvida.ocorrencia.ativa).toBe(false);
  });
});

describe("Ocorrências regionais (sem abrigo)", () => {
  it("Defesa Civil registra via interditada no município; aparece no mapa sem abrigo e é encerrada", async () => {
    const dc = await defesaCivil();
    const { ocorrencia } = await registrarOcorrenciaRegional(dc, {
      tipo: "VIA_BLOQUEADA",
      descricao: "Ponte interditada para vistoria",
      latitude: -28.2481,
      longitude: -52.3711,
    });
    expect(ocorrencia).toMatchObject({ idAbrigo: null, statusValidacao: "APROVADA", gravidade: "CRITICO", ativa: true });

    expect((await listarOcorrenciasRegionais(dc, { ativas: true })).map((o) => o.id)).toContain(ocorrencia.id);
    const publico = (await listarAlertasPublicos()).find((a) => a.id === ocorrencia.id);
    expect(publico).toMatchObject({ abrigo: null, descricaoTipo: "Via interditada", localizacaoPropria: true, latitude: -28.2481, longitude: -52.3711 });

    await resolverOcorrenciaRegional(dc, ocorrencia.id, { observacao: "Ponte liberada" });
    expect((await listarAlertasPublicos()).some((a) => a.id === ocorrencia.id)).toBe(false);
    expect((await capturarErro(resolverOcorrenciaRegional(dc, ocorrencia.id, {}))).codigo).toBe("OCORRENCIA_JA_RESOLVIDA");
  });

  it("área de risco regional marca os abrigos dentro dela, sem mudar o status de infraestrutura", async () => {
    const dentro = await criarAbrigo({ latitude: -28.2, longitude: -52.3 });
    const fora = await criarAbrigo({ latitude: -28.3, longitude: -52.5 });
    const dc = await defesaCivil();

    await registrarOcorrenciaRegional(dc, { tipo: "AREA_RISCO", gravidade: "CRITICO", poligono: quadradoEmVolta(-28.2, -52.3) });

    const linhas = await consultarLinhasAbrigosPublicos({});
    const linhaDentro = linhas.find((l) => l.id === dentro.id)!;
    const linhaFora = linhas.find((l) => l.id === fora.id)!;
    expect(linhaDentro).toMatchObject({ emAreaDeRisco: true, statusInfraestrutura: "NORMAL" });
    expect(linhaFora.emAreaDeRisco).toBe(false);
  });

  it("só ADMIN e Defesa Civil registram; coordenador e voluntário consultam", async () => {
    const { admin, coordenador, voluntario } = await criarCenario();
    const dados = { tipo: "ALAGAMENTO" as const, latitude: -28.26, longitude: -52.4 };

    expect((await registrarOcorrenciaRegional(admin, dados)).ocorrencia.idAbrigo).toBeNull();
    expect((await capturarErro(registrarOcorrenciaRegional(coordenador, dados))).status).toBe(403);
    expect((await capturarErro(registrarOcorrenciaRegional(voluntario, dados))).status).toBe(403);
    await expect(listarOcorrenciasRegionais(voluntario, {})).resolves.toBeInstanceOf(Array);
  });

  it("só aceita tipos do território e exige local (API e CHECK do banco)", async () => {
    expect((await capturarErro(Promise.resolve().then(() => validar(esquemaRegistrarOcorrenciaRegional, { tipo: "SEM_ENERGIA", latitude: -28.2, longitude: -52.3 })))).status).toBe(400);
    expect((await capturarErro(Promise.resolve().then(() => validar(esquemaRegistrarOcorrenciaRegional, { tipo: "VIA_BLOQUEADA" })))).status).toBe(400);

    // Mesmo escrevendo direto no banco, a regra vale (CHECK ocorrencia_infraestrutura_regional_ck).
    const dc = await defesaCivil();
    for (const [tipo, lat, lng] of [
      ["RISCO_ESTRUTURAL", -28.2, -52.3],
      ["VIA_BLOQUEADA", null, null],
    ] as const) {
      const erro = await capturarErro(
        consultar(
          `INSERT INTO ocorrencia_infraestrutura (id_abrigo, id_usuario_registro, tipo, gravidade, latitude, longitude)
           VALUES (NULL, $1, $2, 'CRITICO', $3, $4)`,
          [dc.usuario.id, tipo, lat, lng],
        ),
      );
      expect(erro.status).toBe(422);
    }
  });

  it("encerrar pela rota do abrigo não alcança uma ocorrência regional", async () => {
    const { abrigo, admin } = await criarCenario();
    const { ocorrencia } = await registrarOcorrenciaRegional(admin, { tipo: "DESLIZAMENTO", latitude: -28.25, longitude: -52.41 });

    expect((await capturarErro(resolverOcorrencia(admin, abrigo.id, ocorrencia.id, {}))).status).toBe(404);
    const linha = await consultarUm<{ ativa: boolean }>("SELECT data_resolucao IS NULL AS ativa FROM ocorrencia_infraestrutura WHERE id = $1", [
      ocorrencia.id,
    ]);
    expect(linha?.ativa).toBe(true);
  });
});
