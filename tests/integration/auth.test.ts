import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { verificarToken } from "@/lib/auth/jwt";
import { COOKIE_SESSAO, obterUsuario } from "@/lib/auth/sessao";
import { consultar } from "@/lib/db";
import { alterarSenha, autenticarComGoogle, login } from "@/modules/auth/auth.service";
import { atualizarUsuario, criarUsuario as criarUsuarioService } from "@/modules/usuarios/usuarios.service";
import { capturarErro, contexto, criarAbrigo, criarUsuario, logsDoUsuario, SENHA_TESTE } from "./fixtures";

const requisicaoCom = (token: string, via: "header" | "cookie" = "header") =>
  new NextRequest("http://localhost/api/auth/me", {
    headers: via === "header" ? { authorization: `Bearer ${token}` } : { cookie: `${COOKIE_SESSAO}=${token}` },
  });

describe("RF01 - Autenticação e RBAC", () => {
  it.each([
    ["VOLUNTARIO", "/admin/inventario"],
    ["COORDENADOR", "/admin/dashboard"],
    ["ADMIN", "/admin/geral"],
  ] as const)("login de %s gera JWT com o papel e redireciona para %s", async (papel, destino) => {
    const abrigo = await criarAbrigo();
    const usuario = await criarUsuario(papel, papel === "ADMIN" ? null : abrigo.id);

    const resultado = await login({ email: usuario.email, senha: SENHA_TESTE }, "10.0.0.1");

    expect(resultado.redirecionarPara).toBe(destino);
    expect(resultado.usuario).toMatchObject({ id: usuario.id, papel, idAbrigo: usuario.idAbrigo });
    const claims = await verificarToken(resultado.token);
    expect(claims).toMatchObject({ id: usuario.id, papel, idAbrigo: usuario.idAbrigo, email: usuario.email });

    const logs = await logsDoUsuario(usuario.id);
    expect(logs.at(-1)).toMatchObject({ acao: "LOGIN_SUCESSO", endereco_ip: "10.0.0.1" });
  });

  it('responde "Credenciais inválidas" sem revelar se errou e-mail ou senha', async () => {
    const usuario = await criarUsuario("ADMIN", null);

    const senhaErrada = await capturarErro(login({ email: usuario.email, senha: "errada" }, "10.0.0.2"));
    const emailInexistente = await capturarErro(login({ email: "naoexiste@teste.local", senha: "x" }, "10.0.0.2"));

    for (const erro of [senhaErrada, emailInexistente]) {
      expect(erro.status).toBe(401);
      expect(erro.message).toBe("Credenciais inválidas.");
    }
    expect((await logsDoUsuario(usuario.id)).at(-1)?.acao).toBe("LOGIN_FALHA");
  });

  it("nega acesso a usuário inativo e a usuário de abrigo desativado (desvinculado)", async () => {
    const inativo = await criarUsuario("ADMIN", null, { ativo: false });
    expect((await capturarErro(login({ email: inativo.email, senha: SENHA_TESTE }, null))).codigo).toBe("USUARIO_INATIVO");

    const abrigoFechado = await criarAbrigo({ ativo: false });
    const voluntario = await criarUsuario("VOLUNTARIO", abrigoFechado.id);
    const erro = await capturarErro(login({ email: voluntario.email, senha: SENHA_TESTE }, null));
    expect(erro).toMatchObject({ status: 403, codigo: "ABRIGO_INATIVO" });
  });

  it("bloqueia temporariamente após muitas tentativas falhas (força bruta)", async () => {
    const usuario = await criarUsuario("ADMIN", null);
    for (let i = 0; i < 10; i++) {
      await capturarErro(login({ email: usuario.email, senha: `errada-${i}` }, "10.9.9.9"));
    }
    const bloqueado = await capturarErro(login({ email: usuario.email, senha: SENHA_TESTE }, "10.9.9.9"));
    expect(bloqueado.status).toBe(429);

    // Outro IP não é afetado.
    await expect(login({ email: usuario.email, senha: SENHA_TESTE }, "10.9.9.10")).resolves.toBeDefined();
  });

  it("revalida o usuário a cada requisição (desativação tem efeito imediato)", async () => {
    const abrigo = await criarAbrigo();
    const usuario = await criarUsuario("COORDENADOR", abrigo.id);
    const { token } = await login({ email: usuario.email, senha: SENHA_TESTE }, null);

    expect(await obterUsuario(requisicaoCom(token))).toMatchObject({ id: usuario.id, papel: "COORDENADOR" });
    expect(await obterUsuario(requisicaoCom(token, "cookie"))).toMatchObject({ id: usuario.id });

    await consultar("UPDATE usuario SET ativo = FALSE WHERE id = $1", [usuario.id]);
    expect(await obterUsuario(requisicaoCom(token))).toBeNull();
  });

  it("rejeita token adulterado", async () => {
    const usuario = await criarUsuario("ADMIN", null);
    const { token } = await login({ email: usuario.email, senha: SENHA_TESTE }, null);
    const [cabecalho, , assinatura] = token.split(".");
    const payloadFalso = Buffer.from(JSON.stringify({ sub: "1", papel: "ADMIN", idAbrigo: null })).toString("base64url");

    expect(await obterUsuario(requisicaoCom(`${cabecalho}.${payloadFalso}.${assinatura}`))).toBeNull();
  });

  it("altera a própria senha exigindo a senha atual", async () => {
    const usuario = await criarUsuario("ADMIN", null);
    const ctx = contexto(usuario);

    expect((await capturarErro(alterarSenha(ctx, { senhaAtual: "errada", novaSenha: "NovaSenha@2026" }))).codigo).toBe(
      "SENHA_ATUAL_INCORRETA",
    );
    await alterarSenha(ctx, { senhaAtual: SENHA_TESTE, novaSenha: "NovaSenha@2026" });
    await expect(login({ email: usuario.email, senha: "NovaSenha@2026" }, null)).resolves.toBeDefined();
  });

  it("realiza auto-cadastro via Google One Tap com aprovação pelo Coordenador e login 1-toque", async () => {
    const abrigo = await criarAbrigo({ nome: "Abrigo Google One Tap" });
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));
    const credencial = {
      nome: "Voluntária Google",
      email: `google.${abrigo.id}@teste.local`,
      sub: `sub-google-${abrigo.id}`,
    };

    // 1. Sem abrigo selecionado, solicita escolha do abrigo
    const passo1 = await autenticarComGoogle({ credencialSimulada: credencial }, "10.0.0.5");
    expect(passo1.status).toBe("REQUER_ABRIGO");

    // 2. Com abrigo selecionado, cria solicitação pendente (ativo = false)
    const passo2 = await autenticarComGoogle(
      { credencialSimulada: credencial, idAbrigo: abrigo.id },
      "10.0.0.5",
    );
    expect(passo2.status).toBe("PENDENTE_APROVACAO");
    if (passo2.status !== "PENDENTE_APROVACAO") throw new Error("Esperado PENDENTE_APROVACAO");
    expect(passo2.usuario).toMatchObject({
      nome: "Voluntária Google",
      email: credencial.email,
      papel: "VOLUNTARIO",
      idAbrigo: abrigo.id,
    });

    // 3. Coordenador aprova com 1 clique
    await atualizarUsuario(coordenador, passo2.usuario.id, { ativo: true });

    // 4. Novo toque no Google One Tap autentica diretamente
    const passo3 = await autenticarComGoogle({ credencialSimulada: credencial }, "10.0.0.5");
    expect(passo3.status).toBe("AUTENTICADO");
    if (passo3.status !== "AUTENTICADO") throw new Error("Esperado AUTENTICADO");
    expect(passo3.redirecionarPara).toBe("/admin/inventario");
  });

  it("permite pré-cadastro sem senha pelo Coordenador para entrada direta via Google One Tap", async () => {
    const abrigo = await criarAbrigo();
    const coordenador = contexto(await criarUsuario("COORDENADOR", abrigo.id));
    const emailPre = `precadastro.${abrigo.id}@teste.local`;

    const preCadastrado = await criarUsuarioService(coordenador, {
      nome: "Voluntário Pré-Cadastrado",
      email: emailPre,
      papel: "VOLUNTARIO",
    });
    expect(preCadastrado.ativo).toBe(true);
    expect(preCadastrado.possuiGoogle).toBe(false);

    const autenticado = await autenticarComGoogle(
      { credencialSimulada: { nome: "Voluntário Pré-Cadastrado", email: emailPre } },
      "10.0.0.6",
    );
    expect(autenticado.status).toBe("AUTENTICADO");
  });
});
