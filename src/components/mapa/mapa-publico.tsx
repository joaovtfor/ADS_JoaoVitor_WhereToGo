"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { BarraFiltros, PainelFiltros } from "@/components/mapa/barra-filtros";
import { BarraResumo } from "@/components/mapa/barra-resumo";
import { CabecalhoMapa } from "@/components/mapa/cabecalho-mapa";
import { FichaAbrigo } from "@/components/mapa/ficha-abrigo";
import { filtrarAbrigos } from "@/components/mapa/filtrar-abrigos";
import { ListaAbrigos, PainelAlertas, PainelBuscaFamiliar } from "@/components/mapa/paineis-laterais";
import { ATALHOS_FILTRO, type AlertaMapa, type FiltroRapido } from "@/components/mapa/tipos";
import { useDadosMapa, type DadosIniciaisMapa } from "@/components/mapa/use-dados-mapa";
import { useServiceWorker } from "@/components/mapa/use-service-worker";
import { BotaoIcone } from "@/components/ui/botao";
import { SeloStatus, type NivelStatus } from "@/components/ui/selo-status";

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
type Painel = "alertas" | "lista" | "familiares" | "filtros";
/** O que pediu para selecionar automaticamente o abrigo mais adequado. */
type MotivoAutoSelecao = "gps" | "filtro";

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

