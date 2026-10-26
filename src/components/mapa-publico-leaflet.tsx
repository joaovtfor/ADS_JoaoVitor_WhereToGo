"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export type NivelOcupacaoPublico = "VERDE" | "AMARELO" | "VERMELHO";
export type StatusInfraPublico = "NORMAL" | "ALERTA" | "CRITICO";

export interface ItemNecessidadePublico {
  id: number;
  nome: string;
  categoria: string;
}

export interface AbrigoMapa {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  latitude: number;
  longitude: number;
  ocupacao: {
    capacidadeMaxima: number;
    lotacaoAtual: number;
    vagasDisponiveis: number;
    percentual: number;
    nivel: NivelOcupacaoPublico;
  };
  statusInfraestrutura: StatusInfraPublico;
  ocorrenciasAtivas: Array<{ tipo: string; gravidade: "ALERTA" | "CRITICO" }>;
  necessidades: {
    urgentes: ItemNecessidadePublico[];
    bloqueados: ItemNecessidadePublico[];
  };
  destaque: boolean | null;
  distanciaKm: number | null;
  atualizadoEm: string;
}

export interface AlertaMapa {
  id: number;
  tipo: string;
  descricaoTipo: string;
  gravidade: "ALERTA" | "CRITICO";
  descricao: string | null;
  latitude: number;
  longitude: number;
  localizacaoPropria: boolean;
  dataRegistro: string;
  abrigo: { id: number; nome: string };
}

interface PropriedadesMapaLeaflet {
  abrigos: AbrigoMapa[];
  alertas?: AlertaMapa[];
  mostrarAlertas?: boolean;
  idSelecionado: number | null;
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

  const alertaInfra =
    abrigo.statusInfraestrutura === "CRITICO"
      ? `<span style="position:absolute;top:-6px;right:-6px;background:#e11d48;color:#fff;border:2px solid #020617;border-radius:9999px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;" title="Alerta crítico de infraestrutura">!</span>`
      : abrigo.statusInfraestrutura === "ALERTA"
        ? `<span style="position:absolute;top:-6px;right:-6px;background:#f59e0b;color:#020617;border:2px solid #020617;border-radius:9999px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;" title="Atenção na infraestrutura">⚡</span>`
        : "";

  const destaqueAnel = selecionado
    ? "box-shadow: 0 0 0 4px #f59e0b, 0 10px 20px rgba(0,0,0,0.65); transform: scale(1.12);"
    : abrigo.destaque
      ? "box-shadow: 0 0 0 3px #38bdf8, 0 6px 14px rgba(0,0,0,0.5);"
      : "box-shadow: 0 4px 12px rgba(0,0,0,0.55);";

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;">
      <div style="position:relative;display:flex;align-items:center;gap:5px;background:${paleta.fundo};color:#ffffff;border:2px solid ${selecionado ? "#ffffff" : paleta.borda};border-radius:9999px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap;transition:transform 0.15s ease;${destaqueAnel}">
        <span style="font-size:10px;line-height:1;">${paleta.simbolo}</span>
        <span style="font-variant-numeric:tabular-nums;">${escaparHtml(paleta.rotuloVagas)}</span>
        ${alertaInfra}
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

function criarIconeAlerta(alerta: AlertaMapa): L.DivIcon {
  const cor = alerta.gravidade === "CRITICO" ? "#be123c" : "#b45309";
  const html = `
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${cor};color:#fff;border:2px solid #fde047;box-shadow:0 4px 10px rgba(0,0,0,0.5);font-size:14px;" title="${escaparHtml(alerta.descricaoTipo)}">
      🚧
    </div>
  `;
  return L.divIcon({
    className: "wtg-pin-icon",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function MapaPublicoLeaflet({
  abrigos,
  alertas = [],
  mostrarAlertas = true,
  idSelecionado,
  posicaoUsuario,
  aoSelecionarAbrigo,
}: PropriedadesMapaLeaflet) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaAbrigosRef = useRef<L.GeoJSON | null>(null);
  const camadaAlertasRef = useRef<L.LayerGroup | null>(null);
  const camadaUsuarioRef = useRef<L.LayerGroup | null>(null);
  const jaAjustouBoundsIniciaisRef = useRef(false);

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

    // Camada de tiles OpenStreetMap (leve e compatível com redes 3G - RNF01)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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

  // 2. Plota os abrigos ativos via GeoJSON (RF06)
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
          zIndexOffset: selecionado ? 1000 : abrigo.destaque ? 500 : 0,
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

  // 3. Plota alertas de infraestrutura/vias no mapa quando habilitado (RF09)
  useEffect(() => {
    const grupoAlertas = camadaAlertasRef.current;
    if (!grupoAlertas) return;

    grupoAlertas.clearLayers();
    if (!mostrarAlertas) return;

    for (const alerta of alertas) {
      // Exibe no mapa ocorrências com coordenada própria ou críticas
      if (!alerta.localizacaoPropria && alerta.gravidade !== "CRITICO") continue;
      // Desloca levemente quando compartilha a mesma coordenada do abrigo para não sobrepor o pino principal
      const lat = alerta.localizacaoPropria ? alerta.latitude : alerta.latitude + 0.0012;
      const lng = alerta.localizacaoPropria ? alerta.longitude : alerta.longitude + 0.0012;

      const marcadorAlerta = L.marker([lat, lng], {
        icon: criarIconeAlerta(alerta),
        zIndexOffset: 300,
      });

      marcadorAlerta.bindTooltip(
        `<div style="font-size:12px;"><strong>${escaparHtml(alerta.descricaoTipo)}</strong><br/>${escaparHtml(
          alerta.descricao ?? alerta.abrigo.nome,
        )}</div>`,
        { direction: "top", offset: [0, -10] },
      );

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
    if (!mapa || !idSelecionado) return;

    const alvo = abrigos.find((a) => a.id === idSelecionado);
    if (!alvo) return;

    const zoomDestino = Math.max(mapa.getZoom(), 15);
    const pontoAlvo = mapa.project([alvo.latitude, alvo.longitude], zoomDestino);
    const deslocamentoX = typeof window !== "undefined" && window.innerWidth >= 640 ? 185 : 0;
    const centroCompensado = mapa.unproject(
      L.point(pontoAlvo.x + deslocamentoX, pontoAlvo.y),
      zoomDestino,
    );

    mapa.flyTo(centroCompensado, zoomDestino, {
      duration: 0.45,
    });
  }, [idSelecionado, abrigos]);

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
        className="pointer-events-auto absolute bottom-3 left-14 z-[400] flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-[11px] font-semibold text-slate-200 shadow-lg backdrop-blur"
      >
        <button
          type="button"
          onClick={enquadrarTodos}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-slate-800 cursor-pointer"
        >
          🗺️ Centralizar Mapa
        </button>
        <span className="hidden sm:inline-block h-3.5 w-px bg-slate-800" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span>● Livre (&lt;70%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>▲ Atenção (70–90%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
          <span>■ Crítico/Lotado (&gt;90%)</span>
        </span>
      </div>
    </div>
  );
}
