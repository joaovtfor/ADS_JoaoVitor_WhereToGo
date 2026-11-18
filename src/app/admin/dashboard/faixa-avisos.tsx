"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { avisoEmVigor, descreverPeriodoAviso, filtrarAvisosNaoVencidos, obterNivelAviso, type AvisoOficialMapa } from "@/components/mapa/tipos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Faixa } from "@/components/ui/pagina";
import { SeloStatus } from "@/components/ui/selo-status";
import { pode } from "@/lib/auth/permissoes";
import { api, mensagemErro } from "@/lib/cliente-api";
import { useAdmin } from "../contexto-admin";

const GRAVIDADE_AVISO: Record<AvisoOficialMapa["severidade"], number> = { MODERADA: 1, SEVERA: 2, EXTREMA: 3 };

interface EstadoIntegracao {
  ativa: boolean;
  municipio: string;
  intervaloMin: number;
  ultimaTentativa: string | null;
  ultimoSucesso: string | null;
  falhasConsecutivas: number;
  pausadaAte: string | null;
  ultimoErro: string | null;
}

interface DadosAvisos {
  avisos: AvisoOficialMapa[];
  estado: EstadoIntegracao;
}

type ResultadoConsulta =
  | { situacao: "ok"; doMunicipio: number }
  | { situacao: "falha"; erro: string }
  | { situacao: "desativada" | "em-andamento" | "recente" | "pausada" };

const INTERVALO_MS = 60_000;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function descreverResultado(resultado: ResultadoConsulta): string {
  switch (resultado.situacao) {
    case "ok":
      return resultado.doMunicipio === 0
        ? "INMET consultado: nenhum aviso para o município."
        : `INMET consultado: ${resultado.doMunicipio === 1 ? "1 aviso" : `${resultado.doMunicipio} avisos`} para o município.`;
    case "em-andamento":
      return "Já há uma consulta ao INMET em andamento.";
    case "desativada":
      return "A consulta ao INMET está desligada neste servidor.";
    default:
      return "Consulta ao INMET registrada.";
  }
}

/** Linha de situação da consulta, só para quem pode agir sobre ela (ADMIN e Defesa Civil). */
function situacaoConsulta(estado: EstadoIntegracao): string {
  if (!estado.ativa) return "Consulta aos avisos do INMET desligada (INTEGRACAO_AVISOS_INMET=false).";
  if (estado.falhasConsecutivas > 0) {
    const pausa = estado.pausadaAte && Date.parse(estado.pausadaAte) > Date.now() ? ` Nova tentativa às ${hora(estado.pausadaAte)}.` : "";
    return `Consulta ao INMET falhando (${estado.falhasConsecutivas}x): ${estado.ultimoErro ?? "erro desconhecido"}.${pausa}`;
  }
  return estado.ultimoSucesso ? `Avisos do INMET consultados às ${hora(estado.ultimoSucesso)}.` : "Avisos do INMET ainda não consultados.";
}

interface PropriedadesFaixaAvisos {
  onAviso: (mensagem: string) => void;
  onErro: (mensagem: string) => void;
}

/**
 * Avisos meteorológicos oficiais (INMET) no topo da visão geral: são os mesmos
 * do mapa público, valem para o município inteiro (não para um abrigo). O
 * ADMIN vê também se a consulta está funcionando e pode forçar uma nova.
 */
export function FaixaAvisosOficiais({ onAviso, onErro }: PropriedadesFaixaAvisos) {
  const { usuario } = useAdmin();
  // Quem pode forçar a consulta (ADMIN e Defesa Civil) também vê se ela está funcionando.
  const ehAdmin = pode(usuario, "aviso:sincronizar");
  const [dados, setDados] = useState<DadosAvisos | null>(null);
  const [consultando, setConsultando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await api<DadosAvisos>("/api/integracoes/avisos"));
    } catch {
      // Falha ao ler os avisos não atrapalha a visão geral: a próxima leitura tenta de novo.
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(carregar);
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, INTERVALO_MS);
    return () => window.clearInterval(intervalo);
  }, [carregar]);

  async function consultarAgora() {
    setConsultando(true);
    try {
      const resposta = await api<DadosAvisos & { resultado: ResultadoConsulta }>("/api/integracoes/avisos/sincronizacao", { method: "POST" });
      setDados({ avisos: resposta.avisos, estado: resposta.estado });
      if (resposta.resultado.situacao === "falha") onErro(`O INMET não respondeu: ${resposta.resultado.erro}`);
      else onAviso(descreverResultado(resposta.resultado));
    } catch (erro) {
      onErro(mensagemErro(erro));
    } finally {
      setConsultando(false);
    }
  }

  if (!dados) return null;
  const avisos = filtrarAvisosNaoVencidos(dados.avisos);
  // Em vigor: uma faixa cada. Previstos: uma linha só, com o mais grave, para não empurrar a operação para baixo.
  const emVigor = avisos.filter((aviso) => avisoEmVigor(aviso));
  const previstos = avisos.filter((aviso) => !avisoEmVigor(aviso));
  const previstoMaisGrave = [...previstos].sort((a, b) => GRAVIDADE_AVISO[b.severidade] - GRAVIDADE_AVISO[a.severidade])[0];
  const { estado } = dados;
  const consultaComProblema = estado.ativa && estado.falhasConsecutivas > 0;
  if (avisos.length === 0 && !ehAdmin) return null;

  return (
    <div className="space-y-2">
      {emVigor.map((aviso) => (
        <Faixa
          key={aviso.id}
          nivel={obterNivelAviso(aviso.severidade) === "critico" ? "critico" : "atencao"}
          acoes={
            aviso.link && (
              <a href={aviso.link} target="_blank" rel="noopener noreferrer" className={classesBotao("secundaria", "sm")}>
                Ver no INMET
              </a>
            )
          }
        >
          <strong className="font-semibold">
            Aviso do INMET: {aviso.evento} ({aviso.rotuloSeveridade})
          </strong>
          , em vigor {descreverPeriodoAviso(aviso)}. {aviso.riscos[0]}
        </Faixa>
      ))}

      {previstoMaisGrave && (
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-texto-2">
          <SeloStatus nivel={obterNivelAviso(previstoMaisGrave.severidade)}>
            {previstos.length === 1 ? "1 aviso do INMET previsto" : `${previstos.length} avisos do INMET previstos`}
          </SeloStatus>
          <span>
            · o mais grave: {previstoMaisGrave.evento} ({previstoMaisGrave.rotuloSeveridade}) {descreverPeriodoAviso(previstoMaisGrave)}.
          </span>
          {previstoMaisGrave.link && (
            <a href={previstoMaisGrave.link} target="_blank" rel="noopener noreferrer" className={classesBotao("fantasma", "sm")}>
              Ver no INMET
            </a>
          )}
        </p>
      )}

      {ehAdmin &&
        (consultaComProblema ? (
          <Faixa
            nivel="critico"
            acoes={
              <Botao tamanho="sm" icone={RefreshCw} disabled={consultando} onClick={() => void consultarAgora()}>
                {consultando ? "Consultando..." : "Consultar agora"}
              </Botao>
            }
          >
            {situacaoConsulta(estado)}
          </Faixa>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-texto-3">
            <span>{situacaoConsulta(estado)}</span>
            {estado.ativa && (
              <Botao variante="fantasma" tamanho="sm" icone={RefreshCw} disabled={consultando} onClick={() => void consultarAgora()}>
                {consultando ? "Consultando..." : "Consultar agora"}
              </Botao>
            )}
          </div>
        ))}
    </div>
  );
}
