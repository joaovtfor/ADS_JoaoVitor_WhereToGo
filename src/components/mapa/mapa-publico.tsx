"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BarraFiltros, PainelFiltros } from "@/components/mapa/barra-filtros";
import { BarraResumo } from "@/components/mapa/barra-resumo";
import { CabecalhoMapa } from "@/components/mapa/cabecalho-mapa";
import { FichaAbrigo } from "@/components/mapa/ficha-abrigo";
import { abrigoMaisProximo, filtrarAbrigos } from "@/components/mapa/filtrar-abrigos";
import { SeloAvisoOficial } from "@/components/mapa/avisos-oficiais";
import { ListaAbrigos, PainelAlertas, PainelBuscaFamiliar } from "@/components/mapa/paineis-laterais";
import { ATALHOS_FILTRO, filtrarAvisosNaoVencidos, type AlertaMapa, type FiltroRapido } from "@/components/mapa/tipos";
import { useDadosMapa, type DadosIniciaisMapa } from "@/components/mapa/use-dados-mapa";
import { useServiceWorker } from "@/components/mapa/use-service-worker";
import { juntarClasses } from "@/components/ui/classes";
import type { NavegacaoFolha } from "@/components/ui/folha";
import { SeloStatus, type NivelStatus } from "@/components/ui/selo-status";
import { ProvedorToast, RegiaoToasts, useToast } from "@/components/ui/toast";

const MapaPublicoLeaflet = dynamic(() => import("@/components/mapa-publico-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-superficie p-6">
      <div className="size-8 animate-spin rounded-full border-2 border-primaria-clara border-t-transparent" />
      <p className="text-corpo text-texto-2">Carregando o mapa...</p>
    </div>
  ),
});

type Posicao = { lat: number; lng: number };
/** Telas do painel do mapa. A ficha do abrigo é uma delas: tudo abre no mesmo lugar. */
type Tela = "lista" | "filtros" | "alertas" | "familiares" | "abrigo";
/** Como cada tela é chamada no botão de voltar ("Voltar para ..."). A ficha usa o nome do abrigo. */
const NOME_PARA_VOLTAR: Record<Exclude<Tela, "abrigo">, string> = {
  lista: "a lista de abrigos",
  filtros: "os filtros",
  alertas: "alertas e avisos",
  familiares: "a busca de familiar",
};
/** O que pediu para selecionar automaticamente o abrigo mais adequado. */
type MotivoAutoSelecao = "gps" | "filtro";

/** Id dos toasts de seleção automática: um novo substitui o anterior em vez de empilhar. */
const TOAST_SELECAO = "selecao";

