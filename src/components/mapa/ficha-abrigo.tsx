"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, HeartHandshake, MapPin, Phone, Route, Share2, TriangleExclamationPoint, Users, Zap } from "lucide-react";
import { BotaoIcone, classesBotao, classesBotaoIcone } from "@/components/ui/botao";
import { juntarClasses } from "@/components/ui/classes";
import { Folha, type NavegacaoFolha } from "@/components/ui/folha";
import { Icone } from "@/components/ui/icone";
import { SeloStatus } from "@/components/ui/selo-status";
import { useToast } from "@/components/ui/toast";
import { CartaoPix } from "./cartao-pix";
import { LinhaFicha } from "./linha-ficha";
import {
  obterSeloAtualizacao,
  obterStatusInfra,
  obterStatusOcupacao,
  resumoParaCompartilhar,
  ROTULO_OCORRENCIA,
  type AbrigoMapa,
  type DetalheAbrigoPublico,
} from "./tipos";

interface PropriedadesFichaAbrigo {
  abrigo: AbrigoMapa;
  categoriaSlug: string | null;
  itemFiltroId: number | null;
  posicaoNaLista: { indice: number; total: number };
  /** Localização já obtida (GPS), usada como ponto de partida da rota. */
  posicaoUsuario: Posicao | null;
  /** Versão dos dados do mapa: quando muda, a ficha recarrega os detalhes. */
  versaoDados: string | null;
  /** Lê a localização na hora, quando ainda não há uma. `null` se não for possível. */
  obterOrigemRota: () => Promise<Posicao | null>;
  onNavegar: (direcao: -1 | 1) => void;
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
}

type Posicao = { lat: number; lng: number };

/**
 * Rota no Google Maps da localização atual até o abrigo. Sem `origin`, o Maps
 * no navegador abre só o destino (ou parte de um ponto aproximado) e o trajeto
 * fica incompleto.
 */
function urlRotaGoogle(base: string, origem: Posicao | null): string {
  if (!origem) return base;
  const url = new URL(base);
  url.searchParams.set("origin", `${origem.lat},${origem.lng}`);
  return url.toString();
}

/**
 * Detalhes do card (rotas, PIX, ocorrências): carregados ao abrir e de novo a
 * cada versão nova do mapa (tempo real), com cancelamento ao trocar de abrigo.
 * A versão vai na URL: cada versão é uma entrada nova na CDN, que de outro
 * modo poderia devolver a ficha de antes da mudança.
 */
function useDetalheAbrigo(id: number, versaoDados: string | null) {
  const [resultado, setResultado] = useState<{ id: number; dados: DetalheAbrigoPublico | null } | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    const url = `/api/public/abrigos/${id}${versaoDados ? `?v=${encodeURIComponent(versaoDados)}` : ""}`;
    // Falhou ao atualizar: continua com os detalhes que já estavam na tela.
    const manterOuVazio = (atual: typeof resultado) => (atual?.id === id && atual.dados ? atual : { id, dados: null });
    fetch(url, { signal: controlador.signal })
      .then(async (resposta) => {
        if (!resposta.ok) return setResultado(manterOuVazio);
        const { dados } = (await resposta.json()) as { dados: DetalheAbrigoPublico };
        setResultado({ id, dados });
      })
      .catch(() => {
        // Sem rede: a ficha segue com os dados da listagem (rotas montadas abaixo).
        if (!controlador.signal.aborted) setResultado(manterOuVazio);
      });
    return () => controlador.abort();
  }, [id, versaoDados]);

  const doAbrigoAtual = resultado?.id === id ? resultado : null;
  return { detalhe: doAbrigoAtual?.dados ?? null, carregando: doAbrigoAtual === null };
}

