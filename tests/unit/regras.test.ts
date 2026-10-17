import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { assinarToken, verificarToken } from "@/lib/auth/jwt";
import { exigirPermissao, pode, PERMISSOES, type Papel, type UsuarioSessao } from "@/lib/auth/rbac";
import { motivoBloqueio } from "@/lib/auth/acesso";
import { COOKIE_SESSAO } from "@/lib/auth/sessao";
import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { ErroApi, traduzirErroBanco, validar } from "@/lib/http";
import { LimitadorTentativas } from "@/lib/limitador";
import { montarAtualizacao } from "@/lib/sql";
import { linksNavegacao, resumirOcupacao } from "@/modules/abrigos/ocupacao";
import { gerarSlug } from "@/modules/catalogo/catalogo.service";
import { esquemaMovimentacao } from "@/modules/estoque/estoque.service";
import { proxy } from "@/proxy";

const usuario = (papel: Papel, idAbrigo: number | null = 1): UsuarioSessao => ({
  id: 1,
  nome: "Teste",
  email: "t@t.local",
  papel,
  idAbrigo: papel === "ADMIN" ? null : idAbrigo,
});

describe("Ocupação (RF04 / RF06)", () => {
  it.each([
    [0, 100, "VERDE", 0],
    [69, 100, "VERDE", 69],
    [70, 100, "AMARELO", 70],
    [90, 100, "AMARELO", 90],
    [91, 100, "VERMELHO", 91],
    [100, 100, "VERMELHO", 100],
    [2, 3, "VERDE", 66.7],
  ])("lotação %i/%i -> %s", (lotacao, capacidade, nivel, percentual) => {
    expect(resumirOcupacao(lotacao, capacidade)).toMatchObject({
      nivel,
      percentual,
      vagasDisponiveis: capacidade - lotacao,
    });
  });

  it("gera links de navegação para Google Maps e Waze (RF07)", () => {
    expect(linksNavegacao(-28.23, -52.38)).toEqual({
      googleMaps: "https://www.google.com/maps/dir/?api=1&destination=-28.23,-52.38",
      waze: "https://waze.com/ul?ll=-28.23,-52.38&navigate=yes",
    });
  });
});

describe("RBAC (RNF05)", () => {
  it("voluntário movimenta estoque, mas não classifica, não vê dashboard nem auditoria", () => {
    const voluntario = usuario("VOLUNTARIO");
    expect(pode(voluntario, "estoque:movimentar")).toBe(true);
    expect(pode(voluntario, "estoque:classificar")).toBe(false);
    expect(pode(voluntario, "abrigo:dashboard")).toBe(false);
    expect(pode(voluntario, "auditoria:ver")).toBe(false);
  });

  it("ADMIN possui permissão total sobre estoque (movimentar, ajustar, transferir e classificar)", () => {
    expect(pode(usuario("ADMIN"), "estoque:movimentar")).toBe(true);
    expect(pode(usuario("ADMIN"), "estoque:ajustar")).toBe(true);
    expect(pode(usuario("ADMIN"), "estoque:transferir")).toBe(true);
    expect(pode(usuario("ADMIN"), "estoque:classificar")).toBe(true);
  });

  it("restringe COORDENADOR/VOLUNTARIO ao próprio abrigo", () => {
    expect(() => exigirPermissao(usuario("COORDENADOR", 1), "estoque:classificar", 1)).not.toThrow();
    expect(() => exigirPermissao(usuario("COORDENADOR", 1), "estoque:classificar", 2)).toThrow(ErroApi);
    expect(() => exigirPermissao(usuario("ADMIN"), "estoque:classificar", 2)).not.toThrow();
  });

  it("toda permissão lista ao menos um papel válido", () => {
    for (const papeis of Object.values(PERMISSOES)) expect(papeis.length).toBeGreaterThan(0);
  });

  it("bloqueia usuário inativo ou desvinculado (HU01 - RN3)", () => {
    const base = { ativo: true, abrigoAtivo: true, idAbrigo: 1 };
    expect(motivoBloqueio({ ...base, papel: "VOLUNTARIO" })).toBeNull();
    expect(motivoBloqueio({ ...base, papel: "VOLUNTARIO", ativo: false })).toBe("USUARIO_INATIVO");
    expect(motivoBloqueio({ ...base, papel: "COORDENADOR", idAbrigo: null, abrigoAtivo: null })).toBe("SEM_VINCULO_ABRIGO");
    expect(motivoBloqueio({ ...base, papel: "COORDENADOR", abrigoAtivo: false })).toBe("ABRIGO_INATIVO");
    expect(motivoBloqueio({ ativo: true, papel: "ADMIN", idAbrigo: null, abrigoAtivo: null })).toBeNull();
  });
});