/** Pede a localização ao navegador: tenta o GPS preciso e, se falhar ou demorar, aceita a aproximada. */
function pedirLocalizacao(): Promise<Posicao> {
  return new Promise((resolver, rejeitar) => {
    if (!("geolocation" in navigator)) return rejeitar(new Error("sem-geolocalizacao"));
    const aoObter = (pos: GeolocationPosition) => resolver({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    navigator.geolocation.getCurrentPosition(
      aoObter,
      () =>
        navigator.geolocation.getCurrentPosition(aoObter, rejeitar, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

function lerAbrigoDaUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get("abrigo"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function atualizarAbrigoNaUrl(id: number | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("abrigo", String(id));
  else url.searchParams.delete("abrigo");
  window.history.replaceState({}, "", url.toString());
}

/** "14:32" (hoje) ou "28/10 14:32" (outro dia). */
function formatarMomento(iso: string): string {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return data.toDateString() === new Date().toDateString()
    ? hora
    : `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/**
 * Aviso persistente sobre o mapa (sem conexão, falha ao carregar): fica enquanto
 * o estado durar. Retornos de ação usam toast (`useToast`).
 */
function Aviso({ nivel, urgente = false, children }: { nivel: NivelStatus; urgente?: boolean; children: ReactNode }) {
  return (
    <div
      role={urgente ? "alert" : "status"}
      className="pointer-events-auto flex w-fit max-w-full items-center rounded-controle border border-borda bg-superficie px-3 py-1"
    >
      <SeloStatus nivel={nivel} className="py-1.5">
        <span>{children}</span>
      </SeloStatus>
    </div>
  );
}

interface PropriedadesMapaPublico {
  /** Abrigos, alertas e categorias já lidos pelo servidor; `null` se a leitura falhou. */
  inicial: DadosIniciaisMapa | null;
  /** Abrigo do link compartilhado (?abrigo=ID), lido pelo servidor. */
  abrigoInicial: number | null;
}

/** A tela do mapa público. Recebe os primeiros dados prontos e segue atualizando sozinha. */
export function MapaPublico(propriedades: PropriedadesMapaPublico) {
  return (
    <ProvedorToast>
      <TelaMapaPublico {...propriedades} />
    </ProvedorToast>
  );
}

function TelaMapaPublico({ inicial, abrigoInicial }: PropriedadesMapaPublico) {
  useServiceWorker();
  const { mostrar: mostrarToast, fechar: fecharToast } = useToast();

  // Filtros (RF08)
  const [termoBusca, setTermoBusca] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("TODOS");
  const [categoriaSlug, setCategoriaSlug] = useState<string | null>(null);
  const [itemFiltroId, setItemFiltroId] = useState<number | null>(null);
  const [raioKm, setRaioKm] = useState<number | null>(null);
  const [ocultarNaoDestaque, setOcultarNaoDestaque] = useState(false);

  // Camadas (RF09) e o painel único: uma pilha de telas, sem repetição. A de cima
  // aparece; as de baixo continuam montadas (rolagem, busca, formulário) e
  // "voltar" as traz de volta como estavam.
  const [camadaAlertasVisivel, setCamadaAlertasVisivel] = useState(true);
  const [pilha, setPilha] = useState<Tela[]>(abrigoInicial ? ["abrigo"] : []);
  const [enquadrarTick, setEnquadrarTick] = useState(0);

  // Localização do doador/cidadão (distância e raio calculados no servidor)
  const [posicaoUsuario, setPosicaoUsuario] = useState<Posicao | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);

  // Abrigo selecionado (ficha - RF07), com link compartilhável ?abrigo=ID
  const [idSelecionado, setIdSelecionado] = useState<number | null>(abrigoInicial);
  const [focoTick, setFocoTick] = useState(0);
  const [focoCoordenada, setFocoCoordenada] = useState<{ lat: number; lng: number; tick: number } | null>(null);
  const [autoSelecao, setAutoSelecao] = useState<MotivoAutoSelecao | null>(null);

  const { abrigos, alertas, avisos, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, versao, recarregar } = useDadosMapa(
    posicaoUsuario,
    raioKm,
    inicial,
  );

  // Relógio dos avisos oficiais: tira da tela os que venceram (dados salvos do
  // modo offline podem ter horas). Começa nulo e só liga no navegador: o
  // servidor (UTC) escreveria os horários em outro fuso e o texto não bateria
  // com o da hidratação.
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const atualizar = () => setAgora(Date.now());
    void Promise.resolve().then(atualizar);
    const relogio = window.setInterval(atualizar, 60_000);
    return () => window.clearInterval(relogio);
  }, []);
  const avisosValidos = useMemo(() => (agora === null ? [] : filtrarAvisosNaoVencidos(avisos, agora)), [avisos, agora]);

  // A página pode ter vindo do cache offline (gerada para outro endereço): vale o que está na URL.
  useEffect(() => {
    void Promise.resolve().then(() => {
      const id = lerAbrigoDaUrl();
      setIdSelecionado(id);
      setPilha(id ? ["abrigo"] : []);
    });
  }, []);

  const abrigosFiltrados = useMemo(
    () => filtrarAbrigos(abrigos, { termoBusca, filtroRapido, ocultarNaoDestaque, categoriaSlug, itemFiltroId }),
    [abrigos, termoBusca, filtroRapido, ocultarNaoDestaque, categoriaSlug, itemFiltroId],
  );

  const resumo = useMemo(
    () => ({
      vagasLivres: abrigosFiltrados.reduce((total, a) => total + Math.max(0, a.ocupacao.vagasDisponiveis), 0),
      prioritarios: abrigosFiltrados.filter((a) => a.destaque === true).length,
    }),
    [abrigosFiltrados],
  );

  const indiceSelecionado = abrigosFiltrados.findIndex((a) => a.id === idSelecionado);
  const abrigoSelecionado =
    (indiceSelecionado >= 0 ? abrigosFiltrados[indiceSelecionado] : abrigos.find((a) => a.id === idSelecionado)) ?? null;

  // A ficha só conta se o abrigo existe (um link antigo pode apontar para um abrigo desativado).
  const pilhaVisivel = useMemo(() => (abrigoSelecionado ? pilha : pilha.filter((tela) => tela !== "abrigo")), [pilha, abrigoSelecionado]);
  const telaAtual = pilhaVisivel.at(-1) ?? null;

  /** Abre a ficha do abrigo por cima do que estiver aberto (lista, alertas...): "voltar" retorna a isso. */
  const selecionarAbrigo = useCallback((id: number) => {
    setIdSelecionado(id);
    setFocoTick((t) => t + 1);
    atualizarAbrigoNaUrl(id);
    setPilha((atual) => [...atual.filter((tela) => tela !== "abrigo"), "abrigo"]);
  }, []);

  /** Troca a pilha inteira. Se a ficha sai dela, o abrigo deixa de estar selecionado. */
  const trocarPilha = useCallback((nova: Tela[]) => {
    setPilha(nova);
    if (!nova.includes("abrigo")) {
      setIdSelecionado(null);
      atualizarAbrigoNaUrl(null);
    }
  }, []);

  const fecharPainel = useCallback(() => trocarPilha([]), [trocarPilha]);
  const voltar = useCallback(() => trocarPilha(pilhaVisivel.slice(0, -1)), [trocarPilha, pilhaVisivel]);

  /** Traz a tela para o topo; se já estava na pilha, ela sai de onde estava (não repete). */
  function abrirTela(tela: Exclude<Tela, "abrigo">) {
    trocarPilha([...pilhaVisivel.filter((t) => t !== tela), tela]);
  }

  /** Para botões liga/desliga: se a tela já está à vista, volta; senão, abre. */
  function alternarTela(tela: Exclude<Tela, "abrigo">) {
    if (telaAtual === tela) voltar();
    else abrirTela(tela);
  }

  /** Posição da tela na pilha: oculta se há outra por cima, e o voltar para a de baixo. */
  function navegacaoDa(tela: Tela): NavegacaoFolha {
    const posicao = pilhaVisivel.indexOf(tela);
    const abaixo = posicao > 0 ? pilhaVisivel[posicao - 1] : null;
    const nomeAbaixo = abaixo === "abrigo" ? (abrigoSelecionado?.nome ?? "o abrigo") : abaixo ? NOME_PARA_VOLTAR[abaixo] : null;
    return {
      oculta: posicao !== pilhaVisivel.length - 1,
      voltar: nomeAbaixo ? { rotulo: `Voltar para ${nomeAbaixo}`, onVoltar: voltar } : undefined,
    };
  }

  useEffect(() => {
    // Esc volta uma tela, como o botão de voltar do painel; na última, fecha o painel.
    // Um Esc já usado (ex.: para fechar o menu do cabeçalho) não conta.
    const aoPressionar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && pilhaVisivel.length > 0) voltar();
    };
    window.addEventListener("keydown", aoPressionar);
    return () => window.removeEventListener("keydown", aoPressionar);
  }, [voltar, pilhaVisivel.length]);

  // Seleciona o abrigo mais adequado depois que a lista reflete o GPS/filtro escolhido.
  useEffect(() => {
    if (!autoSelecao) return;
    if (posicaoUsuario && posicaoDosDados !== posicaoUsuario) return; // aguarda as distâncias calculadas

    void Promise.resolve().then(() => {
      if (abrigosFiltrados.length === 0) {
        if (autoSelecao === "gps" && abrigos.length > 0) {
          // A busca/filtro rápido esconde tudo: limpa e tenta de novo com a lista completa.
          setTermoBusca("");
          setFiltroRapido("TODOS");
          setOcultarNaoDestaque(false);
          return;
        }
        setAutoSelecao(null);
        if (autoSelecao === "gps") {
          mostrarToast("Localização obtida, mas nenhum abrigo ativo foi encontrado nesta distância.", { tipo: "aviso", id: TOAST_SELECAO });
        }
        return;
      }

      // "Perto de mim" vai ao mais próximo de fato, só pela distância. Os filtros
      // de doação vão ao mais próximo que precisa do item (a ordem da lista).
      const comFiltroDoacao = autoSelecao === "filtro" && Boolean(categoriaSlug || itemFiltroId);
      const alvo =
        (autoSelecao === "gps" && posicaoUsuario && abrigoMaisProximo(abrigosFiltrados, posicaoUsuario)) ||
        (comFiltroDoacao && abrigosFiltrados.find((a) => a.destaque)) ||
        abrigosFiltrados[0];
      setAutoSelecao(null);
      selecionarAbrigo(alvo.id);
      const distancia = alvo.distanciaKm !== null ? ` (${alvo.distanciaKm.toFixed(1)} km)` : "";
      mostrarToast(
        comFiltroDoacao && alvo.destaque
          ? `Mais próximo que precisa da sua doação: ${alvo.nome}${distancia}`
          : `Abrigo mais próximo: ${alvo.nome}${distancia}`,
        { tipo: "info", id: TOAST_SELECAO },
      );
    });
  }, [
    autoSelecao,
    posicaoUsuario,
    posicaoDosDados,
    abrigos.length,
    abrigosFiltrados,
    categoriaSlug,
    itemFiltroId,
    selecionarAbrigo,
    mostrarToast,
  ]);

  function avisarFalhaLocalizacao(erro: unknown) {
    mostrarToast(
      erro instanceof Error && erro.message === "sem-geolocalizacao"
        ? "Seu navegador não permite usar a localização."
        : "Não foi possível obter sua localização (permissão negada ou indisponível).",
      { tipo: "aviso", id: TOAST_SELECAO },
    );
  }

  /**
   * "Abrigos perto de mim": sempre lê a localização de novo (a pessoa pode ter
   * andado) e vai ao abrigo mais próximo, mesmo que outro esteja aberto.
   */
  async function irAoMaisProximo(motivo: MotivoAutoSelecao = "gps") {
    if (buscandoGps) return;
    setBuscandoGps(true);
    fecharToast(TOAST_SELECAO);
    try {
      const posicao = await pedirLocalizacao();
      setPosicaoUsuario(posicao);
      setAutoSelecao(motivo);
    } catch (erro) {
      // Sem localização, o filtro de doação ainda escolhe o primeiro da lista.
      setAutoSelecao(motivo === "filtro" ? "filtro" : null);
      avisarFalhaLocalizacao(erro);
    } finally {
      setBuscandoGps(false);
    }
  }

  /** Para de usar a localização: some o ponto azul, a distância e o filtro de raio. */
  function pararDeUsarLocalizacao() {
    setPosicaoUsuario(null);
    setRaioKm(null);
    fecharToast(TOAST_SELECAO);
  }

  /**
   * Origem da rota: a localização já obtida ou, se ainda não houver, uma leitura
   * nova (sem trocar o abrigo aberto). `null` se a pessoa negar ou não houver GPS.
   */
  const obterOrigemRota = useCallback(async (): Promise<Posicao | null> => {
    if (posicaoUsuario) return posicaoUsuario;
    try {
      const posicao = await pedirLocalizacao();
      setPosicaoUsuario(posicao);
      return posicao;
    } catch {
      return null;
    }
  }, [posicaoUsuario]);

  /** Filtros que buscam "o mais próximo": pedem a localização se ainda não houver. */
  function pedirAutoSelecao() {
    if (!posicaoUsuario && !buscandoGps) void irAoMaisProximo("filtro");
    else setAutoSelecao("filtro");
  }

  function limparFiltroCategoria() {
    setCategoriaSlug(null);
    setItemFiltroId(null);
    setOcultarNaoDestaque(false);
    fecharToast(TOAST_SELECAO);
  }

  function limparTodosFiltros() {
    limparFiltroCategoria();
    setFiltroRapido("TODOS");
    setRaioKm(null);
    setTermoBusca("");
  }

  /** Um filtro de abrigo por vez: tocar no que já está ligado desliga. */
  function alternarFiltroRapido(filtro: FiltroRapido) {
    if (filtroRapido === filtro) return setFiltroRapido("TODOS");
    setFiltroRapido(filtro);
    pedirAutoSelecao();
  }

  function navegarAbrigoVizinho(direcao: -1 | 1) {
    if (abrigosFiltrados.length === 0) return;
    const atual = Math.max(0, indiceSelecionado);
    selecionarAbrigo(abrigosFiltrados[(atual + direcao + abrigosFiltrados.length) % abrigosFiltrados.length].id);
  }

  function verAlertaNoMapa(alerta: AlertaMapa) {
    setCamadaAlertasVisivel(true);
    setFocoCoordenada({ lat: alerta.latitude, lng: alerta.longitude, tick: Date.now() });
  }

  const temFiltroAtivo =
    filtroRapido !== "TODOS" || categoriaSlug !== null || itemFiltroId !== null || raioKm !== null || ocultarNaoDestaque || termoBusca.trim() !== "";

  // Filtros ativos que não aparecem como atalho na faixa: entram no contador do botão "Filtros".
  const totalOutrosFiltros =
    Number(filtroRapido !== "TODOS" && !ATALHOS_FILTRO.some((atalho) => atalho.id === filtroRapido)) +
    Number(categoriaSlug !== null) +
    Number(raioKm !== null);

  const gpsAtivo = posicaoUsuario !== null;

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-fundo text-texto">
      <CabecalhoMapa
        totalAlertas={alertas.length + avisosValidos.length}
        termoBusca={termoBusca}
        onBuscar={setTermoBusca}
        onConfirmarBusca={() => abrigosFiltrados[0] && selecionarAbrigo(abrigosFiltrados[0].id)}
        telaAberta={telaAtual === "alertas" || telaAtual === "familiares" ? telaAtual : null}
        onAbrirTela={abrirTela}
        onAlternarTela={alternarTela}
        onAtualizar={recarregar}
      />

      <main className="relative h-full w-full flex-1 overflow-hidden">
        <MapaPublicoLeaflet
          abrigos={abrigosFiltrados}
          alertas={alertas}
          mostrarAlertas={camadaAlertasVisivel}
          idSelecionado={idSelecionado}
          focoTick={focoTick}
          focoCoordenada={focoCoordenada}
          enquadrarTick={enquadrarTick}
          posicaoUsuario={posicaoUsuario}
          painelAberto={pilhaVisivel.length > 0}
          aoSelecionarAbrigo={selecionarAbrigo}
        />

        {/* Filtros, avisos e toasts flutuam no alto do mapa; no desktop, à direita do painel aberto */}
        <div
          className={juntarClasses(
            "pointer-events-none absolute inset-x-3 top-3 z-[400] flex flex-col items-start gap-2",
            pilhaVisivel.length > 0 && "sm:left-[424px]",
          )}
        >
          <BarraFiltros
            filtroRapido={filtroRapido}
            onFiltroRapido={alternarFiltroRapido}
            totalOutrosFiltros={totalOutrosFiltros}
            painelAberto={telaAtual === "filtros"}
            onAlternarPainel={() => alternarTela("filtros")}
          />
          {dadosSalvosDe && (
            <Aviso nivel="atencao">
              {carregando
                ? `Mostrando dados salvos às ${formatarMomento(dadosSalvosDe)} enquanto atualiza...`
                : `Sem conexão. Dados de ${formatarMomento(dadosSalvosDe)}: vagas e alertas podem ter mudado.`}
            </Aviso>
          )}
          {erro && (
            <Aviso nivel="critico" urgente>
              {erro}
            </Aviso>
          )}
          <SeloAvisoOficial avisos={avisosValidos} onVer={() => abrirTela("alertas")} />
          <RegiaoToasts origem="topo" className="max-w-full items-start sm:max-w-md" />
        </div>

        <BarraResumo
          totalVagasLivres={resumo.vagasLivres}
          totalAbrigos={abrigosFiltrados.length}
          carregando={carregando}
          filtrado={temFiltroAtivo}
          mostrarAlertas={camadaAlertasVisivel}
          lista={{ aberta: telaAtual === "lista", onAlternar: () => alternarTela("lista") }}
          gps={{ ativo: gpsAtivo, buscando: buscandoGps, onIrAoMaisProximo: () => void irAoMaisProximo() }}
          onEnquadrar={() => setEnquadrarTick((t) => t + 1)}
        />

        {/* Painel único: cada tela da pilha fica montada; só a de cima aparece (navegacaoDa). */}
        {pilhaVisivel.includes("filtros") && (
          <PainelFiltros
            filtroRapido={filtroRapido}
            onFiltroRapido={alternarFiltroRapido}
            categorias={categorias}
            categoriaSlug={categoriaSlug}
            onCategoria={(slug) => {
              if (categoriaSlug === slug) return limparFiltroCategoria();
              setCategoriaSlug(slug);
              setItemFiltroId(null);
              pedirAutoSelecao();
            }}
            itemFiltroId={itemFiltroId}
            onItem={(id) => {
              setItemFiltroId(id);
              setAutoSelecao("filtro");
            }}
            totalDestaque={resumo.prioritarios}
            ocultarNaoDestaque={ocultarNaoDestaque}
            onAlternarOcultar={() => setOcultarNaoDestaque((v) => !v)}
            alertas={{
              total: alertas.length,
              camadaVisivel: camadaAlertasVisivel,
              onAlternarCamada: () => setCamadaAlertasVisivel((v) => !v),
              onVerPainel: () => abrirTela("alertas"),
            }}
            gps={{
              ativo: gpsAtivo,
              buscando: buscandoGps,
              raioKm,
              onRaio: (raio) => {
                setRaioKm(raio);
                setAutoSelecao("filtro");
              },
              onAtivar: () => void irAoMaisProximo(),
              onParar: pararDeUsarLocalizacao,
            }}
            totalResultados={abrigosFiltrados.length}
            temFiltroAtivo={temFiltroAtivo}
            onLimparTudo={limparTodosFiltros}
            onVerResultados={() => trocarPilha([...pilhaVisivel.filter((t) => t !== "filtros" && t !== "lista"), "lista"])}
            navegacao={navegacaoDa("filtros")}
            onFechar={fecharPainel}
          />
        )}

        {pilhaVisivel.includes("alertas") && (
          <PainelAlertas
            alertas={alertas}
            avisos={avisosValidos}
            abrigos={abrigos}
            posicaoUsuario={posicaoUsuario}
            onVerNoMapa={verAlertaNoMapa}
            onVerAbrigo={selecionarAbrigo}
            navegacao={navegacaoDa("alertas")}
            onFechar={fecharPainel}
          />
        )}

        {pilhaVisivel.includes("familiares") && (
          <PainelBuscaFamiliar onVerAbrigo={selecionarAbrigo} navegacao={navegacaoDa("familiares")} onFechar={fecharPainel} />
        )}

        {pilhaVisivel.includes("lista") && (
          <ListaAbrigos
            abrigos={abrigosFiltrados}
            carregando={carregando}
            idSelecionado={idSelecionado}
            onSelecionar={selecionarAbrigo}
            onLimparFiltros={limparTodosFiltros}
            navegacao={navegacaoDa("lista")}
            onFechar={fecharPainel}
          />
        )}

        {abrigoSelecionado && pilhaVisivel.includes("abrigo") && (
          <FichaAbrigo
            key={abrigoSelecionado.id}
            abrigo={abrigoSelecionado}
            categoriaSlug={categoriaSlug}
            itemFiltroId={itemFiltroId}
            posicaoNaLista={{ indice: Math.max(0, indiceSelecionado), total: abrigosFiltrados.length }}
            posicaoUsuario={posicaoUsuario}
            versaoDados={versao}
            obterOrigemRota={obterOrigemRota}
            onNavegar={navegarAbrigoVizinho}
            navegacao={navegacaoDa("abrigo")}
            onFechar={fecharPainel}
          />
        )}
      </main>
    </div>
  );
}