async function compartilhar(abrigo: AbrigoMapa): Promise<boolean> {
  const url = new URL(window.location.origin);
  url.searchParams.set("abrigo", String(abrigo.id));
  const texto = resumoParaCompartilhar(abrigo, url.toString());

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `WhereToGo • ${abrigo.nome}`, text: texto, url: url.toString() });
      return false;
    } catch {
      // Compartilhamento cancelado ou indisponível: copia o resumo.
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** O que a pessoa precisa saber antes de sair de casa, em linguagem direta. */
function avisosDeDeslocamento(abrigo: AbrigoMapa): string[] {
  const avisos: string[] = [];
  if (abrigo.rotaCruzaAreaRisco) avisos.push("O caminho direto até este abrigo passa por uma área de risco. Procure um desvio seguro.");
  if (abrigo.emAreaDeRisco) avisos.push("Este abrigo fica dentro de uma área de risco demarcada.");
  else if (abrigo.statusInfraestrutura !== "NORMAL") avisos.push("Há alerta de acesso ou infraestrutura neste abrigo. Confira abaixo antes de sair.");
  return avisos;
}

/**
 * Ficha do abrigo selecionado: folha inferior no celular, painel lateral no desktop.
 * Ordem fixa (DESIGN.md §5.1): estado, número de vagas, ação de rota e, depois, os detalhes.
 */
export function FichaAbrigo({
  abrigo,
  categoriaSlug,
  itemFiltroId,
  posicaoNaLista,
  posicaoUsuario,
  versaoDados,
  obterOrigemRota,
  onNavegar,
  navegacao,
  onFechar,
}: PropriedadesFichaAbrigo) {
  const { detalhe, carregando } = useDetalheAbrigo(abrigo.id, versaoDados);
  const { mostrar: mostrarToast } = useToast();
  const [resumoCopiado, setResumoCopiado] = useState(false);
  const [obtendoOrigem, setObtendoOrigem] = useState(false);

  const { ocupacao } = abrigo;
  const vagas = Math.max(0, ocupacao.vagasDisponiveis);
  const statusOcupacao = obterStatusOcupacao(ocupacao);
  const statusInfra = obterStatusInfra(abrigo.statusInfraestrutura);
  const atualizacao = obterSeloAtualizacao(abrigo.atualizadoEm);
  const avisos = avisosDeDeslocamento(abrigo);
  // Vermelho só para risco no caminho ou infraestrutura crítica; alerta parcial fica em âmbar.
  const avisoCritico = abrigo.rotaCruzaAreaRisco === true || abrigo.emAreaDeRisco || abrigo.statusInfraestrutura === "CRITICO";
  const perfis = [abrigo.aceitaPets ? "Pets" : null, abrigo.acessivelPcd ? "Pessoas com deficiência" : null].filter(Boolean);

  const rotas = detalhe?.rotas ?? {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${abrigo.latitude},${abrigo.longitude}`,
    waze: `https://waze.com/ul?ll=${abrigo.latitude},${abrigo.longitude}&navigate=yes`,
  };

  useEffect(() => {
    if (!resumoCopiado) return;
    const temporizador = window.setTimeout(() => setResumoCopiado(false), 3000);
    return () => window.clearTimeout(temporizador);
  }, [resumoCopiado]);

  /**
   * Sem localização ainda: pede a posição nesta aba (onde o aviso de permissão
   * aparece) e só então abre a rota completa. Com localização, o link já sai
   * pronto e abre direto.
   */
  async function tracarRotaComLocalizacao() {
    if (obtendoOrigem) return;
    setObtendoOrigem(true);
    const origem = await obterOrigemRota();
    setObtendoOrigem(false);

    const janela = window.open(urlRotaGoogle(rotas.googleMaps, origem), "_blank");
    if (janela) janela.opener = null;

    if (!origem) {
      mostrarToast("Não foi possível usar sua localização. Informe o ponto de partida no Google Maps.", { tipo: "aviso" });
    } else if (!janela) {
      // O navegador bloqueou a nova aba (a permissão demorou): agora o link já tem a origem.
      mostrarToast("Localização obtida. Toque em Traçar rota de novo para abrir o trajeto.", { tipo: "info" });
    }
  }

  async function compartilharAbrigo() {
    const copiado = await compartilhar(abrigo);
    setResumoCopiado(copiado);
    if (copiado) mostrarToast("Resumo do abrigo copiado. É só colar na conversa.");
  }

  return (
    <Folha
      rotulo={`Detalhes do abrigo ${abrigo.nome}`}
      rotuloFechar="Fechar painel"
      onFechar={onFechar}
      {...navegacao}
      titulo={
        <>
          <h2 className="line-clamp-2 text-titulo font-semibold text-texto">{abrigo.nome}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-texto-3">
            <SeloStatus nivel={statusOcupacao.nivel}>{statusOcupacao.rotulo}</SeloStatus>
            {abrigo.distanciaKm !== null && <span className="tabular-nums">· {abrigo.distanciaKm.toFixed(1)} km</span>}
            {atualizacao.desatualizado ? (
              <SeloStatus nivel="atencao">Sem atualização {atualizacao.rotulo.toLowerCase()}</SeloStatus>
            ) : (
              // O texto relativo ("há 5 min") pode virar de minuto entre o servidor e o navegador.
              <span suppressHydrationWarning className="tabular-nums">
                · {atualizacao.rotulo}
              </span>
            )}
          </p>
        </>
      }
      rodape={
        posicaoNaLista.total > 1 && (
          <nav aria-label="Navegar entre abrigos" className="flex items-center justify-between">
            <BotaoIcone icone={ChevronLeft} rotulo="Abrigo anterior" onClick={() => onNavegar(-1)} />
            <span className="text-meta text-texto-3 tabular-nums">
              {posicaoNaLista.indice + 1} de {posicaoNaLista.total}
            </span>
            <BotaoIcone icone={ChevronRight} rotulo="Próximo abrigo" onClick={() => onNavegar(1)} />
          </nav>
        )
      }
    >
      <p className="flex items-baseline gap-2 pt-4 pb-3">
        <span className="text-numero font-semibold tabular-nums text-texto">{vagas}</span>
        <span className="text-corpo text-texto-2">{vagas === 1 ? "vaga livre" : "vagas livres"}</span>
        <span className="ml-auto text-meta text-texto-3 tabular-nums">
          {ocupacao.lotacaoAtual} de {ocupacao.capacidadeMaxima} ocupadas
        </span>
      </p>

      <div className="flex gap-2 pb-4">
        <a
          href={urlRotaGoogle(rotas.googleMaps, posicaoUsuario)}
          target="_blank"
          rel="noopener noreferrer"
          aria-busy={obtendoOrigem || undefined}
          onClick={(e) => {
            if (posicaoUsuario) return;
            e.preventDefault();
            void tracarRotaComLocalizacao();
          }}
          className={classesBotao("primaria", "md", juntarClasses("min-w-0 flex-1", obtendoOrigem && "animate-pulse"))}
        >
          <Icone de={Route} />
          {obtendoOrigem ? "Localizando..." : "Traçar rota"}
        </a>
        <a href={rotas.waze} target="_blank" rel="noopener noreferrer" className={classesBotao("secundaria")}>
          Waze
        </a>
        {abrigo.telefone && (
          <a
            href={`tel:${abrigo.telefone.replace(/\D/g, "")}`}
            aria-label={`Ligar para o abrigo: ${abrigo.telefone}`}
            title={`Ligar: ${abrigo.telefone}`}
            className={classesBotaoIcone("secundaria")}
          >
            <Icone de={Phone} tamanho={20} />
          </a>
        )}
        <BotaoIcone
          icone={resumoCopiado ? Check : Share2}
          rotulo={resumoCopiado ? "Resumo copiado" : "Compartilhar este abrigo"}
          variante="secundaria"
          onClick={() => void compartilharAbrigo()}
        />
      </div>

      {avisos.length > 0 && (
        <div
          role="alert"
          className={juntarClasses(
            "mb-4 flex gap-2.5 rounded-controle p-3 text-meta",
            avisoCritico ? "bg-critico/12 text-critico-claro" : "bg-atencao/12 text-atencao-claro",
          )}
        >
          <Icone de={TriangleExclamationPoint} className="mt-0.5" />
          <div className="space-y-1">
            {avisos.map((aviso) => (
              <p key={aviso}>{aviso}</p>
            ))}
          </div>
        </div>
      )}

      <LinhaFicha icone={MapPin} rotulo="Endereço">
        {abrigo.endereco}
      </LinhaFicha>

      <LinhaFicha icone={Zap} rotulo="Acesso e infraestrutura">
        <SeloStatus nivel={statusInfra.nivel}>{statusInfra.rotulo}</SeloStatus>
        {detalhe && detalhe.ocorrenciasAtivas.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {detalhe.ocorrenciasAtivas.map((ocorrencia) => (
              <li key={ocorrencia.id} className="text-meta text-texto-2">
                <span className="block text-texto">{ROTULO_OCORRENCIA[ocorrencia.tipo] ?? "Alerta no abrigo"}</span>
                {ocorrencia.descricao}
              </li>
            ))}
          </ul>
        ) : (
          carregando && abrigo.ocorrenciasAtivas.length > 0 && <p className="mt-1 text-meta text-texto-3">Carregando detalhes...</p>
        )}
      </LinhaFicha>

      {perfis.length > 0 && (
        <LinhaFicha icone={Users} rotulo="Também recebe">
          {perfis.join(" e ")}
        </LinhaFicha>
      )}

      <LinhaFicha icone={HeartHandshake} rotulo="Precisa de doações">
        {abrigo.necessidades.urgentes.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {abrigo.necessidades.urgentes.map((item) => {
              const bateFiltro =
                (categoriaSlug !== null && item.categoria === categoriaSlug) || (itemFiltroId !== null && item.id === itemFiltroId);
              return (
                <li
                  key={item.id}
                  className={juntarClasses(
                    "rounded-controle border px-2 py-0.5 text-meta",
                    bateFiltro ? "border-primaria bg-primaria/15 text-primaria-clara" : "border-borda-forte text-texto",
                  )}
                >
                  {item.nome}
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="text-texto-2">Nenhum item em falta no momento.</span>
        )}
        {abrigo.necessidades.bloqueados.length > 0 && (
          <p className="mt-2 text-meta text-texto-3">
            Estoque cheio, evite enviar agora: {abrigo.necessidades.bloqueados.map((item) => item.nome).join(", ")}.
          </p>
        )}
      </LinhaFicha>

      <CartaoPix pix={detalhe?.pix ?? null} carregando={carregando} />
    </Folha>
  );
}
