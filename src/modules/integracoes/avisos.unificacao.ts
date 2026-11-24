// Unificação dos avisos oficiais para a tela. Função pura, sem banco.
//
// O INMET publica um aviso por nível para o mesmo fenômeno, com áreas
// encaixadas: em 24/11/2026 a Tempestade tinha "Perigo Potencial" (3.476
// municípios), "Perigo" (1.468) e "Grande Perigo" (642), mesmo período, cada
// lista contida na anterior. Para quem está num município do Grande Perigo, os
// outros dois não dizem nada a mais. Mostrar os três só repete o alerta.

const GRAU_SEVERIDADE = { MODERADA: 1, SEVERA: 2, EXTREMA: 3 } as const;

/** O mínimo que a unificação precisa saber de um aviso. */
export interface AvisoUnificavel {
  id: number;
  fonte: string;
  evento: string;
  severidade: keyof typeof GRAU_SEVERIDADE;
  inicio: Date | string;
  fim: Date | string;
}

/** "Tempestade" e " tempestade " são o mesmo evento; o nível não entra. */
function chaveEvento(aviso: AvisoUnificavel): string {
  const evento = aviso.evento
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `${aviso.fonte}|${evento}`;
}

interface Lido<T> {
  aviso: T;
  chave: string;
  grau: number;
  inicio: number;
  fim: number;
}

/**
 * `maior` torna `menor` desnecessário: mesmo evento, nível igual ou maior e
 * período que cobre todo o período de `menor`. No empate de nível e período
 * (o mesmo aviso publicado duas vezes), fica o de id maior, o mais recente.
 */
function cobre<T extends AvisoUnificavel>(maior: Lido<T>, menor: Lido<T>): boolean {
  if (maior === menor || maior.chave !== menor.chave) return false;
  if (maior.grau < menor.grau || maior.inicio > menor.inicio || maior.fim < menor.fim) return false;
  if (maior.grau > menor.grau) return true;
  const periodoMaior = maior.inicio < menor.inicio || maior.fim > menor.fim;
  return periodoMaior || maior.aviso.id > menor.aviso.id;
}

/**
 * Tira da lista os avisos cobertos por outro (ver `cobre`) e mantém a ordem.
 *
 * Garantia: em qualquer instante, o nível mais alto de cada evento continua
 * na tela. Um aviso só some se outro, igual ou mais grave, vale durante todo
 * o período dele. Por isso:
 * - períodos que só se cruzam ficam os dois (Grande Perigo até 18:00 e Perigo
 *   Potencial até amanhã: depois das 18:00 ainda vale o Perigo Potencial);
 * - eventos diferentes (Tempestade e Baixa Umidade) ficam separados, porque os
 *   riscos e as orientações são outros;
 * - quem cobre vence depois de quem é coberto (fim maior ou igual): o aviso
 *   escondido nunca volta sozinho na tela por causa do relógio. Ele volta se a
 *   fonte cancelar o mais grave, porque aí deixa de haver quem o cubra.
 *
 * A lista recebida deve ser a de um só município: um Grande Perigo que cobre a
 * cidade A não diz nada sobre a cidade B.
 */
export function unificarAvisos<T extends AvisoUnificavel>(avisos: readonly T[]): T[] {
  const lidos: Lido<T>[] = avisos.map((aviso) => ({
    aviso,
    chave: chaveEvento(aviso),
    grau: GRAU_SEVERIDADE[aviso.severidade] ?? 0,
    inicio: new Date(aviso.inicio).getTime(),
    fim: new Date(aviso.fim).getTime(),
  }));
  return lidos.filter((menor) => !lidos.some((maior) => cobre(maior, menor))).map((lido) => lido.aviso);
}
