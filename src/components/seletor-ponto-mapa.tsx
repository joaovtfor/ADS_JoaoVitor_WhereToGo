"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export interface VerticePoligono {
  lat: number;
  lng: number;
}

interface PropriedadesSeletorPontoMapa {
  latitude: number | null;
  longitude: number | null;
  referenciaAbrigo?: { lat: number; lng: number; nome?: string } | null;
  aoSelecionarCoordenada: (lat: number, lng: number) => void;
  modo?: "ponto" | "poligono";
  poligono?: VerticePoligono[];
  aoAlterarPoligono?: (pontos: VerticePoligono[]) => void;
  alturaClasse?: string;
}

// Centro padrão: Passo Fundo - RS
const CENTRO_PADRAO: [number, number] = [-28.258, -52.406];

export default function SeletorPontoMapa({
  latitude,
  longitude,
  referenciaAbrigo = null,
  aoSelecionarCoordenada,
  modo = "ponto",
  poligono = [],
  aoAlterarPoligono,
  alturaClasse = "h-56",
}: PropriedadesSeletorPontoMapa) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorSelecionadoRef = useRef<L.Marker | null>(null);
  const marcadorReferenciaRef = useRef<L.Marker | null>(null);
  const camadaPoligonoRef = useRef<L.LayerGroup | null>(null);

  const callbackPontoRef = useRef(aoSelecionarCoordenada);
  const callbackPoligonoRef = useRef(aoAlterarPoligono);
  const modoRef = useRef(modo);
  const poligonoRef = useRef(poligono);

  useEffect(() => {
    callbackPontoRef.current = aoSelecionarCoordenada;
  }, [aoSelecionarCoordenada]);

  useEffect(() => {
    callbackPoligonoRef.current = aoAlterarPoligono;
  }, [aoAlterarPoligono]);

  useEffect(() => {
    modoRef.current = modo;
  }, [modo]);

  useEffect(() => {
    poligonoRef.current = poligono;
  }, [poligono]);

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

    camadaPoligonoRef.current = L.layerGroup().addTo(mapa);

    // Clique no mapa: define pino único (modo="ponto") ou adiciona vértice ao polígono (modo="poligono")
    mapa.on("click", (evento: L.LeafletMouseEvent) => {
      const lat = Number(evento.latlng.lat.toFixed(6));
      const lng = Number(evento.latlng.lng.toFixed(6));

      if (modoRef.current === "poligono") {
        const novos = [...poligonoRef.current, { lat, lng }];
        callbackPoligonoRef.current?.(novos);
        const mediaLat = Number((novos.reduce((acc, p) => acc + p.lat, 0) / novos.length).toFixed(6));
        const mediaLng = Number((novos.reduce((acc, p) => acc + p.lng, 0) / novos.length).toFixed(6));
        callbackPontoRef.current(mediaLat, mediaLng);
      } else {
        callbackPontoRef.current(lat, lng);
      }
    });

    mapaRef.current = mapa;

    return () => {
      mapa.remove();
      mapaRef.current = null;
      marcadorSelecionadoRef.current = null;
      marcadorReferenciaRef.current = null;
      camadaPoligonoRef.current = null;
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
      html: '<div class="wtg-marca-abrigo"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    marcadorReferenciaRef.current = L.marker([referenciaAbrigo.lat, referenciaAbrigo.lng], {
      icon: iconeAbrigo,
      interactive: true,
    })
      .bindTooltip(referenciaAbrigo.nome ? `Abrigo: ${referenciaAbrigo.nome}` : "Local do abrigo", {
        direction: "top",
        offset: [0, -10],
      })
      .addTo(mapa);
  }, [referenciaAbrigo]);

  // 3. Modo Ponto Único: Atualiza ou cria o marcador arrastável do ponto selecionado
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (modo === "poligono") {
      if (marcadorSelecionadoRef.current) {
        marcadorSelecionadoRef.current.remove();
        marcadorSelecionadoRef.current = null;
      }
      return;
    }

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
      html: '<div class="wtg-marca-ponto"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    if (!marcadorSelecionadoRef.current) {
      const marcador = L.marker([latitude, longitude], {
        icon: iconeSelecionado,
        draggable: true,
        zIndexOffset: 600,
      }).addTo(mapa);

      marcador.on("dragend", () => {
        const pos = marcador.getLatLng();
        callbackPontoRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      marcadorSelecionadoRef.current = marcador;
    } else {
      marcadorSelecionadoRef.current.setLatLng([latitude, longitude]);
    }

    mapa.panTo([latitude, longitude], { animate: true });
  }, [latitude, longitude, modo]);

  // 4. Modo Polígono (Área de Risco): Desenha os markers de vértice, arestas e o polígono sombreado
  useEffect(() => {
    const grupo = camadaPoligonoRef.current;
    if (!grupo) return;

    grupo.clearLayers();
    if (modo !== "poligono" || poligono.length === 0) return;

    const coordenadasLatLng: [number, number][] = poligono.map((p) => [p.lat, p.lng]);

    if (poligono.length === 2) {
      // Mesmo desenho da área de risco no mapa público (classes em globals.css).
      L.polyline(coordenadasLatLng, { className: "wtg-area wtg-area--critico" }).addTo(grupo);
    } else if (poligono.length >= 3) {
      L.polygon(coordenadasLatLng, { className: "wtg-area wtg-area--critico" }).addTo(grupo);
    }

    // Pontos numerados e arrastáveis do contorno
    poligono.forEach((vertice, idx) => {
      const iconeVertice = L.divIcon({
        className: "wtg-pin-icon",
        html: `<div class="wtg-marca-vertice">${idx + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marcadorVertice = L.marker([vertice.lat, vertice.lng], {
        icon: iconeVertice,
        draggable: true,
        zIndexOffset: 700 + idx,
      })
        .bindTooltip(`Vértice #${idx + 1} • Arraste para ajustar ou clique para remover`, {
          direction: "top",
          offset: [0, -10],
        })
        .addTo(grupo);

      marcadorVertice.on("dragend", () => {
        const pos = marcadorVertice.getLatLng();
        const atualizados = poligonoRef.current.map((item, i) =>
          i === idx ? { lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) } : item,
        );
        callbackPoligonoRef.current?.(atualizados);
        if (atualizados.length > 0) {
          const mediaLat = Number((atualizados.reduce((acc, p) => acc + p.lat, 0) / atualizados.length).toFixed(6));
          const mediaLng = Number((atualizados.reduce((acc, p) => acc + p.lng, 0) / atualizados.length).toFixed(6));
          callbackPontoRef.current(mediaLat, mediaLng);
        }
      });

      marcadorVertice.on("click", (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        const atualizados = poligonoRef.current.filter((_, i) => i !== idx);
        callbackPoligonoRef.current?.(atualizados);
        if (atualizados.length > 0) {
          const mediaLat = Number((atualizados.reduce((acc, p) => acc + p.lat, 0) / atualizados.length).toFixed(6));
          const mediaLng = Number((atualizados.reduce((acc, p) => acc + p.lng, 0) / atualizados.length).toFixed(6));
          callbackPontoRef.current(mediaLat, mediaLng);
        }
      });
    });
  }, [modo, poligono]);

  return (
    <div className="relative w-full overflow-hidden rounded-controle border border-borda-forte bg-superficie">
      <div
        ref={containerRef}
        aria-label="Mapa interativo para seleção de coordenadas ou área de risco"
        className={`w-full ${alturaClasse} z-0 cursor-crosshair`}
      />
      <p className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-controle border border-borda bg-superficie px-2 py-1 text-meta text-texto-2">
        {modo === "poligono" ? "Toque no mapa para marcar os pontos; arraste para ajustar" : "Toque no mapa ou arraste o ponto"}
      </p>
    </div>
  );
}
