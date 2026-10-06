import { beforeAll, describe, expect, it } from "vitest";

/**
 * Testes HTTP contra a aplicação em execução com o seed de desenvolvimento:
 *   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 */
const BASE = process.env.E2E_BASE_URL;
const SENHA = process.env.SEED_SENHA_PADRAO ?? "WhereToGo@2026";

interface Sessao {
  token: string;
  cookie: string;
  idAbrigo: number | null;
}

async function api(caminho: string, opcoes: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers = new Headers(opcoes.headers);
  if (opcoes.token) headers.set("authorization", `Bearer ${opcoes.token}`);
  if (opcoes.json !== undefined) headers.set("content-type", "application/json");
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers,
    body: opcoes.json !== undefined ? JSON.stringify(opcoes.json) : opcoes.body,
  });
  const texto = await resposta.text();
  return { status: resposta.status, headers: resposta.headers, corpo: texto ? JSON.parse(texto) : null };
}

async function entrar(email: string): Promise<Sessao> {
  const { status, corpo, headers } = await api("/api/auth/login", { method: "POST", json: { email, senha: SENHA } });
  expect(status, JSON.stringify(corpo)).toBe(200);
  return {
    token: corpo.dados.token,
    cookie: headers.get("set-cookie")!.split(";")[0],
    idAbrigo: corpo.dados.usuario.idAbrigo,
  };
}

