import { consultar } from "@/lib/db";
import {
  DESCRICAO_TIPO_MOVIMENTACAO,
  DESCRICAO_TIPO_OCORRENCIA,
  GRAVIDADE_PADRAO,
  GRAVIDADES,
  STATUS_ACOLHIMENTO,
  TIPOS_MOVIMENTACAO,
  TIPOS_OCORRENCIA,
} from "../dominio";

/** Domínios de valores para montar formulários e legendas no frontend. */
export async function listarReferencias() {
  const [papeis, statusNecessidade] = await Promise.all([
    consultar("SELECT nome AS codigo, descricao FROM papel_usuario ORDER BY id"),
    consultar(
      `SELECT codigo, descricao, nivel_prioridade AS "nivelPrioridade" FROM status_necessidade ORDER BY nivel_prioridade`,
    ),
  ]);

  return {
    papeis,
    statusNecessidade,
    tiposMovimentacao: TIPOS_MOVIMENTACAO.map((codigo) => ({ codigo, descricao: DESCRICAO_TIPO_MOVIMENTACAO[codigo] })),
    tiposOcorrencia: TIPOS_OCORRENCIA.map((codigo) => ({
      codigo,
      descricao: DESCRICAO_TIPO_OCORRENCIA[codigo],
      gravidadePadrao: GRAVIDADE_PADRAO[codigo],
    })),
    gravidades: GRAVIDADES,
    statusAcolhimento: STATUS_ACOLHIMENTO,
    niveisOcupacao: [
      { codigo: "VERDE", descricao: "Menos de 70% ocupado" },
      { codigo: "AMARELO", descricao: "Entre 70% e 90% ocupado" },
      { codigo: "VERMELHO", descricao: "Acima de 90% ocupado ou lotado" },
    ],
  };
}
