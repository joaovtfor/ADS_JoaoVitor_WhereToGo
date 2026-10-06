import { describe, expect, it } from "vitest";
import { consultar } from "@/lib/db";
import { validar } from "@/lib/http";
import { registrarEntrada } from "@/modules/abrigados/abrigados.service";
import { listarLogs } from "@/modules/auditoria/auditoria.service";
import { classificarItem, movimentarEstoque } from "@/modules/estoque/estoque.service";
import { registrarOcorrencia } from "@/modules/ocorrencias/ocorrencias.service";
import {
  esquemaFiltroMapa,
  listarAbrigosPublicos,
  listarAlertasPublicos,
  obterAbrigoPublico,
} from "@/modules/publico/publico.service";
import { atualizarUsuario, criarUsuario as criarUsuarioService, listarUsuarios } from "@/modules/usuarios/usuarios.service";
import { capturarErro, contexto, criarAbrigo, criarCenario, criarUsuario, idItem } from "./fixtures";

const filtroMapa = (query: Record<string, string>) => validar(esquemaFiltroMapa, query);

describe("RF06/RF07/RF08/RF09 - API pública do mapa", () => {
  it("destaca quem precisa URGENTE do item e nunca destaca BLOQUEADO", async () => {
    // Região isolada (longe dos outros testes) para controlar o resultado.
    const perto = await criarAbrigo({ nome: "Precisa de Água", latitude: -10.0, longitude: -40.0 });
    const longe = await criarAbrigo({ nome: "Também Precisa", latitude: -10.3, longitude: -40.0 });
    const saturado = await criarAbrigo({ nome: "Saturado de Água", latitude: -10.01, longitude: -40.0 });
    const inativo = await criarAbrigo({ nome: "Fechado", latitude: -10.02, longitude: -40.0, ativo: false });
    const admin = contexto(await criarUsuario("ADMIN", null));
    const agua = await idItem("Água Potável 5 L");

    await classificarItem(admin, perto.id, agua, { statusNecessidade: "URGENTE" });
    await classificarItem(admin, longe.id, agua, { statusNecessidade: "URGENTE" });
    await classificarItem(admin, saturado.id, agua, { statusNecessidade: "BLOQUEADO" });

    const resultado = await listarAbrigosPublicos(filtroMapa({ lat: "-10", lng: "-40", raioKm: "50", necessidade: "agua" }));
    expect(resultado.map((a) => [a.nome, a.destaque])).toEqual([
      ["Precisa de Água", true],
      ["Também Precisa", true],
      ["Saturado de Água", false],
    ]);
    expect(resultado.map((a) => a.id)).not.toContain(inativo.id);
    expect(resultado[0].distanciaKm).toBe(0);
    expect(resultado[1].distanciaKm).toBeCloseTo(33.2, 0);
    expect(resultado[2].necessidades.bloqueados[0]).toMatchObject({ id: agua, categoria: "agua" });

    const somenteDestaque = await listarAbrigosPublicos(
      filtroMapa({ lat: "-10", lng: "-40", raioKm: "10", necessidade: "agua", somenteDestaque: "true" }),
    );
    expect(somenteDestaque.map((a) => a.nome)).toEqual(["Precisa de Água"]);
  });

  it("card do abrigo traz PIX, rotas e alertas, sem dados pessoais nem quantidades", async () => {
    const { abrigo, coordenador, voluntario } = await criarCenario();
    await registrarEntrada(voluntario, abrigo.id, { nomeCompleto: "Pessoa Sigilosa", cpf: "98765432100" });
    await movimentarEstoque(voluntario, abrigo.id, await idItem("Cobertor"), { quantidade: 30 });
    await registrarOcorrencia(coordenador, abrigo.id, { tipo: "ALAGAMENTO", descricao: "Rua alagada" });

    const card = await obterAbrigoPublico(abrigo.id);
    expect(card.rotas.waze).toContain("navigate=yes");
    expect(card.rotas.googleMaps).toContain("destination=");
    expect(card.ocupacao.lotacaoAtual).toBe(1);
    expect(card.statusInfraestrutura).toBe("CRITICO");
    expect(card.ocorrenciasAtivas[0]).toMatchObject({ tipo: "ALAGAMENTO", descricao: "Rua alagada" });

    const json = JSON.stringify(card);
    expect(json).not.toContain("Pessoa Sigilosa");
    expect(json).not.toContain("98765432100");
    expect(json).not.toContain('"quantidade"');

    const alertas = await listarAlertasPublicos();
    expect(alertas.find((a) => a.abrigo.id === abrigo.id)).toMatchObject({ tipo: "ALAGAMENTO", localizacaoPropria: false });
  });
});