describe("Proxy de borda Next.js 16 (RF01 / RNF05)", () => {
  it("redireciona para /login sem cookie ou com token inválido", async () => {
    const semCookie = await proxy(new NextRequest("http://localhost:3000/admin/inventario"));
    expect(semCookie.headers.get("location")).toBe("http://localhost:3000/login");

    const reqInvalido = new NextRequest("http://localhost:3000/admin/dashboard", {
      headers: { cookie: `${COOKIE_SESSAO}=token-invalido` },
    });
    const resInvalido = await proxy(reqInvalido);
    expect(resInvalido.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redireciona /admin para a rota inicial do papel e isola VOLUNTARIO no Fast-CRUD", async () => {
    const { token: tokenVol } = await assinarToken(usuario("VOLUNTARIO", 1));
    const { token: tokenCoord } = await assinarToken(usuario("COORDENADOR", 1));

    const raizCoord = await proxy(
      new NextRequest("http://localhost:3000/admin", {
        headers: { cookie: `${COOKIE_SESSAO}=${tokenCoord}` },
      }),
    );
    expect(raizCoord.headers.get("location")).toBe("http://localhost:3000/admin/dashboard");

    const volNoDashboard = await proxy(
      new NextRequest("http://localhost:3000/admin/dashboard", {
        headers: { cookie: `${COOKIE_SESSAO}=${tokenVol}` },
      }),
    );
    expect(volNoDashboard.headers.get("location")).toBe("http://localhost:3000/admin/inventario");

    const volNoInventario = await proxy(
      new NextRequest("http://localhost:3000/admin/inventario", {
        headers: { cookie: `${COOKIE_SESSAO}=${tokenVol}` },
      }),
    );
    expect(volNoInventario.headers.get("location")).toBeNull();
  });
});

describe("JWT", () => {
  it("assina e valida as claims de RBAC", async () => {
    const sessao = usuario("COORDENADOR", 7);
    const { token, expiraEm } = await assinarToken(sessao);
    expect(expiraEm.getTime()).toBeGreaterThan(Date.now());
    expect(await verificarToken(token)).toEqual(sessao);
    expect(await verificarToken(`${token}x`)).toBeNull();
  });
});

describe("Validação do Fast-CRUD", () => {
  const ok = (corpo: unknown) => validar(esquemaMovimentacao, corpo);
  const falha = (corpo: unknown) => expect(() => validar(esquemaMovimentacao, corpo)).toThrow(ErroApi);

  it("aceita +1/-1 e tipos coerentes com o sinal", () => {
    expect(ok({ quantidade: 1 })).toMatchObject({ quantidade: 1 });
    expect(ok({ quantidade: -1, tipo: "PERDA" })).toMatchObject({ tipo: "PERDA" });
    expect(ok({ tipo: "AJUSTE", quantidadeFinal: 0, observacao: "contagem" })).toMatchObject({ quantidadeFinal: 0 });
  });

  it("rejeita zero, sinal incoerente e AJUSTE sem justificativa", () => {
    falha({ quantidade: 0 });
    falha({});
    falha({ quantidade: -2, tipo: "ENTRADA_DOACAO" });
    falha({ quantidade: 2, tipo: "SAIDA_CONSUMO" });
    falha({ tipo: "AJUSTE", quantidadeFinal: 3 });
    falha({ tipo: "AJUSTE", quantidade: 1, quantidadeFinal: 3, observacao: "x" });
    falha({ quantidade: 1.5 });
  });
});

describe("Utilitários", () => {
  it("valida CPF pelos dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.444.777-35")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(normalizarCpf("529.982.247-25")).toBe("52998224725");
  });

  it("gera slugs sem acentos", () => {
    expect(gerarSlug("Cama e Banho")).toBe("cama-e-banho");
    expect(gerarSlug("  Água & Higiene!! ")).toBe("agua-higiene");
  });

  it("monta UPDATE parcial apenas com campos enviados", () => {
    expect(montarAtualizacao({ nome: "A", telefone: null, ignorado: 1 }, { nome: "nome", telefone: "telefone", endereco: "endereco" }, 2)).toEqual({
      sets: ["nome = $2", "telefone = $3"],
      valores: ["A", null],
    });
  });

  it("limita tentativas por janela de tempo", () => {
    const limitador = new LimitadorTentativas(2, 1000);
    limitador.registrarFalha("k", 0);
    expect(limitador.segundosBloqueado("k", 10)).toBe(0);
    limitador.registrarFalha("k", 20);
    expect(limitador.segundosBloqueado("k", 30)).toBe(1);
    expect(limitador.segundosBloqueado("k", 2000)).toBe(0);
  });

  it("traduz erros do PostgreSQL em erros de negócio", () => {
    const erroPg = (code: string, constraint?: string) => ({ code, constraint, message: "x", severity: "ERROR" });
    expect(traduzirErroBanco(erroPg("23514", "estoque_abrigo_quantidade_ck"))).toMatchObject({ status: 409, codigo: "ESTOQUE_INSUFICIENTE" });
    expect(traduzirErroBanco(erroPg("23505", "usuario_email_uk"))).toMatchObject({ status: 409, codigo: "EMAIL_EM_USO" });
    expect(traduzirErroBanco(erroPg("WTG01"))).toMatchObject({ codigo: "REGISTRO_IMUTAVEL" });
    expect(traduzirErroBanco(new Error("qualquer"))).toBeNull();
  });
});

