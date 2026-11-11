import { describe, expect, it } from "vitest";
import { validar } from "@/lib/http";
import { registrarEntrada } from "@/modules/abrigados/abrigados.service";
import {
  ajustarNaoTriados,
  atualizarAbrigo,
  criarAbrigo as criarAbrigoService,
  esquemaCriarAbrigo,
  listarAbrigos,
  obterDashboard,
} from "@/modules/abrigos/abrigos.service";
import { classificarItem, movimentarEstoque } from "@/modules/estoque/estoque.service";
import {
  esquemaRegistrarOcorrencia,
  moderarOcorrencia,
  registrarOcorrencia,
  resolverOcorrencia,
} from "@/modules/ocorrencias/ocorrencias.service";
import { consultar, consultarUm } from "@/lib/db";
import {
  buscarFamiliaresAcolhidosPublico,
  listarAbrigosPublicos,
  listarAlertasPublicos,
  paraGeoJson,
  registrarReporteCidadao,
} from "@/modules/publico/publico.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario, idItem } from "./fixtures";

/** O ponto do rótulo (latitude/longitude) está dentro do polígono da área de risco? */
async function dentroDaArea(idOcorrencia: number): Promise<boolean> {
  const linha = await consultarUm<{ dentro: boolean }>(
    `SELECT ST_Covers(area_risco, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) AS dentro
       FROM ocorrencia_infraestrutura WHERE id = $1`,
    [idOcorrencia],
  );
  return linha!.dentro;
}

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

  it("valida e normaliza a chave PIX oficial", () => {
    const comChave = (chavePix: string) => validar(esquemaCriarAbrigo, { ...NOVO_ABRIGO, chavePix, titularPix: "Entidade" });

    expect(comChave(" Doacoes@Abrigo.ORG ").chavePix).toBe("doacoes@abrigo.org");
    expect(comChave("529.982.247-25").chavePix).toBe("52998224725");
    expect(comChave("+55 (54) 99999-0000").chavePix).toBe("+5554999990000");
    expect(() => comChave("golpe@pix")).toThrow();
    expect(() => comChave("123.456.789-00")).toThrow();
  });
});

