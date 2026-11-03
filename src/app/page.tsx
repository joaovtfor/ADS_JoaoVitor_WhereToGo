"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarraFiltros } from "@/components/mapa/barra-filtros";
import { CabecalhoMapa } from "@/components/mapa/cabecalho-mapa";
import { FichaAbrigo } from "@/components/mapa/ficha-abrigo";
import { filtrarAbrigos } from "@/components/mapa/filtrar-abrigos";
import { ListaAbrigos, PainelAlertas } from "@/components/mapa/paineis-laterais";
import type { AlertaMapa, FiltroRapido } from "@/components/mapa/tipos";
import { useDadosMapa } from "@/components/mapa/use-dados-mapa";
import { useServiceWorker } from "@/components/mapa/use-service-worker";

const MapaPublicoLeaflet = dynamic(() => import("@/components/mapa-publico-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-slate-400">
      <div className="h-9 w-9 animate-spin rounded-full border-3 border-amber-400 border-t-transparent" />
      <p className="text-sm font-semibold text-slate-300">Carregando o mapa...</p>
    </div>
  ),
});

type Posicao = { lat: number; lng: number };
/** O que pediu para selecionar automaticamente o abrigo mais adequado. */
type MotivoAutoSelecao = "gps" | "filtro";

function lerAbrigoDaUrl(): number | null {
  if (typeof window === "undefined") return null;
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

export default function PaginaMapaPublico() {
  useServiceWorker();

  // Filtros (RF08)
  const [termoBusca, setTermoBusca] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("TODOS");
  const [categoriaSlug, setCategoriaSlug] = useState<string | null>(null);
  const [itemFiltroId, setItemFiltroId] = useState<number | null>(null);
  const [raioKm, setRaioKm] = useState<number | null>(null);
  const [ocultarNaoDestaque, setOcultarNaoDestaque] = useState(false);

  // Painéis e camadas (RF09)
  const [camadaAlertasVisivel, setCamadaAlertasVisivel] = useState(true);
  const [painelAberto, setPainelAberto] = useState<"alertas" | "lista" | null>(null);

  // Localização do doador/cidadão (distância e raio via PostGIS)
  const [posicaoUsuario, setPosicaoUsuario] = useState<Posicao | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  // Abrigo selecionado (ficha - RF07), com link compartilhável ?abrigo=ID
  const [idSelecionado, setIdSelecionado] = useState<number | null>(lerAbrigoDaUrl);
  const [focoTick, setFocoTick] = useState(0);
  const [focoCoordenada, setFocoCoordenada] = useState<{ lat: number; lng: number; tick: number } | null>(null);
  const [autoSelecao, setAutoSelecao] = useState<MotivoAutoSelecao | null>(null);

  const { abrigos, alertas, categorias, carregando, erro, dadosSalvosDe, posicaoDosDados, recarregar } = useDadosMapa(
    posicaoUsuario,
    raioKm,
  );

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
    const aoPressionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharFicha();
    };
    window.addEventListener("keydown", aoPressionar);
    return () => window.removeEventListener("keydown", aoPressionar);
  }, [fecharFicha]);

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
          ? `📍 Mais próximo que precisa da sua doação: ${alvo.nome}${distancia}`
          : `📍 Abrigo mais próximo: ${alvo.nome}${distancia}`,
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

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <CabecalhoMapa
        totalVagasLivres={resumo.vagasLivres}
        totalAbrigos={abrigosFiltrados.length}
        termoBusca={termoBusca}
        onBuscar={setTermoBusca}
        onConfirmarBusca={() => abrigosFiltrados[0] && selecionarAbrigo(abrigosFiltrados[0].id)}
        listaAberta={painelAberto === "lista"}
        onAlternarLista={() => setPainelAberto((p) => (p === "lista" ? null : "lista"))}
        gps={{
          ativo: posicaoUsuario !== null,
          buscando: buscandoGps,
          onAtivar: ativarGeolocalizacao,
          onLimpar: () => {
            setPosicaoUsuario(null);
            setRaioKm(null);
            setMensagem(null);
          },
        }}
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
          posicaoUsuario={posicaoUsuario}
          aoSelecionarAbrigo={selecionarAbrigo}
        />

        <div
          className={`pointer-events-none absolute top-3 left-3 z-[400] flex flex-col gap-2 transition-all ${
            abrigoSelecionado ? "right-3 sm:right-[416px] md:right-[436px]" : "right-3"
          }`}
        >
          <BarraFiltros
            filtroRapido={filtroRapido}
            onFiltroRapido={(filtro) => {
              if (filtro === "TODOS") return limparTodosFiltros();
              setFiltroRapido(filtro);
              pedirAutoSelecao();
            }}
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
            onLimparCategoria={limparFiltroCategoria}
            alertas={{
              total: alertas.length,
              camadaVisivel: camadaAlertasVisivel,
              painelAberto: painelAberto === "alertas",
              onAlternarCamada: () => setCamadaAlertasVisivel((v) => !v),
              onAlternarPainel: () => setPainelAberto((p) => (p === "alertas" ? null : "alertas")),
            }}
            gps={{
              ativo: posicaoUsuario !== null,
              raioKm,
              onRaio: (raio) => {
                setRaioKm(raio);
                setAutoSelecao("filtro");
              },
            }}
            temFiltroAtivo={temFiltroAtivo}
            onLimparTudo={limparTodosFiltros}
          />

          {dadosSalvosDe && (
            <p role="status" className="pointer-events-auto w-fit rounded-xl border border-amber-500/50 bg-slate-950/95 px-3 py-2 text-sm font-semibold text-amber-200 shadow-lg">
              {carregando
                ? `Mostrando dados salvos às ${formatarMomento(dadosSalvosDe)} enquanto atualiza...`
                : `📴 Sem conexão. Mostrando dados de ${formatarMomento(dadosSalvosDe)}: vagas e alertas podem ter mudado.`}
            </p>
          )}

          {mensagem && (
            <div role="status" className="pointer-events-auto flex w-fit items-center gap-2 rounded-xl border border-sky-500/40 bg-slate-950/90 py-1 pr-1 pl-3 text-sm text-sky-200 shadow-lg backdrop-blur">
              <span>{mensagem}</span>
              <button
                type="button"
                onClick={() => setMensagem(null)}
                aria-label="Fechar aviso"
                className="flex h-12 w-12 items-center justify-center rounded-lg font-bold text-sky-300 hover:bg-slate-800 sm:h-8 sm:w-8"
              >
                ✕
              </button>
            </div>
          )}

          {erro && (
            <p role="alert" className="pointer-events-auto w-fit rounded-xl border border-rose-500/40 bg-slate-950/90 px-3 py-2 text-sm text-rose-200 shadow-lg backdrop-blur">
              {erro}
            </p>
          )}
        </div>

        {painelAberto === "alertas" && (
          <PainelAlertas
            alertas={alertas}
            onVerNoMapa={verAlertaNoMapa}
            onVerAbrigo={selecionarAbrigo}
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
