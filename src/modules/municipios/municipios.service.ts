import type { PoolClient } from "pg";
import { consultarUm } from "@/lib/db";
import { erros } from "@/lib/http";
import { z } from "@/lib/validacao";

// Municípios (Tarefa 5 da .specs/plano-tarefas-pendentes.md). A tabela tem
// todos os municípios do RS com o contorno do IBGE; `ativo` marca os que
// operam no WhereToGo (hoje, só Passo Fundo).

export interface MunicipioDoPonto {
  codigoIbge: string;
  nome: string;
  uf: string;
  /** Opera no WhereToGo: aceita abrigos. */
  ativo: boolean;
}

export const esquemaPonto = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/** "Passo Fundo/RS". */
export function descreverMunicipio(municipio: Pick<MunicipioDoPonto, "nome" | "uf">): string {
  return `${municipio.nome}/${municipio.uf}`;
}

/**
 * Município onde o ponto fica, ou `null` fora de todos os cadastrados.
 * A regra (contorno que cobre o ponto, senão o mais próximo a até 2 km) está em
 * `fn_municipio_do_ponto`, a mesma que o gatilho do abrigo usa.
 */
export function localizarMunicipio(latitude: number, longitude: number, client?: PoolClient): Promise<MunicipioDoPonto | null> {
  return consultarUm<MunicipioDoPonto>(
    `SELECT m.codigo_ibge AS "codigoIbge", m.nome, m.uf, m.ativo
       FROM municipio m
      WHERE m.codigo_ibge = fn_municipio_do_ponto($1, $2)`,
    [latitude, longitude],
    client,
  );
}

/**
 * Abrigo só em cidade onde o WhereToGo opera. O gatilho do banco garante que
 * a cidade gravada é a do ponto; esta checagem dá a mensagem para a tela e
 * recusa as cidades cadastradas que ainda não operam.
 */
export async function exigirMunicipioAtendido(latitude: number, longitude: number, client?: PoolClient): Promise<MunicipioDoPonto> {
  const municipio = await localizarMunicipio(latitude, longitude, client);
  if (!municipio) {
    throw erros.regraDeNegocio(
      "FORA_DOS_MUNICIPIOS",
      "Este ponto fica fora dos municípios cadastrados no WhereToGo. Confira a latitude e a longitude.",
    );
  }
  if (!municipio.ativo) {
    throw erros.regraDeNegocio(
      "MUNICIPIO_NAO_ATENDIDO",
      `Este ponto fica em ${descreverMunicipio(municipio)}, onde o WhereToGo ainda não opera.`,
    );
  }
  return municipio;
}
