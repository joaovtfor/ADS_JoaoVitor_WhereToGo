"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { obterStatusGravidade, obterStatusOcupacao, type AbrigoMapa, type AlertaMapa } from "./mapa/tipos";

interface PropriedadesMapaLeaflet {
  abrigos: AbrigoMapa[];
  alertas?: AlertaMapa[];
  mostrarAlertas?: boolean;
  idSelecionado: number | null;
  focoTick?: number;
  focoCoordenada?: { lat: number; lng: number; tick: number } | null;
  /** Muda a cada pedido de "enquadrar todos os abrigos". */
  enquadrarTick?: number;
  posicaoUsuario: { lat: number; lng: number } | null;
  aoSelecionarAbrigo: (id: number) => void;
}

// Coordenadas centrais padrão (Passo Fundo - RS)
const CENTRO_PADRAO: [number, number] = [-28.258, -52.406];
const ZOOM_PADRAO = 13;

/** Movimento reduzido no aparelho: o mapa vai direto ao lugar, sem voo nem zoom animado. */
function movimentoReduzido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Triângulo de alerta (mesmo desenho do ícone do sistema), para os marcadores em HTML do Leaflet. */
const SVG_ALERTA =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Tudo o que muda a aparência do pino. Se a assinatura não mudou, o marcador não é tocado. */
function assinaturaDoPino(abrigo: AbrigoMapa, selecionado: boolean): string {
  return [
    abrigo.ocupacao.nivel,
    abrigo.ocupacao.vagasDisponiveis,
    abrigo.statusInfraestrutura,
    abrigo.emAreaDeRisco,
    abrigo.destaque,
    selecionado,
    abrigo.nome,
  ].join("|");
}

/** Pino: o número de vagas na cor do estado (estilos em globals.css, DESIGN.md §5.1). */
function criarIconeAbrigo(abrigo: AbrigoMapa, selecionado: boolean): L.DivIcon {
  const classes = ["wtg-pino", `wtg-pino--${obterStatusOcupacao(abrigo.ocupacao).nivel}`];
  if (selecionado) classes.push("wtg-pino--selecionado");
  // Com filtro de doação ativo, quem não precisa do item fica apagado.
  else if (abrigo.destaque === false) classes.push("wtg-pino--apagado");

  const aviso = abrigo.statusInfraestrutura !== "NORMAL" || abrigo.emAreaDeRisco ? '<span class="wtg-pino__aviso"></span>' : "";
  const nome = selecionado ? `<span class="wtg-pino__nome">${escaparHtml(abrigo.nome)}</span>` : "";
  const vagas = Math.max(0, abrigo.ocupacao.vagasDisponiveis);

  return L.divIcon({
    className: "wtg-pin-icon",
    html: `<div class="${classes.join(" ")}"><span class="wtg-pino__corpo">${vagas}${aviso}</span>${nome}</div>`,
    iconSize: [44, 26],
    iconAnchor: [22, 13],
  });
}

function tituloDoPino(abrigo: AbrigoMapa): string {
  const vagas = Math.max(0, abrigo.ocupacao.vagasDisponiveis);
  return `${abrigo.nome}: ${vagas === 1 ? "1 vaga livre" : `${vagas} vagas livres`}`;
}