describe("RF11 - Gestão de usuários", () => {
  it("coordenador cria apenas voluntários do próprio abrigo", async () => {
    const { abrigo, coordenador } = await criarCenario();
    const outro = await criarAbrigo();
    const dados = { nome: "Novo Voluntário", email: `novo.${abrigo.id}@teste.local`, senha: "SenhaForte@1" };

    const criado = await criarUsuarioService(coordenador, { ...dados, papel: "VOLUNTARIO" });
    expect(criado).toMatchObject({ papel: "VOLUNTARIO", idAbrigo: abrigo.id, ativo: true });
    expect(criado).not.toHaveProperty("senhaHash");

    const comoCoordenador = await capturarErro(
      criarUsuarioService(coordenador, { ...dados, email: `c.${abrigo.id}@teste.local`, papel: "COORDENADOR" }),
    );
    expect(comoCoordenador.status).toBe(403);
    const outroAbrigo = await capturarErro(
      criarUsuarioService(coordenador, { ...dados, email: `o.${abrigo.id}@teste.local`, papel: "VOLUNTARIO", idAbrigo: outro.id }),
    );
    expect(outroAbrigo.status).toBe(403);

    const emailRepetido = await capturarErro(criarUsuarioService(coordenador, { ...dados, papel: "VOLUNTARIO" }));
    expect(emailRepetido.codigo).toBe("EMAIL_EM_USO");

    const lista = await listarUsuarios(coordenador, {}, { pagina: 1, tamanho: 50 });
    expect(lista.itens.every((u) => u.idAbrigo === abrigo.id)).toBe(true);
  });

  it("garante ao menos um ADMIN ativo e impede autodesativação", async () => {
    const { admin } = await criarCenario();
    expect((await capturarErro(atualizarUsuario(admin, admin.usuario.id, { ativo: false }))).codigo).toBe("AUTOALTERACAO_BLOQUEADA");

    // Desativa todos os outros ADMINs; o último não pode ser rebaixado por outro usuário.
    await consultar(
      `UPDATE usuario SET ativo = FALSE
        WHERE id <> $1 AND id_papel = (SELECT id FROM papel_usuario WHERE nome = 'ADMIN')`,
      [admin.usuario.id],
    );
    const outroAdmin = contexto(await criarUsuario("ADMIN", null));
    await atualizarUsuario(outroAdmin, admin.usuario.id, { ativo: false });

    // Agora `outroAdmin` é o único ADMIN ativo: não pode ser desativado nem rebaixado.
    const terceiro = contexto(await criarUsuario("ADMIN", null, { ativo: false }));
    expect((await capturarErro(atualizarUsuario(terceiro, outroAdmin.usuario.id, { ativo: false }))).codigo).toBe("ULTIMO_ADMIN");
    const abrigo = await criarAbrigo();
    expect(
      (await capturarErro(atualizarUsuario(terceiro, outroAdmin.usuario.id, { papel: "COORDENADOR", idAbrigo: abrigo.id }))).codigo,
    ).toBe("ULTIMO_ADMIN");
  });
});

describe("RF13 - Consulta de auditoria", () => {
  it("coordenador vê apenas eventos do próprio abrigo", async () => {
    const { abrigo, coordenador, voluntario, admin } = await criarCenario();
    const outro = await criarCenario();
    await movimentarEstoque(voluntario, abrigo.id, await idItem("Sabonete"), { quantidade: 3 });
    await movimentarEstoque(outro.voluntario, outro.abrigo.id, await idItem("Sabonete"), { quantidade: 3 });

    const logsCoordenador = await listarLogs(coordenador, { idAbrigo: outro.abrigo.id }, { pagina: 1, tamanho: 50 });
    expect(logsCoordenador.itens.length).toBeGreaterThan(0);
    expect(logsCoordenador.itens.every((l) => l.abrigo?.id === abrigo.id)).toBe(true);

    const logsAdmin = await listarLogs(admin, { idAbrigo: outro.abrigo.id, acao: "ESTOQUE_MOVIMENTADO" }, { pagina: 1, tamanho: 50 });
    expect(logsAdmin.itens).toHaveLength(1);
    expect(logsAdmin.itens[0]).toMatchObject({ descricao: "+3 Sabonete (ENTRADA_DOACAO)", usuario: { id: outro.voluntario.usuario.id } });

    expect((await capturarErro(listarLogs(voluntario, {}, { pagina: 1, tamanho: 10 }))).status).toBe(403);
  });
});