describe("RF04 - Fila de triagem em massa", () => {
  it("soma toques simultâneos no banco, sem perder nenhum", async () => {
    const { abrigo, coordenador, admin } = await criarCenario({ capacidade: 10 });

    await Promise.all([
      ajustarNaoTriados(coordenador, abrigo.id, { delta: 1 }),
      ajustarNaoTriados(admin, abrigo.id, { delta: 1 }),
      ajustarNaoTriados(coordenador, abrigo.id, { delta: 1 }),
    ]);
    const depois = await ajustarNaoTriados(coordenador, abrigo.id, { delta: -1 });
    expect(depois).toMatchObject({ acolhidosNaoTriados: 2, lotacaoAtual: 2 });
  });

  it("não deixa a fila negativa nem ultrapassa a capacidade; voluntário não ajusta", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario({ capacidade: 2 });

    expect((await capturarErro(ajustarNaoTriados(coordenador, abrigo.id, { delta: -1 }))).codigo).toBe("NAO_TRIADOS_INVALIDO");
    expect((await capturarErro(ajustarNaoTriados(coordenador, abrigo.id, { delta: 3 }))).codigo).toBe("ABRIGO_LOTADO");
    expect((await capturarErro(ajustarNaoTriados(voluntario, abrigo.id, { delta: 1 }))).status).toBe(403);
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

  it("demarca área de risco poligonal com ao menos 3 marcadores e exporta GeoJSON Polygon", async () => {
    const { abrigo, coordenador } = await criarCenario();

    // Exige ao menos 3 vértices para AREA_RISCO
    expect(
      (
        await capturarErro(
          Promise.resolve().then(() =>
            validar(esquemaRegistrarOcorrencia, {
              tipo: "AREA_RISCO",
              poligono: [
                { lat: -28.25, lng: -52.4 },
                { lat: -28.26, lng: -52.41 },
              ],
            }),
          ),
        )
      ).status,
    ).toBe(400);

    const vertices = [
      { lat: -28.25, lng: -52.4 },
      { lat: -28.26, lng: -52.4 },
      { lat: -28.255, lng: -52.415 },
    ];

    const areaRisco = await registrarOcorrencia(coordenador, abrigo.id, {
      tipo: "AREA_RISCO",
      descricao: "Encosta com risco de deslizamento",
      poligono: vertices,
    });

    expect(areaRisco.statusInfraestrutura).toBe("CRITICO");
    expect(areaRisco.ocorrencia.poligono).toEqual(vertices);
    expect(await dentroDaArea(areaRisco.ocorrencia.id)).toBe(true);

    const alertas = await listarAlertasPublicos();
    const alertaPublico = alertas.find((a) => a.id === areaRisco.ocorrencia.id);
    expect(alertaPublico).toBeDefined();
    expect(alertaPublico?.poligono).toEqual(vertices);

    const geojson = paraGeoJson([alertaPublico!]);
    expect(geojson.features[0].geometry.type).toBe("Polygon");
    // Anel linear fechado no padrão RFC 7946: 4 pares [lng, lat] (primeiro = último)
    expect(geojson.features[0].geometry.coordinates[0]).toHaveLength(4);
  });

  it("posiciona o rótulo dentro de área côncava e liga pontos marcados fora de ordem", async () => {
    const { abrigo, coordenador } = await criarCenario();

    // "U": a média dos vértices cai no vão, fora da área.
    const emU = [
      { lat: -28.25, lng: -52.42 },
      { lat: -28.25, lng: -52.41 },
      { lat: -28.27, lng: -52.41 },
      { lat: -28.27, lng: -52.412 },
      { lat: -28.252, lng: -52.412 },
      { lat: -28.252, lng: -52.418 },
      { lat: -28.27, lng: -52.418 },
      { lat: -28.27, lng: -52.42 },
    ];
    const concava = await registrarOcorrencia(coordenador, abrigo.id, { tipo: "AREA_RISCO", poligono: emU });
    expect(await dentroDaArea(concava.ocorrencia.id)).toBe(true);

    // Os 4 cantos de uma quadra marcados em "Z" (bordas se cruzando): vira o retângulo pretendido.
    const emZ = [
      { lat: -28.25, lng: -52.42 },
      { lat: -28.26, lng: -52.41 },
      { lat: -28.25, lng: -52.41 },
      { lat: -28.26, lng: -52.42 },
    ];
    const corrigida = await registrarOcorrencia(coordenador, abrigo.id, { tipo: "AREA_RISCO", poligono: emZ });
    expect(corrigida.ocorrencia.poligono).toHaveLength(4);
    expect(new Set(corrigida.ocorrencia.poligono!.map((p) => `${p.lat},${p.lng}`))).toEqual(new Set(emZ.map((p) => `${p.lat},${p.lng}`)));
    expect(await dentroDaArea(corrigida.ocorrencia.id)).toBe(true);
    const [{ valida, areaM2 }] = await consultar<{ valida: boolean; areaM2: number }>(
      `SELECT ST_IsValid(area_risco::geometry) AS valida, ST_Area(area_risco) AS "areaM2"
         FROM ocorrencia_infraestrutura WHERE id = $1`,
      [corrigida.ocorrencia.id],
    );
    expect(valida).toBe(true);
    expect(areaM2).toBeGreaterThan(1_000_000); // ~1,1 km x 0,98 km, não dois triângulos

    // Pontos alinhados não formam área: continua recusado com mensagem clara.
    const alinhados = [
      { lat: -28.25, lng: -52.42 },
      { lat: -28.255, lng: -52.415 },
      { lat: -28.26, lng: -52.41 },
    ];
    const erro = await capturarErro(registrarOcorrencia(coordenador, abrigo.id, { tipo: "AREA_RISCO", poligono: alinhados }));
    expect(erro).toMatchObject({ status: 422, codigo: "POLIGONO_INVALIDO" });
  });

  it("marca no mapa público o abrigo que fica dentro de uma área de risco ativa", async () => {
    // Coordenada exclusiva: os demais testes criam abrigos no ponto padrão.
    const [lat, lng] = [-29.6841, -51.1302];
    const abrigo = await criarAbrigo({ latitude: lat, longitude: lng });
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));
    const emVolta = [
      { lat: lat + 0.001, lng: lng - 0.001 },
      { lat: lat + 0.001, lng: lng + 0.001 },
      { lat: lat - 0.001, lng: lng + 0.001 },
      { lat: lat - 0.001, lng: lng - 0.001 },
    ];
    const area = await registrarOcorrencia(coordenador, abrigo.id, { tipo: "AREA_RISCO", poligono: emVolta });

    const estaNaArea = async () => (await listarAbrigosPublicos({ formato: "json" })).find((a) => a.id === abrigo.id)?.emAreaDeRisco;
    expect(await estaNaArea()).toBe(true);
    await resolverOcorrencia(coordenador, abrigo.id, area.ocorrencia.id, {});
    expect(await estaNaArea()).toBe(false);
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

describe("Semana 7 - Melhorias Comparativas (Pets/PCD, Busca Familiar LGPD, ST_Intersects, Rebalanceamento e Reporte Cidadão)", () => {
  it("atualiza e filtra abrigos públicos por tags de perfil (Aceita Pets e Acessível PCD)", async () => {
    const { abrigo, coordenador } = await criarCenario();

    const atualizado = await atualizarAbrigo(coordenador, abrigo.id, {
      aceitaPets: true,
      acessivelPcd: true,
    });
    expect(atualizado).toMatchObject({ aceitaPets: true, acessivelPcd: true });

    const listaPets = await listarAbrigosPublicos({ formato: "json", aceitaPets: true });
    expect(listaPets.some((a) => a.id === abrigo.id && a.aceitaPets && a.acessivelPcd)).toBe(true);
  });

  it("detecta via PostGIS ST_Intersects quando o trajeto em linha reta cruza um polígono de área de risco", async () => {
    // Coordenada exclusiva: usuário ao norte (-27.20, -50.40), abrigo ao sul (-27.30, -50.40) e polígono de risco no meio (-27.25)
    const abrigo = await criarAbrigo({ latitude: -27.30, longitude: -50.40 });
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));

    const poligonoNoCaminho = [
      { lat: -27.245, lng: -50.41 },
      { lat: -27.245, lng: -50.39 },
      { lat: -27.255, lng: -50.39 },
      { lat: -27.255, lng: -50.41 },
    ];
    const ocorrencia = await registrarOcorrencia(coordenador, abrigo.id, {
      tipo: "AREA_RISCO",
      poligono: poligonoNoCaminho,
    });

    const comCruzamento = await listarAbrigosPublicos({
      formato: "json",
      lat: -27.20,
      lng: -50.40,
    });
    const alvo = comCruzamento.find((a) => a.id === abrigo.id);
    expect(alvo?.emAreaDeRisco).toBe(false);
    expect(alvo?.rotaCruzaAreaRisco).toBe(true);

    await resolverOcorrencia(coordenador, abrigo.id, ocorrencia.ocorrencia.id, {});
    const aposResolver = await listarAbrigosPublicos({
      formato: "json",
      lat: -27.20,
      lng: -50.40,
    });
    expect(aposResolver.find((a) => a.id === abrigo.id)?.rotaCruzaAreaRisco).toBe(false);
  });

  it("busca familiares acolhidos no portal público mascarando nome do meio e CPF (LGPD)", async () => {
    const { abrigo, voluntario } = await criarCenario();
    await registrarEntrada(voluntario, abrigo.id, {
      nomeCompleto: "Carlos Eduardo Pereira",
      cpf: "12345678909",
    });

    const resultados = await buscarFamiliaresAcolhidosPublico({ busca: "Carlos" });
    const encontrado = resultados.find((r) => r.abrigo.id === abrigo.id);
    expect(encontrado).toBeDefined();
    expect(encontrado?.nomeExibicao).toBe("Carlos E. Pereira");
    expect(encontrado?.cpfMascarado).toBe("***.456.789-**");
  });

  it("recebe reporte cidadão como PENDENTE sem alterar o mapa público até a aprovação do coordenador", async () => {
    const abrigo = await criarAbrigo({ latitude: -28.261, longitude: -52.408 });
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));

    const reporte = await registrarReporteCidadao({
      idAbrigo: abrigo.id,
      tipo: "ALAGAMENTO",
      gravidade: "CRITICO",
      descricao: "Água subindo rapidamente na esquina da escola",
      latitude: -28.2612,
      longitude: -52.4082,
      relatorNome: "Morador Teste",
      relatorContato: "(54) 98888-7777",
    });
    expect(reporte.statusValidacao).toBe("PENDENTE");

    // Enquanto PENDENTE, não contamina o mapa público nem o status do abrigo
    const alertasAntes = await listarAlertasPublicos();
    expect(alertasAntes.some((a) => a.id === reporte.id)).toBe(false);

    const dashAntes = await obterDashboard(coordenador, abrigo.id);
    expect(dashAntes.abrigo.statusInfraestrutura).toBe("NORMAL");
    expect(dashAntes.reportesPendentes).toBe(1);

    // Após aprovação pelo coordenador, publica no mapa e atualiza status para CRITICO
    const moderado = await moderarOcorrencia(coordenador, abrigo.id, reporte.id, {
      acao: "APROVAR",
    });
    expect(moderado.statusInfraestrutura).toBe("CRITICO");
    expect(moderado.ocorrencia.statusValidacao).toBe("APROVADA");

    const alertasDepois = await listarAlertasPublicos();
    expect(alertasDepois.some((a) => a.id === reporte.id)).toBe(true);
  });

  it("sugere transferência automática de estoque entre abrigos próximos com excedente e déficit", async () => {
    const { abrigo: abrigoDeficit, coordenador: coordDeficit, voluntario: volDeficit } = await criarCenario();
    const abrigoExcedente = await criarAbrigo({
      nome: "Abrigo Parceiro Excedente",
      latitude: -28.265,
      longitude: -52.412,
    });
    const volExcedente = contexto(await criarUsuario("VOLUNTARIO", abrigoExcedente.id));
    const coordExcedente = contexto(await criarUsuario("COORDENADOR", abrigoExcedente.id));

    const colchao = await idItem("Colchão");
    // Abrigo A tem déficit (2 un, mínimo 20, URGENTE)
    await movimentarEstoque(volDeficit, abrigoDeficit.id, colchao, { quantidade: 2 });
    await classificarItem(coordDeficit, abrigoDeficit.id, colchao, {
      quantidadeMinima: 20,
      statusNecessidade: "URGENTE",
    });

    // Abrigo B tem excedente (80 un, mínimo 10)
    await movimentarEstoque(volExcedente, abrigoExcedente.id, colchao, { quantidade: 80 });
    await classificarItem(coordExcedente, abrigoExcedente.id, colchao, {
      quantidadeMinima: 10,
      statusNecessidade: "NORMAL",
    });

    const dashDeficit = await obterDashboard(coordDeficit, abrigoDeficit.id);
    const sugestaoReceber = dashDeficit.sugestoesTransferencia.find(
      (s) => s.direcao === "RECEBER" && s.idItem === colchao && s.idAbrigoParceiro === abrigoExcedente.id,
    );
    expect(sugestaoReceber).toBeDefined();
    expect(sugestaoReceber?.quantidadeSugerida).toBeGreaterThan(0);

    const dashExcedente = await obterDashboard(coordExcedente, abrigoExcedente.id);
    const sugestaoEnviar = dashExcedente.sugestoesTransferencia.find(
      (s) => s.direcao === "ENVIAR" && s.idItem === colchao && s.idAbrigoParceiro === abrigoDeficit.id,
    );
    expect(sugestaoEnviar).toBeDefined();
  });
});
