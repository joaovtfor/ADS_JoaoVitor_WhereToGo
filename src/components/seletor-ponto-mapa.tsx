"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

interface PropriedadesSeletorPontoMapa {
  latitude: number | null;
  longitude: number | null;
  referenciaAbrigo?: { lat: number; lng: number; nome?: string } | null;
  aoSelecionarCoordenada: (lat: number, lng: number) => void;
  alturaClasse?: string;
}

// Centro padrão: Passo Fundo - RS
const CENTRO_PADRAO: [number, number] = [-28.258, -52.406];

export default function SeletorPontoMapa({
  latitude,
  longitude,
  referenciaAbrigo = null,
  aoSelecionarCoordenada,
  alturaClasse = "h-56",
}: PropriedadesSeletorPontoMapa) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorSelecionadoRef = useRef<L.Marker | null>(null);
  const marcadorReferenciaRef = useRef<L.Marker | null>(null);
  const callbackRef = useRef(aoSelecionarCoordenada);

  useEffect(() => {
    callbackRef.current = aoSelecionarCoordenada;
  }, [aoSelecionarCoordenada]);

  // 1. Inicializa o mini-mapa interativo
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapaRef.current) return;

    const centroInicial: [number, number] =
      latitude !== null && longitude !== null && !Number.isNaN(latitude) && !Number.isNaN(longitude)
        ? [latitude, longitude]
        : referenciaAbrigo
          ? [referenciaAbrigo.lat, referenciaAbrigo.lng]
          : CENTRO_PADRAO;

    const mapa = L.map(container, {
      center: centroInicial,
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> • <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">HOT</a>',
    }).addTo(mapa);

    // Clique em qualquer ponto do mapa define a coordenada
    mapa.on("click", (evento: L.LeafletMouseEvent) => {
      const lat = Number(evento.latlng.lat.toFixed(6));
      const lng = Number(evento.latlng.lng.toFixed(6));
      callbackRef.current(lat, lng);
    });

    mapaRef.current = mapa;

    return () => {
      mapa.remove();
      mapaRef.current = null;
      marcadorSelecionadoRef.current = null;
      marcadorReferenciaRef.current = null;
    };
    // Inicialização única do container Leaflet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Plota pino de referência do abrigo (quando usado em ocorrências)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (marcadorReferenciaRef.current) {
      marcadorReferenciaRef.current.remove();
      marcadorReferenciaRef.current = null;
    }

    if (!referenciaAbrigo) return;

    const iconeAbrigo = L.divIcon({
      className: "wtg-pin-icon",
      html: `
        <div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#0f172a;color:#38bdf8;border:2px solid #38bdf8;box-shadow:0 2px 8px rgba(0,0,0,0.6);font-size:13px;" title="Localização do Abrigo">
          🏠
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    marcadorReferenciaRef.current = L.marker([referenciaAbrigo.lat, referenciaAbrigo.lng], {
      icon: iconeAbrigo,
      interactive: true,
    })
      .bindTooltip(referenciaAbrigo.nome ? `🏠 ${referenciaAbrigo.nome}` : "🏠 Local do Abrigo", {
        direction: "top",
        offset: [0, -10],
      })
      .addTo(mapa);
  }, [referenciaAbrigo]);

  // 3. Atualiza ou cria o marcador arrastável do ponto selecionado
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    const temCoordenadaValida =
      latitude !== null &&
      longitude !== null &&
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    if (!temCoordenadaValida) {
      if (marcadorSelecionadoRef.current) {
        marcadorSelecionadoRef.current.remove();
        marcadorSelecionadoRef.current = null;
      }
      return;
    }

    const iconeSelecionado = L.divIcon({
      className: "wtg-pin-icon",
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;cursor:grab;">
          <div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:#f59e0b;color:#020617;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.65);font-size:15px;font-weight:900;">
            📍
          </div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #f59e0b;margin-top:-1px;" />
        </div>
      `,
      iconSize: [30, 36],
      iconAnchor: [15, 34],
    });

    if (!marcadorSelecionadoRef.current) {
      const marcador = L.marker([latitude, longitude], {
        icon: iconeSelecionado,
        draggable: true,
        zIndexOffset: 600,
      }).addTo(mapa);

      marcador.on("dragend", () => {
        const pos = marcador.getLatLng();
        callbackRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      marcadorSelecionadoRef.current = marcador;
    } else {
      marcadorSelecionadoRef.current.setLatLng([latitude, longitude]);
    }

    mapa.panTo([latitude, longitude], { animate: true });
  }, [latitude, longitude]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
      <div
        ref={containerRef}
        aria-label="Mapa interativo para seleção de coordenadas"
        className={`w-full ${alturaClasse} z-0 cursor-crosshair`}
      />
      <div className="pointer-events-none absolute bottom-2 right-2 z-[400] rounded-lg border border-slate-700/90 bg-slate-950/90 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow backdrop-blur">
        👆 Clique no mapa ou arraste o pino 📍
      </div>
    </div>
  );
}
