import { cpfValido } from "./cpf";

// Regras da chave PIX e do BR Code estático (BACEN / EMVCo). Sem dependências
// de servidor: usado na validação da API e na geração do QR no mapa público.

export type TipoChavePix = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONE = /^\+55\d{10,11}$/;
const REGEX_ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const MENSAGEM_CHAVE_PIX_INVALIDA =
  "Chave PIX inválida. Use CPF ou CNPJ (só números), e-mail, telefone com +55 (ex.: +5554999990000) ou chave aleatória.";

/**
 * Normaliza a chave PIX para o formato registrado no DICT (CPF/CNPJ só com
 * dígitos, e-mail e chave aleatória em minúsculas). Retorna `null` se nenhum
 * formato válido se aplica.
 */
export function normalizarChavePix(chave: string): { chave: string; tipo: TipoChavePix } | null {
  const bruta = chave.trim();
  if (REGEX_ALEATORIA.test(bruta.toLowerCase())) return { chave: bruta.toLowerCase(), tipo: "ALEATORIA" };
  if (bruta.includes("@")) {
    const email = bruta.toLowerCase();
    return REGEX_EMAIL.test(email) && email.length <= 77 ? { chave: email, tipo: "EMAIL" } : null;
  }
  if (bruta.startsWith("+")) {
    const telefone = `+${bruta.replace(/\D/g, "")}`;
    return REGEX_TELEFONE.test(telefone) ? { chave: telefone, tipo: "TELEFONE" } : null;
  }
  const digitos = bruta.replace(/[.\-/\s]/g, "");
  if (/^\d{11}$/.test(digitos) && cpfValido(digitos)) return { chave: digitos, tipo: "CPF" };
  if (/^\d{14}$/.test(digitos)) return { chave: digitos, tipo: "CNPJ" };
  return null;
}

/** Texto aceito nos campos do BR Code: sem acentos, só letras, números e espaço. */
function limparTextoEmv(texto: string, limite: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite)
    .toUpperCase();
}

/**
 * Cidade do recebedor (campo 60 do BR Code) a partir do endereço cadastrado:
 * "Rua X, 100 - Centro, Passo Fundo/RS" -> "PASSO FUNDO".
 */
export function extrairCidade(endereco: string): string {
  const ultimoTrecho = endereco.split(",").at(-1) ?? "";
  const semUf = limparTextoEmv(ultimoTrecho.replace(/\s*[/-]\s*[A-Za-z]{2}\s*$/, ""), 15);
  // Endereço sem cidade (ex.: "Rua Teste, 1"): o último trecho é número/complemento.
  return /[A-Z]{3}/.test(semUf) ? semUf : "BRASIL";
}

function campoEmv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

function crc16Ccitt(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Payload "PIX copia e cola" estático (sem valor), com CRC16-CCITT (0x1021). */
export function gerarPayloadPixBrCode(chave: string, titular: string | null, cidade: string): string {
  const nome = limparTextoEmv(titular ?? "", 25) || "ABRIGO EMERGENCIAL";
  const contaMerchant = campoEmv("00", "br.gov.bcb.pix") + campoEmv("01", chave.trim());
  const semCrc =
    campoEmv("00", "01") +
    campoEmv("26", contaMerchant) +
    campoEmv("52", "0000") +
    campoEmv("53", "986") +
    campoEmv("58", "BR") +
    campoEmv("59", nome) +
    campoEmv("60", limparTextoEmv(cidade, 15) || "BRASIL") +
    campoEmv("62", campoEmv("05", "***")) +
    "6304";
  return `${semCrc}${crc16Ccitt(semCrc)}`;
}