/** Aviso flutuante sobre o mapa: uma linha, com a cor só na bolinha de estado. */
function Aviso({
  nivel,
  urgente = false,
  onFechar,
  children,
}: {
  nivel: NivelStatus;
  urgente?: boolean;
  onFechar?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role={urgente ? "alert" : "status"}
      className="pointer-events-auto flex w-fit max-w-full items-center gap-1 rounded-controle border border-borda bg-superficie py-1 pr-1 pl-3"
    >
      <SeloStatus nivel={nivel} className="py-1.5">
        <span>{children}</span>
      </SeloStatus>
      {onFechar ? <BotaoIcone icone={X} rotulo="Fechar aviso" tamanho="sm" onClick={onFechar} /> : <span className="w-2" />}
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
export function MapaPublico({ inicial, abrigoInicial }: PropriedadesMapaPublico) {
  useServiceWorker();

  // Filtros (RF08)
  const [termoBusca, setTermoBusca] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("TODOS");
  const [categoriaSlug, setCategoriaSlug] = useState<string | null>(null);
  const [itemFiltroId, setItemFiltroId] = useState<number | null>(null);
  const [raioKm, setRaioKm] = useState<number | null>(null);
  const [ocultarNaoDestaque, setOcultarNaoDestaque] = useState(false);

  // Painéis e camadas (RF09 + Busca de Familiares)
  const [camadaAlertasVisivel, setCamadaAlertasVisivel] = useState(true);
  const [painelAberto, setPainelAberto] = useState<Painel | null>(null);
  const [enquadrarTick, setEnquadrarTick] = useState(0);

  // Localização do doador/cidadão (distância e raio calculados no servidor)
  const [posicaoUsuario, setPosicaoUsuario] = useState<Posicao | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  // Abrigo selecionado (ficha - RF07), com link compartilhável ?abrigo=ID
  const [idSelecionado, setIdSelecionado] = useState<number | null>(abrigoInicial);
  const [focoTick, setFocoTick] = useState(0);
  const [focoCoordenada, setFocoCoordenada] = useState<{ lat: number; lng: number; tick: number } | null>(null);
  const [autoSelecao, setAutoSelecao] = useState<MotivoAutoSelecao | null>(null);

  const { abrigos, alertas, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, recarregar } = useDadosMapa(
    posicaoUsuario,
    raioKm,
    inicial,
  );

  // A página pode ter vindo do cache offline (gerada para outro endereço): vale o que está na URL.
  useEffect(() => {
    void Promise.resolve().then(() => setIdSelecionado(lerAbrigoDaUrl()));
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

  const selecionarAbrigo = useCallback((id: number) => {
    setIdSelecionado(id);
    setFocoTick((t) => t + 1);
    atualizarAbrigoNaUrl(id);
  }, []);

  const fecharFicha = useCallback(() => {
    setIdSelecionado(null);
    atualizarAbrigoNaUrl(null);
  }, []);

  useEffect(() => {
    // Esc fecha primeiro o painel aberto e, depois, a ficha.
    const aoPressionar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (painelAberto) setPainelAberto(null);
      else fecharFicha();
    };
    window.addEventListener("keydown", aoPressionar);
    return () => window.removeEventListener("keydown", aoPressionar);
  }, [fecharFicha, painelAberto]);

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
        if (autoSelecao === "gps") setMensagem("Localização obtida, mas nenhum abrigo ativo foi encontrado nesta distância.");
        return;
      }

      const comFiltroDoacao = Boolean(categoriaSlug || itemFiltroId);
      const alvo = (comFiltroDoacao && abrigosFiltrados.find((a) => a.destaque)) || abrigosFiltrados[0];
      setAutoSelecao(null);
      selecionarAbrigo(alvo.id);
      const distancia = alvo.distanciaKm !== null ? ` (${alvo.distanciaKm.toFixed(1)} km)` : "";
      setMensagem(
        comFiltroDoacao && alvo.destaque
          ? `Mais próximo que precisa da sua doação: ${alvo.nome}${distancia}`
          : `Abrigo mais próximo: ${alvo.nome}${distancia}`,
      );
    });
  }, [autoSelecao, posicaoUsuario, posicaoDosDados, abrigos.length, abrigosFiltrados, categoriaSlug, itemFiltroId, selecionarAbrigo]);

  function ativarGeolocalizacao() {
    if (!("geolocation" in navigator)) {
      setMensagem("Seu navegador não permite usar a localização.");
      return;
    }
    setBuscandoGps(true);
    setMensagem(null);

    const aoObter = (pos: GeolocationPosition) => {
      setPosicaoUsuario({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setAutoSelecao("gps");
      setBuscandoGps(false);
    };
    // Tenta o GPS preciso; se falhar ou demorar, aceita a localização aproximada.
    navigator.geolocation.getCurrentPosition(
      aoObter,
      () =>
        navigator.geolocation.getCurrentPosition(
          aoObter,
          () => {
            setBuscandoGps(false);
            setMensagem("Não foi possível obter sua localização (permissão negada ou indisponível).");
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
        ),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    );
  }

  /** Filtros que buscam "o mais próximo": pedem a localização se ainda não houver. */
  function pedirAutoSelecao() {
    setAutoSelecao("filtro");
    if (!posicaoUsuario && !buscandoGps) ativarGeolocalizacao();
  }

  function limparFiltroCategoria() {
    setCategoriaSlug(null);
    setItemFiltroId(null);
    setOcultarNaoDestaque(false);
    setMensagem(null);
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

  function alternarPainel(painel: Painel) {
    setPainelAberto((atual) => (atual === painel ? null : painel));
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
        totalAbrigos={abrigosFiltrados.length}
        totalAlertas={alertas.length}
        termoBusca={termoBusca}
        onBuscar={setTermoBusca}
        onConfirmarBusca={() => abrigosFiltrados[0] && selecionarAbrigo(abrigosFiltrados[0].id)}
        listaAberta={painelAberto === "lista"}
        onAlternarLista={() => alternarPainel("lista")}
        onBuscarFamiliar={() => setPainelAberto("familiares")}
        onVerAlertas={() => setPainelAberto("alertas")}
        onAtualizar={recarregar}
      />
      <BarraFiltros
        filtroRapido={filtroRapido}
        onFiltroRapido={alternarFiltroRapido}
        totalOutrosFiltros={totalOutrosFiltros}
        painelAberto={painelAberto === "filtros"}
        onAlternarPainel={() => alternarPainel("filtros")}
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
          aoSelecionarAbrigo={selecionarAbrigo}
        />

        {/* Avisos: ao lado dos botões de zoom no desktop, sem invadir a ficha aberta */}
        <div
          className={`pointer-events-none absolute top-3 left-3 z-[400] flex flex-col gap-2 sm:left-14 ${
            abrigoSelecionado ? "right-3 sm:right-[424px]" : "right-3"
          }`}
        >
          {dadosSalvosDe && (
            <Aviso nivel="atencao">
              {carregando
                ? `Mostrando dados salvos às ${formatarMomento(dadosSalvosDe)} enquanto atualiza...`
                : `Sem conexão. Dados de ${formatarMomento(dadosSalvosDe)}: vagas e alertas podem ter mudado.`}
            </Aviso>
          )}
          {mensagem && (
            <Aviso nivel="neutro" onFechar={() => setMensagem(null)}>
              {mensagem}
            </Aviso>
          )}
          {erro && (
            <Aviso nivel="critico" urgente>
              {erro}
            </Aviso>
          )}
        </div>

        <BarraResumo
          totalVagasLivres={resumo.vagasLivres}
          totalAbrigos={abrigosFiltrados.length}
          carregando={carregando}
          filtrado={temFiltroAtivo}
          mostrarAlertas={camadaAlertasVisivel}
          gps={{
            ativo: gpsAtivo,
            buscando: buscandoGps,
            onAtivar: ativarGeolocalizacao,
            onLimpar: () => {
              setPosicaoUsuario(null);
              setRaioKm(null);
              setMensagem(null);
            },
          }}
          onEnquadrar={() => setEnquadrarTick((t) => t + 1)}
        />

        {painelAberto === "filtros" && (
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
              onVerPainel: () => setPainelAberto("alertas"),
            }}
            gps={{
              ativo: gpsAtivo,
              buscando: buscandoGps,
              raioKm,
              onRaio: (raio) => {
                setRaioKm(raio);
                setAutoSelecao("filtro");
              },
              onAtivar: ativarGeolocalizacao,
            }}
            totalResultados={abrigosFiltrados.length}
            temFiltroAtivo={temFiltroAtivo}
            onLimparTudo={limparTodosFiltros}
            onFechar={() => setPainelAberto(null)}
          />
        )}

        {painelAberto === "alertas" && (
          <PainelAlertas
            alertas={alertas}
            abrigos={abrigos}
            posicaoUsuario={posicaoUsuario}
            onVerNoMapa={verAlertaNoMapa}
            onVerAbrigo={selecionarAbrigo}
            onFechar={() => setPainelAberto(null)}
          />
        )}

        {painelAberto === "familiares" && (
          <PainelBuscaFamiliar
            onVerAbrigo={(id) => {
              selecionarAbrigo(id);
              if (window.innerWidth < 640) setPainelAberto(null);
            }}
            onFechar={() => setPainelAberto(null)}
          />
        )}

        {painelAberto === "lista" && (
          <ListaAbrigos
            abrigos={abrigosFiltrados}
            carregando={carregando}
            idSelecionado={idSelecionado}
            onSelecionar={(id) => {
              selecionarAbrigo(id);
              if (window.innerWidth < 640) setPainelAberto(null);
            }}
            onLimparFiltros={limparTodosFiltros}
            onFechar={() => setPainelAberto(null)}
          />
        )}

        {abrigoSelecionado && (
          <FichaAbrigo
            key={abrigoSelecionado.id}
            abrigo={abrigoSelecionado}
            categoriaSlug={categoriaSlug}
            itemFiltroId={itemFiltroId}
            posicaoNaLista={{ indice: Math.max(0, indiceSelecionado), total: abrigosFiltrados.length }}
            onNavegar={navegarAbrigoVizinho}
            onFechar={fecharFicha}
          />
        )}
      </main>
    </div>
  );
}
