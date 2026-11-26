"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useTema } from "@/components/ui/tema";
import {
  bboxIntersecta,
  calcularBBoxPoligono,
  criarIndiceAbrigos,
  criarIndiceAlertas,
  nivelDoCluster,
  smoothFactorParaZoom,
  type BBoxMapa,
  type PropriedadesClusterAbrigo,
} from "./mapa/cluster-mapa";
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
  /** Há uma tela do painel aberta (lista, ficha, filtros...) cobrindo parte do mapa. */
  painelAberto?: boolean;
  filtroDoacaoAtivo?: boolean;
  aoSelecionarAbrigo: (id: number) => void;
  aoAbrirClusterCoincidente?: (ids: number[]) => void;
}

interface EntradaMarcador {
  marcador: L.Marker;
  assinatura: string;
}

interface EntradaPoligono {
  camada: L.Polygon;
  assinatura: string;
  smoothFactor: number;
  gravidade: "ALERTA" | "CRITICO";
  texto: string;
  idAbrigo: number | undefined;
  vinculado: boolean;
}

interface EntradaAlertaPontual {
  marcador: L.Marker;
  assinatura: string;
  texto: string;
  idAbrigo: number | undefined;
  vinculado: boolean;
}

interface PoligonoPreparado {
  id: number;
  gravidade: "ALERTA" | "CRITICO";
  coordenadas: [number, number][];
  bbox: BBoxMapa;
  assinatura: string;
  texto: string;
  idAbrigo: number | undefined;
}

interface CoresAreaCanvas {
  critico: string;
  atencao: string;
}

// Coordenadas centrais padrão (Passo Fundo - RS)
const CENTRO_PADRAO: [number, number] = [-28.258, -52.406];
const ZOOM_PADRAO = 13;

/** Largura que o painel ocupa à esquerda no desktop: 400 px mais as margens (folha.tsx). */
const LARGURA_PAINEL = 424;
/** Fração da altura do mapa que a folha cobre no celular, na altura média (folha.tsx). */
const ALTURA_FOLHA = 0.62;

/** Movimento reduzido no aparelho: o mapa vai direto ao lugar, sem voo nem zoom animado. */
function movimentoReduzido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function telaLarga(): boolean {
  return window.matchMedia("(min-width: 640px)").matches;
}

/**
 * Parte do mapa coberta pelo painel, para centralizar e enquadrar só na parte
 * que continua visível: a faixa da esquerda no desktop, a de baixo no celular.
 */
function areaCoberta(mapa: L.Map): { esquerda: number; baixo: number } {
  return telaLarga() ? { esquerda: LARGURA_PAINEL, baixo: 0 } : { esquerda: 0, baixo: Math.round(mapa.getSize().y * ALTURA_FOLHA) };
}

/** Voa até o ponto deixando-o no centro da área que o painel não cobre. */
function voarAte(mapa: L.Map, destino: L.LatLngExpression, painelAberto: boolean, zoomAlvo?: number) {
  mapa.stop();
  const zoom = zoomAlvo ?? Math.max(mapa.getZoom(), 15);
  const coberta = painelAberto ? areaCoberta(mapa) : { esquerda: 0, baixo: 0 };
  const ponto = mapa.project(destino, zoom);
  // O centro do mapa anda metade da faixa coberta para o lado dela.
  const centro = mapa.unproject(L.point(ponto.x - coberta.esquerda / 2, ponto.y + coberta.baixo / 2), zoom);
  mapa.flyTo(centro, zoom, { animate: !movimentoReduzido(), duration: 0.5 });
}

function lerCoresAreaCanvas(): CoresAreaCanvas {
  const estilo = getComputedStyle(document.documentElement);
  return {
    critico: estilo.getPropertyValue("--wtg-critico").trim(),
    atencao: estilo.getPropertyValue("--wtg-atencao").trim(),
  };
}

