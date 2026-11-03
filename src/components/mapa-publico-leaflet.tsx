"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { AbrigoMapa, AlertaMapa } from "./mapa/tipos";

interface PropriedadesMapaLeaflet {
  abrigos: AbrigoMapa[];
  alertas?: AlertaMapa[];
  mostrarAlertas?: boolean;
  idSelecionado: number | null;
  focoTick?: number;
  focoCoordenada?: { lat: number; lng: number; tick: number } | null;
  posicaoUsuario: { lat: number; lng: number } | null;
  aoSelecionarAbrigo: (id: number) => void;
}

// Coordenadas centrais padrão (Passo Fundo - RS)
const CENTRO_PADRAO: [number, number] = [-28.258, -52.406];
const ZOOM_PADRAO = 13;

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function criarIconeAbrigo(abrigo: AbrigoMapa, selecionado: boolean): L.DivIcon {
  const { nivel, vagasDisponiveis } = abrigo.ocupacao;

  const paleta =
    nivel === "VERDE"
      ? {
          fundo: "#059669",
          borda: "#6ee7b7",
          simbolo: "●",
          rotuloVagas: `${vagasDisponiveis} vagas`,
        }
      : nivel === "AMARELO"
        ? {
            fundo: "#d97706",
            borda: "#fcd34d",
            simbolo: "▲",
            rotuloVagas: `${vagasDisponiveis} vagas`,
          }
        : {
            fundo: "#e11d48",
            borda: "#fda4af",
            simbolo: "■",
            rotuloVagas: vagasDisponiveis > 0 ? `${vagasDisponiveis} vagas` : "LOTADO",
          };

  // Selo das ocorrências ativas do abrigo (inclusive as sem local próprio, que
  // não ganham marcador separado no mapa).
  const resumoOcorrencias = abrigo.ocorrenciasAtivas.map((o) => o.tipo.replaceAll("_", " ").toLowerCase()).join(", ");
  const alertaInfra =
    abrigo.statusInfraestrutura === "CRITICO"
      ? `<span style="position:absolute;top:-6px;right:-6px;background:#e11d48;color:#fff;border:2px solid #020617;border-radius:9999px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;" title="Alerta crítico: ${escaparHtml(resumoOcorrencias)}">!</span>`
      : abrigo.statusInfraestrutura === "ALERTA"
        ? `<span style="position:absolute;top:-6px;right:-6px;background:#f59e0b;color:#020617;border:2px solid #020617;border-radius:9999px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;" title="Atenção: ${escaparHtml(resumoOcorrencias)}">⚡</span>`
        : "";

  const seloAreaRisco = abrigo.emAreaDeRisco
    ? `<span style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#9f1239;color:#fff;border:1.5px solid #fda4af;border-radius:9999px;padding:0 6px;font-size:9px;font-weight:900;white-space:nowrap;" title="Este abrigo está dentro de uma área de risco demarcada">🔺 ÁREA DE RISCO</span>`
    : "";

  // RF08: Destaca abrigos que precisam URGENTE do item filtrado e atenua a opacidade dos demais
  const atenuadoPorFiltro = abrigo.destaque === false && !selecionado;
  const estiloOpacidade = atenuadoPorFiltro ? "opacity:0.36;filter:saturate(0.35);transform:scale(0.88);" : "";

  const badgeDoarAqui =
    abrigo.destaque === true
      ? `<span style="position:absolute;top:-17px;left:50%;transform:translateX(-50%);background:#0284c7;color:#ffffff;border:1.5px solid #bae6fd;border-radius:9999px;padding:1px 6px;font-size:9px;font-weight:900;letter-spacing:0.02em;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.55);">⭐ PRECISA</span>`
      : "";

  const destaqueAnel = selecionado
    ? "box-shadow: 0 0 0 4px #f59e0b, 0 10px 20px rgba(0,0,0,0.65); transform: scale(1.12);"
    : abrigo.destaque === true
      ? "box-shadow: 0 0 0 4px #38bdf8, 0 8px 18px rgba(0,0,0,0.6); transform: scale(1.07);"
      : "box-shadow: 0 4px 12px rgba(0,0,0,0.55);";

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;transition:all 0.2s ease;${estiloOpacidade}">
      <div style="position:relative;display:flex;align-items:center;gap:5px;background:${paleta.fundo};color:#ffffff;border:2px solid ${selecionado ? "#ffffff" : abrigo.destaque ? "#bae6fd" : paleta.borda};border-radius:9999px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap;transition:transform 0.15s ease;${destaqueAnel}">
        ${badgeDoarAqui}
        <span style="font-size:10px;line-height:1;">${paleta.simbolo}</span>
        <span style="font-variant-numeric:tabular-nums;">${escaparHtml(paleta.rotuloVagas)}</span>
        ${alertaInfra}
        ${seloAreaRisco}
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${paleta.fundo};margin-top:-1px;" />
    </div>
  `;

  return L.divIcon({
    className: "wtg-pin-icon",
    html,
    iconSize: [96, 36],
    iconAnchor: [48, 34],
  });
}

function obterEmojiAlerta(tipo: string): string {
  switch (tipo) {
    case "AREA_RISCO":
      return "🔺";
    case "ALAGAMENTO":
      return "🌊";
    case "DESLIZAMENTO":
      return "⛰️";
    case "RISCO_ESTRUTURAL":
      return "🏚️";
    case "SEM_ENERGIA":
      return "⚡";
    case "SEM_AGUA":
      return "🚰";
    case "SEM_COMUNICACAO":
      return "📡";
    case "VIA_BLOQUEADA":
    default:
      return "🚧";
  }
}

function criarIconeAlerta(alerta: AlertaMapa): L.DivIcon {
  const cor = alerta.gravidade === "CRITICO" ? "#be123c" : "#b45309";
  const emoji = obterEmojiAlerta(alerta.tipo);
  const html = `
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${cor};color:#fff;border:2px solid #fde047;box-shadow:0 4px 10px rgba(0,0,0,0.5);font-size:14px;" title="${escaparHtml(alerta.descricaoTipo)}">
      ${emoji}
    </div>
  `;
  return L.divIcon({
    className: "wtg-pin-icon",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function criarIconeCentroAreaRisco(alerta: AlertaMapa): L.DivIcon {
  const fundo = alerta.gravidade === "CRITICO" ? "rgba(159, 18, 57, 0.94)" : "rgba(180, 83, 9, 0.94)";
  const borda = alerta.gravidade === "CRITICO" ? "#fda4af" : "#fde047";
  const html = `
    <div style="display:flex;align-items:center;gap:4px;background:${fundo};color:#ffffff;border:2px solid ${borda};border-radius:9999px;padding:3px 9px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.65);cursor:pointer;">
      <span>🔺</span>
      <span>Área de Risco</span>
    </div>
  `;
  return L.divIcon({
    className: "wtg-pin-icon",
    html,
    iconSize: [108, 24],
    iconAnchor: [54, 12],
  });
}

export default function MapaPublicoLeaflet({
  abrigos,
  alertas = [],
  mostrarAlertas = true,
  idSelecionado,
  focoTick = 0,
  focoCoordenada = null,
  posicaoUsuario,
  aoSelecionarAbrigo,
}: PropriedadesMapaLeaflet) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaAbrigosRef = useRef<L.GeoJSON | null>(null);
  const camadaAlertasRef = useRef<L.LayerGroup | null>(null);
  const camadaUsuarioRef = useRef<L.LayerGroup | null>(null);
  const jaAjustouBoundsIniciaisRef = useRef(false);
  const ultimoFocoRef = useRef<{ id: number | null; tick: number }>({ id: null, tick: -1 });
  const ultimoFocoCoordTickRef = useRef<number>(-1);

  // 1. Inicializa a instância do mapa Leaflet uma única vez
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapaRef.current) return;

    const mapa = L.map(container, {
      center: CENTRO_PADRAO,
      zoom: ZOOM_PADRAO,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomleft" }).addTo(mapa);

    // Camada de tiles Humanitarian OpenStreetMap Team (HOT - voltada a resposta a desastres e emergências)
    L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
      // Requisição CORS (o servidor HOT envia Access-Control-Allow-Origin: *):
      // permite que o service worker guarde os tiles vistos para uso offline.
      crossOrigin: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> • Estilo <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">Humanitarian (HOT)</a>',
    }).addTo(mapa);

    camadaAlertasRef.current = L.layerGroup().addTo(mapa);
    camadaUsuarioRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;

    return () => {
      mapa.remove();
      mapaRef.current = null;
      camadaAbrigosRef.current = null;
      camadaAlertasRef.current = null;
      camadaUsuarioRef.current = null;
    };
  }, []);

  // 2. Plota os abrigos ativos via GeoJSON (RF06 / RF08)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (camadaAbrigosRef.current) {
      camadaAbrigosRef.current.remove();
      camadaAbrigosRef.current = null;
    }

    const featureCollection = {
      type: "FeatureCollection" as const,
      features: abrigos.map((abrigo) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [abrigo.longitude, abrigo.latitude] as [number, number],
        },
        properties: abrigo,
      })),
    };

    const camadaGeoJson = L.geoJSON(featureCollection, {
      pointToLayer: (feature, latlng) => {
        const abrigo = feature.properties as AbrigoMapa;
        const selecionado = abrigo.id === idSelecionado;
        const marcador = L.marker(latlng, {
          icon: criarIconeAbrigo(abrigo, selecionado),
          zIndexOffset: selecionado ? 1000 : abrigo.destaque ? 600 : 0,
          title: `${abrigo.nome} (${abrigo.ocupacao.vagasDisponiveis} vagas livres)`,
        });
        marcador.on("click", () => {
          aoSelecionarAbrigo(abrigo.id);
        });
        return marcador;
      },
    }).addTo(mapa);

    camadaAbrigosRef.current = camadaGeoJson;

    // Ajusta o enquadramento inicial quando os abrigos chegam pela primeira vez
    if (!jaAjustouBoundsIniciaisRef.current && abrigos.length > 0) {
      const bounds = camadaGeoJson.getBounds();
      if (bounds.isValid()) {
        mapa.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
        jaAjustouBoundsIniciaisRef.current = true;
      }
    }
  }, [abrigos, idSelecionado, aoSelecionarAbrigo]);

  // 3. Plota alertas de infraestrutura/vias e polígonos de Área de Risco no mapa quando habilitado (RF09)
  useEffect(() => {
    const grupoAlertas = camadaAlertasRef.current;
    if (!grupoAlertas) return;

    grupoAlertas.clearLayers();
    if (!mostrarAlertas) return;

    for (const alerta of alertas) {
      const emoji = obterEmojiAlerta(alerta.tipo);
      const corBadge = alerta.gravidade === "CRITICO" ? "#e11d48" : "#d97706";
      const tooltipHtml = `<div style="font-size:12px;max-width:240px;"><div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;"><span style="background:${corBadge};color:#fff;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;">${escaparHtml(alerta.gravidade)}</span><strong>${emoji} ${escaparHtml(alerta.descricaoTipo)}</strong></div><div>${escaparHtml(
        alerta.descricao ?? "Ocorrência ativa reportada na região.",
      )}</div><div style="font-size:10px;opacity:0.8;margin-top:3px;">📍 Referência: ${escaparHtml(alerta.abrigo.nome)} (clique para ver abrigo)</div></div>`;

      // Caso 1: Alerta com polígono demarcado por marcadores (Área de Risco)
      if (Array.isArray(alerta.poligono) && alerta.poligono.length >= 3) {
        const coordenadas: [number, number][] = alerta.poligono.map((p) => [p.lat, p.lng]);
        const corBorda = alerta.gravidade === "CRITICO" ? "#f43f5e" : "#f59e0b";
        const corPreenchimento = alerta.gravidade === "CRITICO" ? "#e11d48" : "#d97706";

        const poligonoLayer = L.polygon(coordenadas, {
          color: corBorda,
          weight: 2.5,
          dashArray: "6, 4",
          fillColor: corPreenchimento,
          fillOpacity: 0.26,
        });

        poligonoLayer.bindTooltip(tooltipHtml, { sticky: true });
        poligonoLayer.on("click", () => {
          aoSelecionarAbrigo(alerta.abrigo.id);
        });
        poligonoLayer.addTo(grupoAlertas);

        // Marcadores nos vértices que delimitam o perímetro da área de risco
        for (const vertice of alerta.poligono) {
          L.circleMarker([vertice.lat, vertice.lng], {
            radius: 4.5,
            color: "#ffffff",
            weight: 1.5,
            fillColor: corBorda,
            fillOpacity: 1,
          })
            .bindTooltip(tooltipHtml, { direction: "top", offset: [0, -6] })
            .addTo(grupoAlertas);
        }

        // Rótulo da Área de Risco: ponto calculado pelo PostGIS (ST_PointOnSurface),
        // sempre dentro do polígono, mesmo quando ele é côncavo.
        const marcadorCentro = L.marker([alerta.latitude, alerta.longitude], {
          icon: criarIconeCentroAreaRisco(alerta),
          zIndexOffset: 350,
        });
        marcadorCentro.bindTooltip(tooltipHtml, { direction: "top", offset: [0, -10] });
        marcadorCentro.on("click", () => {
          aoSelecionarAbrigo(alerta.abrigo.id);
        });
        marcadorCentro.addTo(grupoAlertas);
        continue;
      }

      // Caso 2: Alerta pontual com local próprio (ex.: ponto da via bloqueada).
      // Sem local próprio, o alerta já aparece como selo no pino do abrigo:
      // desenhá-lo deslocado ~130 m indicaria um lugar que ninguém informou.
      if (!alerta.localizacaoPropria) continue;

      const marcadorAlerta = L.marker([alerta.latitude, alerta.longitude], {
        icon: criarIconeAlerta(alerta),
        zIndexOffset: 300,
      });

      marcadorAlerta.bindTooltip(tooltipHtml, { direction: "top", offset: [0, -10] });

      marcadorAlerta.on("click", () => {
        aoSelecionarAbrigo(alerta.abrigo.id);
      });

      marcadorAlerta.addTo(grupoAlertas);
    }
  }, [alertas, mostrarAlertas, aoSelecionarAbrigo]);

  // 4. Plota o marcador de localização GPS do cidadão/doador
  useEffect(() => {
    const grupoUsuario = camadaUsuarioRef.current;
    const mapa = mapaRef.current;
    if (!grupoUsuario || !mapa) return;

    grupoUsuario.clearLayers();
    if (!posicaoUsuario) return;

    const iconeUsuario = L.divIcon({
      className: "wtg-pin-icon",
      html: `
        <div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:rgba(56,189,248,0.28);border:2px solid #38bdf8;">
          <div style="width:10px;height:10px;border-radius:9999px;background:#0284c7;border:2px solid #ffffff;" />
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    L.marker([posicaoUsuario.lat, posicaoUsuario.lng], {
      icon: iconeUsuario,
      zIndexOffset: 900,
      title: "Sua localização atual",
    })
      .bindTooltip("📍 Você está aqui", { direction: "top", offset: [0, -8] })
      .addTo(grupoUsuario);
  }, [posicaoUsuario]);

  // 5. Centraliza suavemente quando o usuário seleciona um abrigo (compensando a largura da aba lateral)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !idSelecionado) {
      ultimoFocoRef.current = { id: null, tick: focoTick };
      return;
    }

    const alvo = abrigos.find((a) => a.id === idSelecionado);
    if (!alvo) return;

    // Evita recentralizar durante o polling automático se o abrigo e o focoTick não mudaram
    if (
      ultimoFocoRef.current.id === idSelecionado &&
      ultimoFocoRef.current.tick === focoTick
    ) {
      return;
    }

    ultimoFocoRef.current = { id: idSelecionado, tick: focoTick };

    mapa.stop();
    const zoomDestino = Math.max(mapa.getZoom(), 15);
    const pontoAlvo = mapa.project([alvo.latitude, alvo.longitude], zoomDestino);
    const deslocamentoX = typeof window !== "undefined" && window.innerWidth >= 640 ? 185 : 0;
    const centroCompensado = mapa.unproject(
      L.point(pontoAlvo.x + deslocamentoX, pontoAlvo.y),
      zoomDestino,
    );

    mapa.flyTo(centroCompensado, zoomDestino, {
      animate: true,
      duration: 0.5,
    });
  }, [idSelecionado, focoTick, abrigos]);

  // 6. Centraliza diretamente em uma coordenada de alerta/bloqueio quando acionado no painel de alertas (RF09)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !focoCoordenada || focoCoordenada.tick === ultimoFocoCoordTickRef.current) return;

    ultimoFocoCoordTickRef.current = focoCoordenada.tick;
    mapa.stop();
    mapa.flyTo([focoCoordenada.lat, focoCoordenada.lng], Math.max(mapa.getZoom(), 15), {
      animate: true,
      duration: 0.5,
    });
  }, [focoCoordenada]);

  function enquadrarTodos() {
    const mapa = mapaRef.current;
    const camada = camadaAbrigosRef.current;
    if (!mapa || !camada) return;
    const bounds = camada.getBounds();
    if (bounds.isValid()) {
      mapa.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
    }
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        aria-label="Mapa interativo de abrigos emergenciais"
        className="h-full w-full z-0"
      />

      {/* Barra Inferior Esquerda: Enquadramento + Legenda Semafórica Acessível (RF06 RN3 + DESIGN.md) */}
      <div
        aria-label="Legenda de ocupação dos abrigos"
        className="pointer-events-auto absolute right-3 bottom-3 left-14 z-[400] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-800 bg-slate-950/90 px-2 py-1.5 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur sm:right-auto sm:px-3 sm:py-2"
      >
        <button
          type="button"
          onClick={enquadrarTodos}
          className="min-h-12 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-amber-300 hover:bg-slate-800 cursor-pointer sm:min-h-8"
        >
          🗺️ Ver todos
        </button>
        {/* No celular, só símbolo + rótulo curto; as faixas de lotação aparecem a partir do tablet. */}
        <span className="text-emerald-300">
          ● Livre<span className="hidden sm:inline"> (&lt;70%)</span>
        </span>
        <span className="text-amber-300">
          ▲ Atenção<span className="hidden sm:inline"> (70–90%)</span>
        </span>
        <span className="text-rose-300">
          ■ Lotado<span className="hidden sm:inline"> (&gt;90%)</span>
        </span>
        {mostrarAlertas && <span className="text-rose-300">🔺 Risco</span>}
      </div>
    </div>
  );
}
