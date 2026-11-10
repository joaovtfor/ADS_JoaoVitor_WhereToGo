import { describe, expect, it } from "vitest";
import { filtrarAbrigos, precisaDoQueDoador, type CriteriosMapa } from "@/components/mapa/filtrar-abrigos";
import type { AbrigoMapa } from "@/components/mapa/tipos";
import { mascararCpf } from "@/lib/cpf";
import { extrairCidade, gerarPayloadPixBrCode, normalizarChavePix } from "@/lib/pix";

/** CRC16-CCITT (0x1021, inicial 0xFFFF) escrito à parte, para conferir o do BR Code. */
function crcReferencia(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "latin1")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

describe("PIX", () => {
  it("valida e normaliza os formatos de chave do DICT", () => {
    expect(normalizarChavePix(" Doacoes@Abrigo.ORG ")).toEqual({ chave: "doacoes@abrigo.org", tipo: "EMAIL" });
    expect(normalizarChavePix("529.982.247-25")).toEqual({ chave: "52998224725", tipo: "CPF" });
    expect(normalizarChavePix("12.345.678/0001-95")).toEqual({ chave: "12345678000195", tipo: "CNPJ" });
    expect(normalizarChavePix("+55 (54) 99999-0000")).toEqual({ chave: "+5554999990000", tipo: "TELEFONE" });
    expect(normalizarChavePix("123E4567-E12B-12D1-A456-426655440000")?.tipo).toBe("ALEATORIA");

    expect(normalizarChavePix("golpe@pix")).toBeNull();
    expect(normalizarChavePix("123.456.789-00")).toBeNull(); // CPF com dígito verificador errado
    expect(normalizarChavePix("54999990000")).toBeNull(); // telefone sem +55 é ambíguo
  });

  it("extrai a cidade do endereço para o BR Code", () => {
    expect(extrairCidade("Rua Fictícia, 100 - Centro, Passo Fundo/RS")).toBe("PASSO FUNDO");
    expect(extrairCidade("Av. Ipiranga, 6681, Porto Alegre - RS")).toBe("PORTO ALEGRE");
    expect(extrairCidade("Rua Teste, 1")).toBe("BRASIL");
  });

  it("gera BR Code com cidade do abrigo e CRC válido", () => {
    const payload = gerarPayloadPixBrCode("pix@abrigo.org", "Associação Ginásio do Centro de Passo Fundo", "Passo Fundo");
    expect(payload).toMatch(/^000201/);
    expect(payload).toContain("0014br.gov.bcb.pix0114pix@abrigo.org");
    expect(payload).toContain("5925ASSOCIACAO GINASIO DO CEN"); // sem acentos, até 25 caracteres
    expect(payload).toContain("6011PASSO FUNDO");
    expect(payload.slice(-4)).toBe(crcReferencia(payload.slice(0, -4)));
  });

  it("mascara o CPF mantendo só os dígitos centrais", () => {
    expect(mascararCpf("52998224725")).toBe("***.982.247-**");
    expect(mascararCpf("123")).toBe("***");
  });
});

function abrigo(id: number, extras: Partial<AbrigoMapa> = {}): AbrigoMapa {
  return {
    id,
    nome: `Abrigo ${id}`,
    endereco: "Rua A",
    telefone: null,
    latitude: 0,
    longitude: 0,
    ocupacao: { capacidadeMaxima: 10, lotacaoAtual: 5, vagasDisponiveis: 5, percentual: 50, nivel: "VERDE" },
    statusInfraestrutura: "NORMAL",
    aceitaPets: false,
    acessivelPcd: false,
    ocorrenciasAtivas: [],
    emAreaDeRisco: false,
    necessidades: { urgentes: [], bloqueados: [] },
    destaque: null,
    distanciaKm: null,
    atualizadoEm: "2026-10-30T12:00:00Z",
    ...extras,
  };
}

const SEM_FILTRO: CriteriosMapa = { termoBusca: "", filtroRapido: "TODOS", ocultarNaoDestaque: false, categoriaSlug: null, itemFiltroId: null };

describe("Filtros do mapa público", () => {
  const precisaAgua = abrigo(1, { necessidades: { urgentes: [{ id: 7, nome: "Água 5 L", categoria: "agua" }], bloqueados: [] } });
  const precisaFralda = abrigo(2, { necessidades: { urgentes: [{ id: 9, nome: "Fralda", categoria: "infantil" }], bloqueados: [] } });

  it("destaca quem precisa da categoria E do item escolhidos (mesma regra da API)", () => {
    expect(precisaDoQueDoador(precisaAgua, null, null)).toBeNull();
    expect(precisaDoQueDoador(precisaAgua, "agua", null)).toBe(true);
    expect(precisaDoQueDoador(precisaAgua, "agua", 7)).toBe(true);
    expect(precisaDoQueDoador(precisaAgua, "agua", 99)).toBe(false);
    expect(precisaDoQueDoador(precisaFralda, "agua", null)).toBe(false);
  });

  it("filtra por vagas, busca e prioritários; ordena prioritários e depois os mais próximos", () => {
    const lotado = abrigo(3, { ocupacao: { capacidadeMaxima: 10, lotacaoAtual: 10, vagasDisponiveis: 0, percentual: 100, nivel: "VERMELHO" } });
    const perto = abrigo(4, { distanciaKm: 1 });
    const longe = abrigo(5, { distanciaKm: 9 });
    const todos = [lotado, longe, perto, precisaAgua];

    expect(filtrarAbrigos(todos, { ...SEM_FILTRO, filtroRapido: "COM_VAGAS" }).map((a) => a.id)).not.toContain(3);
    expect(filtrarAbrigos(todos, { ...SEM_FILTRO, termoBusca: "água" }).map((a) => a.id)).toEqual([1]);
    expect(filtrarAbrigos(todos, { ...SEM_FILTRO, categoriaSlug: "agua", ocultarNaoDestaque: true }).map((a) => a.id)).toEqual([1]);
    expect(filtrarAbrigos(todos, { ...SEM_FILTRO, categoriaSlug: "agua" }).map((a) => a.id).slice(0, 3)).toEqual([1, 4, 5]);
  });
});