function criarIconeAlerta(alerta: AlertaMapa): L.DivIcon {
  return L.divIcon({
    className: "wtg-pin-icon",
    html: `<div class="wtg-alerta wtg-alerta--${obterStatusGravidade(alerta.gravidade).nivel}">${SVG_ALERTA}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function textoDoAlerta(alerta: AlertaMapa): string {
  const descricao = alerta.descricao ? `${escaparHtml(alerta.descricao)}<br>` : "";
  const onde = alerta.abrigo ? `Perto de ${escaparHtml(alerta.abrigo.nome)}` : "Alerta regional (Defesa Civil)";
  return `<strong>${escaparHtml(alerta.descricaoTipo)}</strong>${descricao}${onde}`;
}

export default function MapaPublicoLeaflet({
  abrigos,
  alertas = [],
  mostrarAlertas = true,
  idSelecionado,
  focoTick = 0,
  focoCoordenada = null,
  enquadrarTick = 0,
  posicaoUsuario,
  aoSelecionarAbrigo,
}: PropriedadesMapaLeaflet) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaAbrigosRef = useRef<L.FeatureGroup | null>(null);
  const marcadoresRef = useRef<Map<number, { marcador: L.Marker; assinatura: string }> | null>(null);
  const camadaAlertasRef = useRef<L.LayerGroup | null>(null);
  const camadaUsuarioRef = useRef<L.LayerGroup | null>(null);
  const jaAjustouBoundsIniciaisRef = useRef(false);
  const ultimoFocoRef = useRef<{ id: number | null; tick: number }>({ id: null, tick: -1 });
  const ultimoFocoCoordTickRef = useRef<number>(-1);
  const ultimoEnquadrarTickRef = useRef(enquadrarTick);
  // Os marcadores vivem mais que uma renderização: o clique sempre chama a função atual.
  const aoSelecionarRef = useRef(aoSelecionarAbrigo);

  useEffect(() => {
    aoSelecionarRef.current = aoSelecionarAbrigo;
  }, [aoSelecionarAbrigo]);

  // 1. Inicializa a instância do mapa Leaflet uma única vez
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapaRef.current) return;

    const animar = !movimentoReduzido();
    const mapa = L.map(container, {
      center: CENTRO_PADRAO,
      zoom: ZOOM_PADRAO,
      zoomControl: false,
      zoomAnimation: animar,
      fadeAnimation: animar,
      markerZoomAnimation: animar,
    });

    L.control.zoom({ position: "topleft", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(mapa);

    // Tiles Humanitarian OpenStreetMap Team (HOT). O estilo escuro e neutro vem de
    // um filtro CSS em globals.css: mesmo servidor, mesmo cache offline.
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
    camadaAbrigosRef.current = L.featureGroup().addTo(mapa);
    camadaUsuarioRef.current = L.layerGroup().addTo(mapa);
    marcadoresRef.current = new Map();
    mapaRef.current = mapa;

    return () => {
      mapa.remove();
      mapaRef.current = null;
      camadaAbrigosRef.current = null;
      marcadoresRef.current = null;
      camadaAlertasRef.current = null;
      camadaUsuarioRef.current = null;
    };
  }, []);

  // 2. Mantém um marcador por abrigo e atualiza só o que mudou (RF06 / RF08).
  //    Selecionar um abrigo ou receber uma atualização não recria os demais pinos.
  useEffect(() => {
    const mapa = mapaRef.current;
    const camada = camadaAbrigosRef.current;
    const marcadores = marcadoresRef.current;
    if (!mapa || !camada || !marcadores) return;

    const idsAtuais = new Set<number>();
    for (const abrigo of abrigos) {
      idsAtuais.add(abrigo.id);
      const selecionado = abrigo.id === idSelecionado;
      const assinatura = assinaturaDoPino(abrigo, selecionado);
      const camadaZ = selecionado ? 1000 : abrigo.destaque ? 600 : 0;
      const existente = marcadores.get(abrigo.id);

      if (!existente) {
        const titulo = tituloDoPino(abrigo);
        const marcador = L.marker([abrigo.latitude, abrigo.longitude], {
          icon: criarIconeAbrigo(abrigo, selecionado),
          zIndexOffset: camadaZ,
          title: titulo,
          alt: titulo,
        });
        marcador.on("click", () => aoSelecionarRef.current(abrigo.id));
        marcador.addTo(camada);
        marcadores.set(abrigo.id, { marcador, assinatura });
        continue;
      }

      const posicao = existente.marcador.getLatLng();
      if (posicao.lat !== abrigo.latitude || posicao.lng !== abrigo.longitude) {
        existente.marcador.setLatLng([abrigo.latitude, abrigo.longitude]);
      }
      if (existente.assinatura !== assinatura) {
        const titulo = tituloDoPino(abrigo);
        existente.marcador.options.title = titulo;
        existente.marcador.options.alt = titulo;
        existente.marcador.setIcon(criarIconeAbrigo(abrigo, selecionado));
        existente.marcador.setZIndexOffset(camadaZ);
        existente.assinatura = assinatura;
      }
    }

    for (const [id, { marcador }] of marcadores) {
      if (idsAtuais.has(id)) continue;
      camada.removeLayer(marcador);
      marcadores.delete(id);
    }

    // Ajusta o enquadramento inicial quando os abrigos chegam pela primeira vez
    if (!jaAjustouBoundsIniciaisRef.current && abrigos.length > 0) {
      const bounds = camada.getBounds();
      if (bounds.isValid()) {
        mapa.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
        jaAjustouBoundsIniciaisRef.current = true;
      }
    }
  }, [abrigos, idSelecionado]);

  // 3. Alertas de vias e áreas de risco, quando a camada está ligada (RF09)
  useEffect(() => {
    const grupoAlertas = camadaAlertasRef.current;
    if (!grupoAlertas) return;

    grupoAlertas.clearLayers();
    if (!mostrarAlertas) return;

    for (const alerta of alertas) {
      const texto = textoDoAlerta(alerta);
      // Alerta regional (sem abrigo): o toque só mostra o texto, não abre ficha.
      const idAbrigo = alerta.abrigo?.id;
      const verAbrigo = () => {
        if (idAbrigo !== undefined) aoSelecionarRef.current(idAbrigo);
      };

      // Área de risco: só o contorno; o nome aparece ao tocar ou passar o mouse.
      if (Array.isArray(alerta.poligono) && alerta.poligono.length >= 3) {
        const coordenadas: [number, number][] = alerta.poligono.map((p) => [p.lat, p.lng]);
        L.polygon(coordenadas, { className: `wtg-area wtg-area--${obterStatusGravidade(alerta.gravidade).nivel}` })
          .bindTooltip(texto, { sticky: true })
          .on("click", verAbrigo)
          .addTo(grupoAlertas);
        continue;
      }

      // Alerta pontual com local próprio (ex.: ponto da via bloqueada).
      // Sem local próprio, o alerta já aparece como aviso no pino do abrigo:
      // desenhá-lo deslocado indicaria um lugar que ninguém informou.
      if (!alerta.localizacaoPropria) continue;

      L.marker([alerta.latitude, alerta.longitude], {
        icon: criarIconeAlerta(alerta),
        zIndexOffset: -200,
        title: alerta.descricaoTipo,
        alt: alerta.descricaoTipo,
      })
        .bindTooltip(texto, { direction: "top", offset: [0, -12] })
        .on("click", verAbrigo)
        .addTo(grupoAlertas);
    }
  }, [alertas, mostrarAlertas]);

  // 4. Localização do cidadão/doador
  useEffect(() => {
    const grupoUsuario = camadaUsuarioRef.current;
    if (!grupoUsuario) return;

    grupoUsuario.clearLayers();
    if (!posicaoUsuario) return;

    L.marker([posicaoUsuario.lat, posicaoUsuario.lng], {
      icon: L.divIcon({ className: "wtg-pin-icon", html: '<div class="wtg-voce"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
      zIndexOffset: 900,
      title: "Você está aqui",
      alt: "Você está aqui",
      interactive: false,
    }).addTo(grupoUsuario);
  }, [posicaoUsuario]);

  // 5. Centraliza suavemente quando o usuário seleciona um abrigo (compensando a largura do painel lateral)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !idSelecionado) {
      ultimoFocoRef.current = { id: null, tick: focoTick };
      return;
    }

    const alvo = abrigos.find((a) => a.id === idSelecionado);
    if (!alvo) return;

    // Evita recentralizar durante a atualização automática se o abrigo e o focoTick não mudaram
    if (ultimoFocoRef.current.id === idSelecionado && ultimoFocoRef.current.tick === focoTick) return;

    ultimoFocoRef.current = { id: idSelecionado, tick: focoTick };

    mapa.stop();
    const zoomDestino = Math.max(mapa.getZoom(), 15);
    const pontoAlvo = mapa.project([alvo.latitude, alvo.longitude], zoomDestino);
    // A ficha cobre parte do mapa: no desktop, 400 px à direita; no celular, os 62% de baixo.
    // O pino vai para o centro da área que continua visível.
    const telaLarga = window.innerWidth >= 640;
    const deslocamentoX = telaLarga ? 200 : 0;
    const deslocamentoY = telaLarga ? 0 : mapa.getSize().y * 0.31;
    const centroCompensado = mapa.unproject(L.point(pontoAlvo.x + deslocamentoX, pontoAlvo.y + deslocamentoY), zoomDestino);

    mapa.flyTo(centroCompensado, zoomDestino, { animate: !movimentoReduzido(), duration: 0.5 });
  }, [idSelecionado, focoTick, abrigos]);

  // 6. Centraliza em uma coordenada de alerta quando acionado no painel de alertas (RF09)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !focoCoordenada || focoCoordenada.tick === ultimoFocoCoordTickRef.current) return;

    ultimoFocoCoordTickRef.current = focoCoordenada.tick;
    mapa.stop();
    mapa.flyTo([focoCoordenada.lat, focoCoordenada.lng], Math.max(mapa.getZoom(), 15), { animate: !movimentoReduzido(), duration: 0.5 });
  }, [focoCoordenada]);

  // 7. Enquadra todos os abrigos visíveis quando pedido pela barra de resumo
  useEffect(() => {
    if (enquadrarTick === ultimoEnquadrarTickRef.current) return;
    ultimoEnquadrarTickRef.current = enquadrarTick;
    const bounds = camadaAbrigosRef.current?.getBounds();
    if (bounds?.isValid()) mapaRef.current?.fitBounds(bounds.pad(0.22), { maxZoom: 15, animate: !movimentoReduzido() });
  }, [enquadrarTick]);

  return <div ref={containerRef} aria-label="Mapa interativo de abrigos emergenciais" className="z-0 h-full w-full" />;
}