function calcularBoundsAbrigos(abrigos: AbrigoMapa[]): L.LatLngBounds | null {
  if (abrigos.length === 0) return null;
  let minLat = abrigos[0].latitude;
  let maxLat = abrigos[0].latitude;
  let minLng = abrigos[0].longitude;
  let maxLng = abrigos[0].longitude;
  for (let i = 1; i < abrigos.length; i++) {
    const { latitude, longitude } = abrigos[i];
    if (latitude < minLat) minLat = latitude;
    if (latitude > maxLat) maxLat = latitude;
    if (longitude < minLng) minLng = longitude;
    if (longitude > maxLng) maxLng = longitude;
  }
  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
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

function assinaturaDoClusterAbrigo(props: PropriedadesClusterAbrigo): string {
  return [
    nivelDoCluster(props),
    props.totalVagas,
    props.qtdAbrigos,
    props.temAviso,
    props.temDestaque,
    props.filtroDoacaoAtivo,
  ].join("|");
}

function criarIconeClusterAbrigo(props: PropriedadesClusterAbrigo): L.DivIcon {
  const nivel = nivelDoCluster(props);
  const classes = ["wtg-cluster", `wtg-cluster--${nivel}`];
  if (props.filtroDoacaoAtivo && !props.temDestaque) classes.push("wtg-cluster--apagado");
  const aviso = props.temAviso ? '<span class="wtg-cluster__aviso"></span>' : "";

  return L.divIcon({
    className: "wtg-pin-icon",
    html: `<div class="${classes.join(" ")}"><span class="wtg-cluster__corpo"><span class="wtg-cluster__vagas">${props.totalVagas}</span><span class="wtg-cluster__qtd">&times;${props.qtdAbrigos}</span>${aviso}</span></div>`,
    iconSize: [56, 32],
    iconAnchor: [28, 16],
  });
}

function tituloDoClusterAbrigo(props: PropriedadesClusterAbrigo): string {
  const vagas = props.totalVagas === 1 ? "1 vaga livre" : `${props.totalVagas} vagas livres`;
  return `Grupo com ${props.qtdAbrigos} abrigos e ${vagas}. Toque para aproximar.`;
}

function criarIconeAlerta(alerta: AlertaMapa): L.DivIcon {
  return L.divIcon({
    className: "wtg-pin-icon",
    html: `<div class="wtg-alerta wtg-alerta--${obterStatusGravidade(alerta.gravidade).nivel}">${SVG_ALERTA}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function criarIconeClusterAlerta(qtdAlertas: number, gravidade: "ALERTA" | "CRITICO"): L.DivIcon {
  const nivel = obterStatusGravidade(gravidade).nivel;
  return L.divIcon({
    className: "wtg-pin-icon",
    html: `<div class="wtg-alerta-cluster wtg-alerta-cluster--${nivel}">${SVG_ALERTA}<span>${qtdAlertas}</span></div>`,
    iconSize: [42, 26],
    iconAnchor: [21, 13],
  });
}

function textoDoAlerta(alerta: AlertaMapa): string {
  const descricao = alerta.descricao ? `${escaparHtml(alerta.descricao)}<br>` : "";
  const onde = alerta.abrigo ? `Perto de ${escaparHtml(alerta.abrigo.nome)}` : "Alerta regional (Defesa Civil)";
  return `<strong>${escaparHtml(alerta.descricaoTipo)}</strong>${descricao}${onde}`;
}

function assinaturaDoAlerta(alerta: AlertaMapa): string {
  return [
    alerta.gravidade,
    alerta.descricaoTipo,
    alerta.descricao ?? "",
    alerta.abrigo?.id ?? "",
    alerta.abrigo?.nome ?? "",
  ].join("|");
}

function MapaPublicoLeaflet({
  abrigos,
  alertas = [],
  mostrarAlertas = true,
  idSelecionado,
  focoTick = 0,
  focoCoordenada = null,
  enquadrarTick = 0,
  posicaoUsuario,
  painelAberto = false,
  filtroDoacaoAtivo = false,
  aoSelecionarAbrigo,
  aoAbrirClusterCoincidente,
}: PropriedadesMapaLeaflet) {
  const { temaEfetivo } = useTema();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const canvasAlertasRef = useRef<L.Canvas | null>(null);
  const coresAreaRef = useRef<CoresAreaCanvas | null>(null);

  const camadaAbrigosRef = useRef<L.LayerGroup | null>(null);
  const marcadoresRef = useRef<Map<number, EntradaMarcador> | null>(null);
  const clustersRef = useRef<Map<number, EntradaMarcador> | null>(null);

  const camadaAlertasRef = useRef<L.LayerGroup | null>(null);
  const poligonosRef = useRef<Map<number, EntradaPoligono> | null>(null);
  const alertasPontuaisRef = useRef<Map<number, EntradaAlertaPontual> | null>(null);
  const clustersAlertasRef = useRef<Map<number, EntradaMarcador> | null>(null);

  const camadaUsuarioRef = useRef<L.LayerGroup | null>(null);
  const rafSincronizacaoRef = useRef<number | null>(null);
  const jaAjustouBoundsIniciaisRef = useRef(false);
  const ultimoFocoRef = useRef<{ id: number | null; tick: number }>({ id: null, tick: -1 });
  const ultimoFocoCoordTickRef = useRef<number>(-1);
  const ultimoEnquadrarTickRef = useRef(enquadrarTick);

  // Refs mantidas atualizadas via efeito para os listeners do Leaflet e a sincronização via RAF.
  const aoSelecionarRef = useRef(aoSelecionarAbrigo);
  const aoAbrirClusterCoincidenteRef = useRef(aoAbrirClusterCoincidente);
  const painelAbertoRef = useRef(painelAberto);
  const abrigosRef = useRef(abrigos);
  const idSelecionadoRef = useRef(idSelecionado);
  const mostrarAlertasRef = useRef(mostrarAlertas);

  const indiceAbrigos = useMemo(
    () => criarIndiceAbrigos(abrigos, { idSelecionado, filtroDoacaoAtivo }),
    [abrigos, idSelecionado, filtroDoacaoAtivo],
  );

  const poligonosPreparados = useMemo<PoligonoPreparado[]>(() => {
    const lista: PoligonoPreparado[] = [];
    for (const alerta of alertas) {
      if (!Array.isArray(alerta.poligono) || alerta.poligono.length < 3) continue;
      const coordenadas: [number, number][] = alerta.poligono.map((p) => [p.lat, p.lng]);
      const assinaturaCoords = coordenadas.map(([lat, lng]) => `${lat},${lng}`).join(";");
      lista.push({
        id: alerta.id,
        gravidade: alerta.gravidade,
        coordenadas,
        bbox: calcularBBoxPoligono(alerta.poligono),
        assinatura: `${assinaturaDoAlerta(alerta)}|${assinaturaCoords}`,
        texto: textoDoAlerta(alerta),
        idAbrigo: alerta.abrigo?.id,
      });
    }
    return lista;
  }, [alertas]);

  const indiceAlertas = useMemo(() => criarIndiceAlertas(alertas), [alertas]);

  const indiceAbrigosRef = useRef(indiceAbrigos);
  const poligonosPreparadosRef = useRef(poligonosPreparados);
  const indiceAlertasRef = useRef(indiceAlertas);

  useEffect(() => {
    aoSelecionarRef.current = aoSelecionarAbrigo;
  }, [aoSelecionarAbrigo]);

  useEffect(() => {
    aoAbrirClusterCoincidenteRef.current = aoAbrirClusterCoincidente;
  }, [aoAbrirClusterCoincidente]);

  useEffect(() => {
    painelAbertoRef.current = painelAberto;
  }, [painelAberto]);

  const sincronizarViewport = useCallback(() => {
    const mapa = mapaRef.current;
    const canvasAlertas = canvasAlertasRef.current;
    const camadaAbrigos = camadaAbrigosRef.current;
    const marcadores = marcadoresRef.current;
    const clusters = clustersRef.current;
    const grupoAlertas = camadaAlertasRef.current;
    const poligonos = poligonosRef.current;
    const alertasPontuais = alertasPontuaisRef.current;
    const clustersAlertas = clustersAlertasRef.current;
    const indice = indiceAbrigosRef.current;
    const indiceAlertasAtual = indiceAlertasRef.current;

    if (
      !mapa ||
      !canvasAlertas ||
      !camadaAbrigos ||
      !marcadores ||
      !clusters ||
      !grupoAlertas ||
      !poligonos ||
      !alertasPontuais ||
      !clustersAlertas
    ) {
      return;
    }

    const zoom = mapa.getZoom();
    const bounds = mapa.getBounds().pad(0.15);
    const bboxAbrigos: BBoxMapa = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];

    // --- 1. Abrigos e clusters no viewport ---
    const itensAbrigos = indice.consultar(bboxAbrigos, zoom);
    const idsAbrigosVisiveis = new Set<number>();
    const idsClustersVisiveis = new Set<number>();
    const selecionadoAtual = idSelecionadoRef.current;

    for (const item of itensAbrigos) {
      if (item.tipo === "abrigo") {
        const { abrigo } = item;
        idsAbrigosVisiveis.add(abrigo.id);
        const selecionado = abrigo.id === selecionadoAtual;
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
          marcador.addTo(camadaAbrigos);
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
          // O Leaflet reaproveita o mesmo <div> no setIcon e só escreve o title ao
          // criá-lo: sem isto, o leitor de tela anunciaria as vagas de antes.
          existente.marcador.getElement()?.setAttribute("title", titulo);
          existente.marcador.setZIndexOffset(camadaZ);
          existente.assinatura = assinatura;
        }
        continue;
      }

      const { propriedades } = item;
      idsClustersVisiveis.add(item.id);
      const assinatura = assinaturaDoClusterAbrigo(propriedades);
      const camadaZ = propriedades.filtroDoacaoAtivo && propriedades.temDestaque ? 550 : 100;
      const existente = clusters.get(item.id);

      if (!existente) {
        const titulo = tituloDoClusterAbrigo(propriedades);
        const marcador = L.marker([item.latitude, item.longitude], {
          icon: criarIconeClusterAbrigo(propriedades),
          zIndexOffset: camadaZ,
          title: titulo,
          alt: titulo,
        });
        marcador.on("click", () => {
          const mapaAtual = mapaRef.current;
          const indiceAtual = indiceAbrigosRef.current;
          if (!mapaAtual) return;
          const zoomAtual = mapaAtual.getZoom();
          if (indiceAtual.saoCoincidentes(item.id, zoomAtual) && aoAbrirClusterCoincidenteRef.current) {
            aoAbrirClusterCoincidenteRef.current(indiceAtual.obterFolhas(item.id).map((a) => a.id));
            return;
          }
          const pos = marcador.getLatLng();
          const proximoZoom = Math.min(18, indiceAtual.zoomDeExpansao(item.id, zoomAtual));
          voarAte(mapaAtual, [pos.lat, pos.lng], painelAbertoRef.current, proximoZoom);
        });
        marcador.addTo(camadaAbrigos);
        clusters.set(item.id, { marcador, assinatura });
        continue;
      }

      const posicao = existente.marcador.getLatLng();
      if (posicao.lat !== item.latitude || posicao.lng !== item.longitude) {
        existente.marcador.setLatLng([item.latitude, item.longitude]);
      }
      if (existente.assinatura !== assinatura) {
        const titulo = tituloDoClusterAbrigo(propriedades);
        existente.marcador.options.title = titulo;
        existente.marcador.options.alt = titulo;
        existente.marcador.setIcon(criarIconeClusterAbrigo(propriedades));
        existente.marcador.getElement()?.setAttribute("title", titulo);
        existente.marcador.setZIndexOffset(camadaZ);
        existente.assinatura = assinatura;
      }
    }

    for (const [id, { marcador }] of marcadores) {
      if (idsAbrigosVisiveis.has(id)) continue;
      camadaAbrigos.removeLayer(marcador);
      marcadores.delete(id);
    }

    for (const [id, { marcador }] of clusters) {
      if (idsClustersVisiveis.has(id)) continue;
      camadaAbrigos.removeLayer(marcador);
      clusters.delete(id);
    }

    // --- 2. Alertas incrementais, culling por BBox e tooltips lazy ---
    if (!mostrarAlertasRef.current) {
      for (const [id, { camada }] of poligonos) {
        camada.unbindTooltip();
        grupoAlertas.removeLayer(camada);
        poligonos.delete(id);
      }
      for (const [id, { marcador }] of alertasPontuais) {
        marcador.unbindTooltip();
        grupoAlertas.removeLayer(marcador);
        alertasPontuais.delete(id);
      }
      for (const [id, { marcador }] of clustersAlertas) {
        grupoAlertas.removeLayer(marcador);
        clustersAlertas.delete(id);
      }
      return;
    }

    const cores = coresAreaRef.current ?? (coresAreaRef.current = lerCoresAreaCanvas());
    const boundsPol = mapa.getBounds().pad(0.25);
    const bboxPol: BBoxMapa = [boundsPol.getWest(), boundsPol.getSouth(), boundsPol.getEast(), boundsPol.getNorth()];
    const smooth = smoothFactorParaZoom(zoom);
    const idsPoligonosVisiveis = new Set<number>();

    for (const item of poligonosPreparadosRef.current) {
      if (!bboxIntersecta(item.bbox, bboxPol)) continue;
      idsPoligonosVisiveis.add(item.id);
      const cor = item.gravidade === "CRITICO" ? cores.critico : cores.atencao;
      const existente = poligonos.get(item.id);

      if (!existente) {
        const camada = L.polygon(item.coordenadas, {
          renderer: canvasAlertas,
          color: cor,
          fillColor: cor,
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: "5 4",
          smoothFactor: smooth,
        });
        const entrada: EntradaPoligono = {
          camada,
          assinatura: item.assinatura,
          smoothFactor: smooth,
          gravidade: item.gravidade,
          texto: item.texto,
          idAbrigo: item.idAbrigo,
          vinculado: false,
        };
        camada.on("click", () => {
          if (entrada.idAbrigo !== undefined) aoSelecionarRef.current(entrada.idAbrigo);
        });
        camada.on("mouseover", (e: L.LeafletMouseEvent) => {
          if (!entrada.vinculado) {
            entrada.vinculado = true;
            camada.bindTooltip(entrada.texto, { sticky: true }).openTooltip(e.latlng);
          }
        });
        camada.addTo(grupoAlertas);
        poligonos.set(item.id, entrada);
        continue;
      }

      if (existente.assinatura !== item.assinatura) {
        existente.camada.setLatLngs(item.coordenadas);
        if (existente.gravidade !== item.gravidade) {
          existente.camada.setStyle({ color: cor, fillColor: cor });
          existente.gravidade = item.gravidade;
        }
        existente.idAbrigo = item.idAbrigo;
        existente.texto = item.texto;
        existente.assinatura = item.assinatura;
        if (existente.vinculado) {
          existente.camada.unbindTooltip();
          existente.vinculado = false;
        }
      }
      if (existente.smoothFactor !== smooth) {
        existente.camada.options.smoothFactor = smooth;
        existente.camada.redraw();
        existente.smoothFactor = smooth;
      }
    }

    for (const [id, { camada }] of poligonos) {
      if (idsPoligonosVisiveis.has(id)) continue;
      camada.unbindTooltip();
      grupoAlertas.removeLayer(camada);
      poligonos.delete(id);
    }

    // Alertas pontuais e clusters de alerta
    const itensAlertas = indiceAlertasAtual.consultar(bboxAbrigos, zoom);
    const idsAlertasPontuaisVisiveis = new Set<number>();
    const idsClustersAlertasVisiveis = new Set<number>();

    for (const item of itensAlertas) {
      if (item.tipo === "alerta") {
        const { alerta } = item;
        idsAlertasPontuaisVisiveis.add(alerta.id);
        const assinatura = assinaturaDoAlerta(alerta);
        const existente = alertasPontuais.get(alerta.id);

        if (!existente) {
          const marcador = L.marker([alerta.latitude, alerta.longitude], {
            icon: criarIconeAlerta(alerta),
            zIndexOffset: -200,
            title: alerta.descricaoTipo,
            alt: alerta.descricaoTipo,
          });
          const entrada: EntradaAlertaPontual = {
            marcador,
            assinatura,
            texto: textoDoAlerta(alerta),
            idAbrigo: alerta.abrigo?.id,
            vinculado: false,
          };
          marcador.on("click", () => {
            if (entrada.idAbrigo !== undefined) aoSelecionarRef.current(entrada.idAbrigo);
          });
          marcador.on("mouseover", () => {
            if (!entrada.vinculado) {
              entrada.vinculado = true;
              marcador.bindTooltip(entrada.texto, { direction: "top", offset: [0, -12] }).openTooltip();
            }
          });
          marcador.addTo(grupoAlertas);
          alertasPontuais.set(alerta.id, entrada);
          continue;
        }

        const posicao = existente.marcador.getLatLng();
        if (posicao.lat !== alerta.latitude || posicao.lng !== alerta.longitude) {
          existente.marcador.setLatLng([alerta.latitude, alerta.longitude]);
        }
        if (existente.assinatura !== assinatura) {
          existente.marcador.options.title = alerta.descricaoTipo;
          existente.marcador.options.alt = alerta.descricaoTipo;
          existente.marcador.setIcon(criarIconeAlerta(alerta));
          existente.marcador.getElement()?.setAttribute("title", alerta.descricaoTipo);
          existente.idAbrigo = alerta.abrigo?.id;
          existente.texto = textoDoAlerta(alerta);
          existente.assinatura = assinatura;
          if (existente.vinculado) {
            existente.marcador.unbindTooltip();
            existente.vinculado = false;
          }
        }
        continue;
      }

      idsClustersAlertasVisiveis.add(item.id);
      const assinatura = `${item.qtdAlertas}|${item.gravidade}`;
      const existente = clustersAlertas.get(item.id);

      if (!existente) {
        const titulo = `${item.qtdAlertas} alertas próximos. Toque para aproximar.`;
        const marcador = L.marker([item.latitude, item.longitude], {
          icon: criarIconeClusterAlerta(item.qtdAlertas, item.gravidade),
          zIndexOffset: -150,
          title: titulo,
          alt: titulo,
        });
        marcador.on("click", () => {
          const mapaAtual = mapaRef.current;
          const indiceAtual = indiceAlertasRef.current;
          if (!mapaAtual) return;
          const zoomAtual = mapaAtual.getZoom();
          const proximoZoom = Math.min(18, indiceAtual.zoomDeExpansao(item.id, zoomAtual));
          const pos = marcador.getLatLng();
          voarAte(mapaAtual, [pos.lat, pos.lng], painelAbertoRef.current, proximoZoom);
        });
        marcador.addTo(grupoAlertas);
        clustersAlertas.set(item.id, { marcador, assinatura });
        continue;
      }

      const posicao = existente.marcador.getLatLng();
      if (posicao.lat !== item.latitude || posicao.lng !== item.longitude) {
        existente.marcador.setLatLng([item.latitude, item.longitude]);
      }
      if (existente.assinatura !== assinatura) {
        const titulo = `${item.qtdAlertas} alertas próximos. Toque para aproximar.`;
        existente.marcador.options.title = titulo;
        existente.marcador.options.alt = titulo;
        existente.marcador.setIcon(criarIconeClusterAlerta(item.qtdAlertas, item.gravidade));
        existente.marcador.getElement()?.setAttribute("title", titulo);
        existente.assinatura = assinatura;
      }
    }

    for (const [id, { marcador }] of alertasPontuais) {
      if (idsAlertasPontuaisVisiveis.has(id)) continue;
      marcador.unbindTooltip();
      grupoAlertas.removeLayer(marcador);
      alertasPontuais.delete(id);
    }

    for (const [id, { marcador }] of clustersAlertas) {
      if (idsClustersAlertasVisiveis.has(id)) continue;
      grupoAlertas.removeLayer(marcador);
      clustersAlertas.delete(id);
    }
  }, []);

  const agendarSincronizacao = useCallback(() => {
    if (rafSincronizacaoRef.current !== null) {
      window.cancelAnimationFrame(rafSincronizacaoRef.current);
    }
    rafSincronizacaoRef.current = window.requestAnimationFrame(() => {
      rafSincronizacaoRef.current = null;
      sincronizarViewport();
    });
  }, [sincronizarViewport]);

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

    // Embaixo à direita: o alto é dos filtros e a esquerda, do painel (DESIGN.md §5.1).
    L.control.zoom({ position: "bottomright", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(mapa);

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

    canvasAlertasRef.current = L.canvas({ padding: 0.5 });
    camadaAlertasRef.current = L.layerGroup().addTo(mapa);
    camadaAbrigosRef.current = L.layerGroup().addTo(mapa);
    camadaUsuarioRef.current = L.layerGroup().addTo(mapa);

    marcadoresRef.current = new Map();
    clustersRef.current = new Map();
    poligonosRef.current = new Map();
    alertasPontuaisRef.current = new Map();
    clustersAlertasRef.current = new Map();
    mapaRef.current = mapa;

    mapa.on("moveend", agendarSincronizacao);
    mapa.on("zoomend", agendarSincronizacao);

    return () => {
      if (rafSincronizacaoRef.current !== null) {
        window.cancelAnimationFrame(rafSincronizacaoRef.current);
        rafSincronizacaoRef.current = null;
      }
      mapa.off("moveend", agendarSincronizacao);
      mapa.off("zoomend", agendarSincronizacao);
      mapa.remove();
      mapaRef.current = null;
      canvasAlertasRef.current = null;
      coresAreaRef.current = null;
      // O que já foi feito valia para este mapa. Um mapa novo (ex.: a remontagem do
      // StrictMode em desenvolvimento) precisa enquadrar e focar de novo.
      jaAjustouBoundsIniciaisRef.current = false;
      ultimoFocoRef.current = { id: null, tick: -1 };
      ultimoFocoCoordTickRef.current = -1;
      camadaAbrigosRef.current = null;
      marcadoresRef.current = null;
      clustersRef.current = null;
      camadaAlertasRef.current = null;
      poligonosRef.current = null;
      alertasPontuaisRef.current = null;
      clustersAlertasRef.current = null;
      camadaUsuarioRef.current = null;
    };
  }, [agendarSincronizacao]);

  // 2. Atualiza as cores dos polígonos no Canvas quando o tema efetivo muda
  useEffect(() => {
    const cores = lerCoresAreaCanvas();
    coresAreaRef.current = cores;
    const poligonos = poligonosRef.current;
    if (!poligonos) return;

    for (const entrada of poligonos.values()) {
      const cor = entrada.gravidade === "CRITICO" ? cores.critico : cores.atencao;
      entrada.camada.setStyle({ color: cor, fillColor: cor });
    }
  }, [temaEfetivo]);

  // 3. Reconcilia abrigos, clusters e alertas quando índices, seleção ou visibilidade mudam
  useEffect(() => {
    abrigosRef.current = abrigos;
    indiceAbrigosRef.current = indiceAbrigos;
    poligonosPreparadosRef.current = poligonosPreparados;
    indiceAlertasRef.current = indiceAlertas;
    mostrarAlertasRef.current = mostrarAlertas;
    idSelecionadoRef.current = idSelecionado;

    const mapa = mapaRef.current;
    if (!mapa) return;

    // Ajusta o enquadramento inicial quando os abrigos chegam pela primeira vez.
    // Com um abrigo aberto pelo link (?abrigo=ID), quem enquadra é o foco nele (efeito 5):
    // a animação do fitBounds começa no quadro seguinte e atropelaria o voo até o abrigo.
    if (!jaAjustouBoundsIniciaisRef.current && abrigos.length > 0) {
      const bounds = calcularBoundsAbrigos(abrigos);
      if (bounds?.isValid()) {
        if (!abrigos.some((a) => a.id === idSelecionado)) mapa.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
        jaAjustouBoundsIniciaisRef.current = true;
      }
    }

    if (rafSincronizacaoRef.current !== null) {
      window.cancelAnimationFrame(rafSincronizacaoRef.current);
      rafSincronizacaoRef.current = null;
    }
    sincronizarViewport();
  }, [abrigos, indiceAbrigos, poligonosPreparados, indiceAlertas, mostrarAlertas, idSelecionado, sincronizarViewport]);

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
    // A ficha está aberta no painel: o pino vai para o centro da área que continua visível.
    voarAte(mapa, [alvo.latitude, alvo.longitude], true);
  }, [idSelecionado, focoTick, abrigos]);

  // 6. Centraliza em uma coordenada de alerta quando acionado no painel de alertas (RF09)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !focoCoordenada || focoCoordenada.tick === ultimoFocoCoordTickRef.current) return;

    ultimoFocoCoordTickRef.current = focoCoordenada.tick;
    voarAte(mapa, [focoCoordenada.lat, focoCoordenada.lng], painelAbertoRef.current);
  }, [focoCoordenada]);

  // 7. Enquadra todos os abrigos quando pedido pela barra de resumo, fora do painel aberto
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || enquadrarTick === ultimoEnquadrarTickRef.current) return;
    ultimoEnquadrarTickRef.current = enquadrarTick;

    const bounds = calcularBoundsAbrigos(abrigosRef.current);
    if (!bounds?.isValid()) return;

    const coberta = painelAbertoRef.current ? areaCoberta(mapa) : { esquerda: 0, baixo: 0 };
    mapa.fitBounds(bounds.pad(0.22), {
      maxZoom: 15,
      animate: !movimentoReduzido(),
      paddingTopLeft: [coberta.esquerda, 0],
      paddingBottomRight: [0, coberta.baixo],
    });
  }, [enquadrarTick]);

  return <div ref={containerRef} aria-label="Mapa interativo de abrigos emergenciais" className="z-0 h-full w-full" />;
}

export default memo(MapaPublicoLeaflet);