describe.skipIf(!BASE)("API HTTP (e2e)", () => {
  let voluntario: Sessao;
  let coordenador: Sessao;
  let admin: Sessao;
  let idAgua: number;

  beforeAll(async () => {
    [voluntario, coordenador, admin] = await Promise.all([
      entrar("voluntario@wheretogo.local"),
      entrar("coordenador@wheretogo.local"),
      entrar("admin@wheretogo.local"),
    ]);
    const categorias = await api("/api/public/categorias");
    idAgua = categorias.corpo.dados
      .find((c: { slug: string }) => c.slug === "agua")
      .itens.find((i: { nome: string }) => i.nome === "Água Potável 5 L").id;
  });

  it("health check responde com banco e PostGIS", async () => {
    const { status, corpo } = await api("/api/health");
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ status: "ok", banco: "ok" });
  });

  describe("API pública (sem login)", () => {
    it("lista abrigos com destaque por necessidade e ordena por distância", async () => {
      const { status, corpo, headers } = await api("/api/public/abrigos?lat=-28.25&lng=-52.40&necessidade=agua");
      expect(status).toBe(200);
      expect(headers.get("cache-control")).toContain("s-maxage");
      const destacados = corpo.dados.filter((a: { destaque: boolean }) => a.destaque);
      expect(destacados.length).toBeGreaterThan(0);
      expect(corpo.dados[0].destaque).toBe(true);
      expect(corpo.dados[0].distanciaKm).toEqual(expect.any(Number));
    });

    it("entrega GeoJSON para o Leaflet", async () => {
      const { status, corpo, headers } = await api("/api/public/abrigos?formato=geojson");
      expect(status).toBe(200);
      expect(headers.get("content-type")).toContain("application/geo+json");
      expect(corpo.type).toBe("FeatureCollection");
      expect(corpo.features[0].geometry.coordinates).toHaveLength(2);
    });

    it("card do abrigo traz PIX e rotas; alertas trazem coordenadas", async () => {
      const card = await api(`/api/public/abrigos/${voluntario.idAbrigo}`);
      expect(card.status).toBe(200);
      expect(card.corpo.dados.pix).toMatchObject({ chave: expect.any(String) });
      expect(card.corpo.dados.rotas.waze).toContain("waze.com");

      const alertas = await api("/api/public/alertas");
      expect(alertas.status).toBe(200);
      expect(alertas.corpo.dados[0]).toMatchObject({ latitude: expect.any(Number), gravidade: expect.any(String) });
    });

    it("valida a query e o id da rota", async () => {
      expect((await api("/api/public/abrigos?lat=-28")).status).toBe(400);
      expect((await api("/api/public/abrigos/abc")).status).toBe(400);
      expect((await api("/api/public/abrigos/999999")).status).toBe(404);
    });
  });

  describe("Autenticação (RF01)", () => {
    it("recusa credenciais inválidas com mensagem genérica", async () => {
      const { status, corpo } = await api("/api/auth/login", {
        method: "POST",
        json: { email: "voluntario@wheretogo.local", senha: "senha-errada" },
      });
      expect(status).toBe(401);
      expect(corpo.erro).toMatchObject({ codigo: "NAO_AUTENTICADO", mensagem: "Credenciais inválidas." });
    });

    it("aceita token no header Authorization e no cookie httpOnly", async () => {
      const viaHeader = await api("/api/auth/me", { token: coordenador.token });
      expect(viaHeader.status).toBe(200);
      expect(viaHeader.corpo.dados).toMatchObject({ papel: "COORDENADOR", redirecionarPara: "/admin/dashboard" });

      const viaCookie = await api("/api/auth/me", { headers: { cookie: voluntario.cookie } });
      expect(viaCookie.corpo.dados).toMatchObject({ papel: "VOLUNTARIO", redirecionarPara: "/admin/inventario" });
    });

    it("rotas internas exigem autenticação (401) e papel adequado (403)", async () => {
      expect((await api("/api/abrigos")).status).toBe(401);
      const dashboard = `/api/abrigos/${voluntario.idAbrigo}/dashboard`;
      expect((await api(dashboard, { token: voluntario.token })).status).toBe(403);
      expect((await api(dashboard, { token: coordenador.token })).status).toBe(200);
    });
  });

  describe("Fast-CRUD e auditoria assíncrona (RF02 / RNF03)", () => {
    it("+1 / -1 atualiza o saldo e gera log de auditoria em background", async () => {
      const caminho = `/api/abrigos/${voluntario.idAbrigo}/estoque/${idAgua}/movimentacoes`;
      const mais = await api(caminho, { method: "POST", token: voluntario.token, json: { quantidade: 1 } });
      expect(mais.status).toBe(201);
      const menos = await api(caminho, { method: "POST", token: voluntario.token, json: { quantidade: -1 } });
      expect(menos.status).toBe(201);
      expect(menos.corpo.dados.quantidadeAtual).toBe(mais.corpo.dados.quantidadeAtual - 1);

      // O log é gravado por after(), depois da resposta: aguarda até aparecer.
      let encontrado = false;
      for (let tentativa = 0; tentativa < 20 && !encontrado; tentativa++) {
        const logs = await api(`/api/auditoria?acao=ESTOQUE_MOVIMENTADO&tamanho=20`, { token: admin.token });
        encontrado = logs.corpo.dados.itens.some(
          (l: { detalhes: { idMovimentacao: number } }) => l.detalhes.idMovimentacao === menos.corpo.dados.movimentacao.id,
        );
        if (!encontrado) await new Promise((r) => setTimeout(r, 100));
      }
      expect(encontrado).toBe(true);
    });

    it("retorna erros de validação e de regra no envelope padrão", async () => {
      const caminho = `/api/abrigos/${voluntario.idAbrigo}/estoque/${idAgua}/movimentacoes`;
      const invalido = await api(caminho, { method: "POST", token: voluntario.token, json: { quantidade: 0 } });
      expect(invalido.status).toBe(400);
      expect(invalido.corpo.erro.detalhes[0]).toMatchObject({ campo: "quantidade" });

      const negativo = await api(caminho, { method: "POST", token: voluntario.token, json: { quantidade: -100000 } });
      expect(negativo.status).toBe(409);
      expect(negativo.corpo.erro.codigo).toBe("ESTOQUE_INSUFICIENTE");

      const jsonQuebrado = await api(caminho, {
        method: "POST",
        token: voluntario.token,
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(jsonQuebrado.status).toBe(400);
    });

    it("voluntário não altera status de necessidade (RF03)", async () => {
      const { status } = await api(`/api/abrigos/${voluntario.idAbrigo}/estoque/${idAgua}`, {
        method: "PATCH",
        token: voluntario.token,
        json: { statusNecessidade: "BLOQUEADO" },
      });
      expect(status).toBe(403);
    });
  });

  it("logout remove o cookie de sessão", async () => {
    const { status, headers } = await api("/api/auth/logout", { method: "POST", headers: { cookie: voluntario.cookie } });
    expect(status).toBe(204);
    expect(headers.get("set-cookie")).toMatch(/wtg_sessao=;/);
  });
});
