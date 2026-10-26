"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AbrigoMapa,
  AlertaMapa,
  NivelOcupacaoPublico,
  StatusInfraPublico,
} from "@/components/mapa-publico-leaflet";

const MapaPublicoLeaflet = dynamic(() => import("@/components/mapa-publico-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-slate-400">
      <div className="h-9 w-9 animate-spin rounded-full border-3 border-amber-400 border-t-transparent" />
      <p className="text-sm font-semibold text-slate-300">Carregando mapa interativo em tela cheia...</p>
    </div>
  ),
});

interface CategoriaPublica {
  id: number;
  nome: string;
  slug: string;
  itens: Array<{ id: number; nome: string; unidadeMedida: string }>;
}

interface DetalheAbrigoPublico {
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
  necessidades: {
    urgentes: Array<{ id: number; nome: string; categoria: string }>;
    bloqueados: Array<{ id: number; nome: string; categoria: string }>;
  };
  atualizadoEm: string;
  pix: { chave: string; titular: string | null } | null;
  rotas: {
    googleMaps: string;
    waze: string;
  };
  ocorrenciasAtivas: Array<{
    id: number;
    tipo: string;
    descricao: string | null;
    poligono?: Array<{ lat: number; lng: number }> | null;
    dataRegistro: string;
  }>;
}

type FiltroRapido = "TODOS" | "COM_VAGAS" | "INFRA_NORMAL" | "PRECISA_DOACOES" | "DESTAQUE";

const ROTULO_OCORRENCIA: Record<string, string> = {
  AREA_RISCO: "Área de risco demarcada no entorno",
  SEM_ENERGIA: "Queda de energia elétrica",
  SEM_AGUA: "Interrupção no abastecimento de água",
  SEM_COMUNICACAO: "Sem internet ou telefone",
  FALTA_ENERGIA: "Queda de energia elétrica",
  FALTA_AGUA: "Interrupção no abastecimento de água",
  VIA_BLOQUEADA: "Via de acesso interditada ou bloqueada",
  ALAGAMENTO: "Alagamento próximo ao abrigo",
  DESLIZAMENTO: "Risco de deslizamento de terra",
  RISCO_ESTRUTURAL: "Risco ou dano estrutural no local",
  ESTRUTURA_DANIFICADA: "Risco ou dano estrutural no local",
  OUTRO: "Alerta operacional no abrigo",
};

function obterEstiloNivel(nivel: NivelOcupacaoPublico) {
  if (nivel === "VERDE") {
    return {
      simbolo: "●",
      rotulo: "Livre",
      badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      barra: "bg-emerald-500",
    };
  }
  if (nivel === "AMARELO") {
    return {
      simbolo: "▲",
      rotulo: "Atenção",
      badge: "border-amber-500/40 bg-amber-500/15 text-amber-300",
      barra: "bg-amber-500",
    };
  }
  return {
    simbolo: "■",
    rotulo: "Lotado / Crítico",
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    barra: "bg-rose-500",
  };
}

function obterEstiloInfra(status: StatusInfraPublico) {
  if (status === "CRITICO") {
    return {
      icone: "🚨",
      rotulo: "Acesso ou Infraestrutura Crítica",
      classe: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    };
  }
  if (status === "ALERTA") {
    return {
      icone: "⚡",
      rotulo: "Atenção na Infraestrutura",
      classe: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    icone: "✅",
    rotulo: "Infraestrutura Normal",
    classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  };
}

function formatarHorario(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function calcularDistanciaKmHaversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function campoEmv(id: string, valor: string): string {
  const tam = String(valor.length).padStart(2, "0");
  return `${id}${tam}${valor}`;
}

/**
 * Gera payload estático oficial BR Code (BACEN EMVCo) com cálculo CRC16-CCITT (0x1021)
 */
function gerarPayloadPixBrCode(chave: string, titular: string | null): string {
  const nomeLimpo = (titular ?? "ABRIGO EMERGENCIAL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .slice(0, 25)
    .toUpperCase() || "ABRIGO EMERGENCIAL";

  const contaMerchant = campoEmv("00", "br.gov.bcb.pix") + campoEmv("01", chave.trim());
  const semCrc =
    campoEmv("00", "01") +
    campoEmv("26", contaMerchant) +
    campoEmv("52", "0000") +
    campoEmv("53", "986") +
    campoEmv("58", "BR") +
    campoEmv("59", nomeLimpo) +
    campoEmv("60", "PASSO FUNDO") +
    campoEmv("62", campoEmv("05", "***")) +
    "6304";

  let crc = 0xffff;
  for (let i = 0; i < semCrc.length; i++) {
    crc ^= semCrc.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, "0");
  return `${semCrc}${crcHex}`;
}

export default function PaginaMapaPublico() {
  const [abrigos, setAbrigos] = useState<AbrigoMapa[]>([]);
  const [alertas, setAlertas] = useState<AlertaMapa[]>([]);
  const [categorias, setCategorias] = useState<CategoriaPublica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros de busca e proximidade
  const [termoBusca, setTermoBusca] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("TODOS");
  const [categoriaSlug, setCategoriaSlug] = useState<string | null>(null);
  const [mostrarAlertasMapa, setMostrarAlertasMapa] = useState(true);
  const [mostrarListaFlutuante, setMostrarListaFlutuante] = useState(false);

  // Geolocalização do cidadão (PostGIS ST_Distance / ST_DWithin)
  const [posicaoUsuario, setPosicaoUsuario] = useState<{ lat: number; lng: number } | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [mensagemGps, setMensagemGps] = useState<string | null>(null);

  // Abrigo selecionado (abre a aba lateral estilo mobile)
  const [idSelecionado, setIdSelecionado] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const param = new URLSearchParams(window.location.search).get("abrigo");
    const num = param ? Number(param) : NaN;
    return Number.isInteger(num) && num > 0 ? num : null;
  });
  const [detalheSelecionado, setDetalheSelecionado] = useState<DetalheAbrigoPublico | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [focoTick, setFocoTick] = useState(0);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [brCodeCopiado, setBrCodeCopiado] = useState(false);
  const [mostrarQrPix, setMostrarQrPix] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Referência para scroll horizontal da barra de filtros rápidos
  const barraFiltrosRef = useRef<HTMLDivElement | null>(null);
  const [autoSelecionarGpsTick, setAutoSelecionarGpsTick] = useState(0);
  const ultimoGpsTickProcessadoRef = useRef(0);

  const carregarDadosPublicos = useCallback(
    async (
      coords: { lat: number; lng: number } | null,
      slugCategoria: string | null,
    ): Promise<AbrigoMapa[]> => {
      try {
        const params = new URLSearchParams();
        if (coords) {
          params.set("lat", String(coords.lat));
          params.set("lng", String(coords.lng));
        }
        if (slugCategoria) {
          params.set("necessidade", slugCategoria);
        }

        const urlAbrigos = `/api/public/abrigos${params.toString() ? `?${params.toString()}` : ""}`;
        const [respAbrigos, respAlertas, respCategorias] = await Promise.all([
          fetch(urlAbrigos, { cache: "no-store" }),
          fetch("/api/public/alertas", { cache: "no-store" }),
          fetch("/api/public/categorias", { cache: "no-store" }),
        ]);

        if (!respAbrigos.ok) {
          throw new Error("Não foi possível consultar os abrigos no momento.");
        }

        const jsonAbrigos = (await respAbrigos.json()) as { dados: AbrigoMapa[] };
        const listaNormalizada = (jsonAbrigos.dados ?? []).map((a) => ({
          ...a,
          distanciaKm:
            a.distanciaKm !== null && a.distanciaKm !== undefined
              ? Number(a.distanciaKm)
              : coords
                ? Number(
                    calcularDistanciaKmHaversine(
                      coords.lat,
                      coords.lng,
                      a.latitude,
                      a.longitude,
                    ).toFixed(2),
                  )
                : null,
        }));

        if (coords) {
          listaNormalizada.sort(
            (a, b) =>
              (a.distanciaKm ?? Number.POSITIVE_INFINITY) -
              (b.distanciaKm ?? Number.POSITIVE_INFINITY),
          );
        }

        setAbrigos(listaNormalizada);
        setErro(null);

        if (respAlertas.ok) {
          const jsonAlertas = (await respAlertas.json()) as { dados: AlertaMapa[] };
          setAlertas(jsonAlertas.dados ?? []);
        }

        if (respCategorias.ok) {
          const jsonCategorias = (await respCategorias.json()) as { dados: CategoriaPublica[] };
          setCategorias(jsonCategorias.dados ?? []);
        }

        return listaNormalizada;
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar o mapa de abrigos.");
        return [];
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(async () => {
      if (!ativo) return;
      await carregarDadosPublicos(posicaoUsuario, categoriaSlug);
    });

    // Atualização automática silenciosa a cada 30s quando a aba está visível
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void carregarDadosPublicos(posicaoUsuario, categoriaSlug);
      }
    }, 30000);

    return () => {
      ativo = false;
      window.clearInterval(intervalo);
    };
  }, [carregarDadosPublicos, posicaoUsuario, categoriaSlug]);

  // Busca detalhes completos do abrigo selecionado (rotas Google Maps/Waze, PIX e alertas)
  useEffect(() => {
    if (!idSelecionado) {
      return;
    }

    let cancelado = false;

    fetch(`/api/public/abrigos/${idSelecionado}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        const json = (await r.json()) as { dados: DetalheAbrigoPublico };
        return json.dados;
      })
      .then((dados) => {
        if (!cancelado && dados) {
          setDetalheSelecionado(dados);
        }
      })
      .catch(() => {
        // Mantém fallback com os dados já presentes no item da listagem
      })
      .finally(() => {
        if (!cancelado) setCarregandoDetalhe(false);
      });

    return () => {
      cancelado = true;
    };
  }, [idSelecionado]);

  // Fecha a aba lateral ao pressionar Escape
  useEffect(() => {
    function aoPressionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIdSelecionado(null);
        setDetalheSelecionado(null);
        setCarregandoDetalhe(false);
      }
    }
    window.addEventListener("keydown", aoPressionarTecla);
    return () => window.removeEventListener("keydown", aoPressionarTecla);
  }, []);

  // Filtragem local instantânea combinada com os filtros da API
  const abrigosFiltrados = useMemo(() => {
    const buscaNormalizada = termoBusca.trim().toLowerCase();

    return abrigos.filter((abrigo) => {
      if (buscaNormalizada) {
        const bateNome = abrigo.nome.toLowerCase().includes(buscaNormalizada);
        const bateEndereco = abrigo.endereco.toLowerCase().includes(buscaNormalizada);
        const bateItem = abrigo.necessidades.urgentes.some((i) =>
          i.nome.toLowerCase().includes(buscaNormalizada),
        );
        if (!bateNome && !bateEndereco && !bateItem) return false;
      }

      if (filtroRapido === "COM_VAGAS" && abrigo.ocupacao.vagasDisponiveis <= 0) {
        return false;
      }
      if (filtroRapido === "INFRA_NORMAL" && abrigo.statusInfraestrutura !== "NORMAL") {
        return false;
      }
      if (filtroRapido === "PRECISA_DOACOES" && abrigo.necessidades.urgentes.length === 0) {
        return false;
      }
      if (filtroRapido === "DESTAQUE" && !abrigo.destaque) {
        return false;
      }

      return true;
    });
  }, [abrigos, termoBusca, filtroRapido]);

  const resumoGeral = useMemo(() => {
    const totalAbrigos = abrigosFiltrados.length;
    const totalVagasLivres = abrigosFiltrados.reduce(
      (acc, a) => acc + Math.max(0, a.ocupacao.vagasDisponiveis),
      0,
    );
    return { totalAbrigos, totalVagasLivres };
  }, [abrigosFiltrados]);

  const indiceSelecionado = useMemo(
    () => abrigosFiltrados.findIndex((a) => a.id === idSelecionado),
    [abrigosFiltrados, idSelecionado],
  );

  const abrigoSelecionadoBase = useMemo(
    () => abrigos.find((a) => a.id === idSelecionado) ?? null,
    [abrigos, idSelecionado],
  );

  const selecionarAbrigo = useCallback((id: number) => {
    setIdSelecionado(id);
    setFocoTick((t) => t + 1);
    setDetalheSelecionado(null);
    setCarregandoDetalhe(true);
    setPixCopiado(false);
    setBrCodeCopiado(false);
    setLinkCopiado(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("abrigo", String(id));
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  function fecharDetalheAbrigo() {
    setIdSelecionado(null);
    setDetalheSelecionado(null);
    setCarregandoDetalhe(false);
    setPixCopiado(false);
    setLinkCopiado(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("abrigo");
      window.history.replaceState({}, "", url.toString());
    }
  }

  async function compartilharAbrigo(abrigo: AbrigoMapa) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.origin);
    url.searchParams.set("abrigo", String(abrigo.id));

    const urgentes =
      abrigo.necessidades.urgentes.length > 0
        ? `\n🚨 Doações urgentes: ${abrigo.necessidades.urgentes.map((i) => i.nome).join(", ")}`
        : "";

    const texto = `📍 *${abrigo.nome}*\n🏠 ${abrigo.endereco}\n🟢 Vagas livres: ${abrigo.ocupacao.vagasDisponiveis} (${abrigo.ocupacao.lotacaoAtual}/${abrigo.ocupacao.capacidadeMaxima})${urgentes}\n🔗 Mapa ao vivo: ${url.toString()}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `WhereToGo • ${abrigo.nome}`,
          text: texto,
          url: url.toString(),
        });
        return;
      } catch {
        // Fallback para área de transferência
      }
    }

    try {
      await navigator.clipboard.writeText(texto);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 3000);
    } catch {
      setLinkCopiado(false);
    }
  }

  function navegarAbrigoVizinho(direcao: -1 | 1) {
    if (abrigosFiltrados.length === 0) return;
    const atual = indiceSelecionado >= 0 ? indiceSelecionado : 0;
    const proximo = (atual + direcao + abrigosFiltrados.length) % abrigosFiltrados.length;
    const alvo = abrigosFiltrados[proximo];
    if (alvo) {
      selecionarAbrigo(alvo.id);
    }
  }

  // Auto-seleciona o 1º item da lista (abrigosFiltrados[0]) assim que o GPS conecta e ordena a lista
  useEffect(() => {
    if (
      autoSelecionarGpsTick === 0 ||
      autoSelecionarGpsTick === ultimoGpsTickProcessadoRef.current
    ) {
      return;
    }
    if (abrigosFiltrados.length === 0) return;

    const primeiroDaLista = abrigosFiltrados[0];
    if (!primeiroDaLista) return;

    ultimoGpsTickProcessadoRef.current = autoSelecionarGpsTick;
    void Promise.resolve().then(() => {
      selecionarAbrigo(primeiroDaLista.id);
      const sufixoKm =
        primeiroDaLista.distanciaKm !== null
          ? ` (${Number(primeiroDaLista.distanciaKm).toFixed(1)} km)`
          : "";
      setMensagemGps(`📍 Abrigo mais próximo selecionado: ${primeiroDaLista.nome}${sufixoKm}`);
    });
  }, [autoSelecionarGpsTick, abrigosFiltrados, selecionarAbrigo]);

  function ativarGeolocalizacao() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setMensagemGps("Seu navegador não suporta localização por GPS.");
      return;
    }

    setBuscandoGps(true);
    setMensagemGps(null);

    const aoConectarGps = async (pos: GeolocationPosition) => {
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      const listaAtualizada = await carregarDadosPublicos(coords, categoriaSlug);
      setPosicaoUsuario(coords);

      if (listaAtualizada.length > 0) {
        // Se algum filtro anterior deixaria a lista vazia, limpa para exibir os abrigos ordenados
        const buscaNormalizada = termoBusca.trim().toLowerCase();
        const filtradosAgora = listaAtualizada.filter((abrigo) => {
          if (buscaNormalizada) {
            const bateNome = abrigo.nome.toLowerCase().includes(buscaNormalizada);
            const bateEndereco = abrigo.endereco.toLowerCase().includes(buscaNormalizada);
            const bateItem = abrigo.necessidades.urgentes.some((i) =>
              i.nome.toLowerCase().includes(buscaNormalizada),
            );
            if (!bateNome && !bateEndereco && !bateItem) return false;
          }
          if (filtroRapido === "COM_VAGAS" && abrigo.ocupacao.vagasDisponiveis <= 0) return false;
          if (filtroRapido === "INFRA_NORMAL" && abrigo.statusInfraestrutura !== "NORMAL")
            return false;
          if (filtroRapido === "PRECISA_DOACOES" && abrigo.necessidades.urgentes.length === 0)
            return false;
          if (filtroRapido === "DESTAQUE" && !abrigo.destaque) return false;
          return true;
        });

        if (filtradosAgora.length === 0) {
          setTermoBusca("");
          setFiltroRapido("TODOS");
        }

        // Dispara o gatilho que auto-seleciona o 1º item da lista (abrigosFiltrados[0])
        setAutoSelecionarGpsTick((t) => t + 1);
      } else {
        setMensagemGps("Localização obtida, mas nenhum abrigo ativo foi encontrado.");
      }

      setBuscandoGps(false);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => void aoConectarGps(pos),
      () => {
        // Fallback sem alta precisão para computadores desktop (Wi-Fi / rede)
        navigator.geolocation.getCurrentPosition(
          (posFallback) => void aoConectarGps(posFallback),
          () => {
            setBuscandoGps(false);
            setMensagemGps("Permissão de localização negada ou indisponível no navegador.");
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  }

  function limparGeolocalizacao() {
    setPosicaoUsuario(null);
    setMensagemGps(null);
  }

  async function copiarChavePix(chave: string) {
    try {
      await navigator.clipboard.writeText(chave);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 3000);
    } catch {
      setPixCopiado(false);
    }
  }

  function rolarBarraFiltros(direcao: -1 | 1) {
    const el = barraFiltrosRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * 240, behavior: "smooth" });
  }

  const temFiltroAtivo =
    filtroRapido !== "TODOS" || categoriaSlug !== null || termoBusca.trim() !== "";

  return (
    <div className="h-dvh w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* Barra Superior Compacta (Fixa, zero scroll) */}
      <header className="z-30 shrink-0 border-b border-slate-800/90 bg-slate-950/95 px-3 sm:px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Identidade + Contador Ao Vivo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black text-base shadow-sm">
              W
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black tracking-tight text-white leading-none">
                  WhereToGo
                </h1>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300 tabular-nums">
                  ● {resumoGeral.totalVagasLivres} vagas livres
                </span>
              </div>
              <p className="hidden md:block text-[11px] text-slate-400 mt-0.5">
                Mapa em tempo real de abrigos e doações • Clique em um pino para abrir a ficha
              </p>
            </div>
          </div>

          {/* Campo de Busca Integrado no Topo (Enter seleciona o 1º abrigo encontrado) */}
          <div className="relative flex-1 max-w-md">
            <input
              type="search"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && abrigosFiltrados.length > 0) {
                  selecionarAbrigo(abrigosFiltrados[0].id);
                }
              }}
              placeholder="Buscar abrigo, bairro ou item para doar..."
              aria-label="Buscar abrigo ou item de doação"
              className="w-full h-9 rounded-xl border border-slate-700 bg-slate-900/90 px-3 text-base sm:text-xs text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => setTermoBusca("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Ações Rápidas: Lista Flutuante, GPS, Atualizar e Acesso Equipe */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMostrarListaFlutuante((v) => !v)}
              className={`h-9 rounded-xl border px-3 text-xs font-bold transition cursor-pointer tabular-nums ${
                mostrarListaFlutuante
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              📋 Abrigos ({abrigosFiltrados.length})
            </button>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={ativarGeolocalizacao}
                disabled={buscandoGps}
                className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-bold transition disabled:opacity-60 cursor-pointer ${
                  posicaoUsuario
                    ? "border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                }`}
              >
                {buscandoGps ? "Localizando..." : "📍 Perto de Mim"}
              </button>
              {posicaoUsuario && (
                <button
                  type="button"
                  onClick={limparGeolocalizacao}
                  title="Remover localização GPS"
                  className="inline-flex h-9 w-7 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => void carregarDadosPublicos(posicaoUsuario, categoriaSlug)}
              title="Atualizar dados do mapa agora"
              className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              ↻
            </button>

            <Link
              href="/admin/dashboard"
              prefetch={false}
              className="hidden xl:inline-flex h-9 items-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Painel Operacional
            </Link>

            <Link
              href="/login"
              prefetch={false}
              className="inline-flex h-9 items-center rounded-xl bg-amber-500 px-3.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              Acesso Equipe →
            </Link>
          </div>
        </div>
      </header>

      {/* Área Principal: Mapa 100% da Tela + Overlays Flutuantes */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {/* Mapa Interativo em Tela Cheia */}
        <MapaPublicoLeaflet
          abrigos={abrigosFiltrados}
          alertas={alertas}
          mostrarAlertas={mostrarAlertasMapa}
          idSelecionado={idSelecionado}
          focoTick={focoTick}
          posicaoUsuario={posicaoUsuario}
          aoSelecionarAbrigo={selecionarAbrigo}
        />

        {/* Pílulas de Filtro Rápido Flutuando no Topo do Mapa com Scroll Horizontal Habilitado */}
        <div
          className={`pointer-events-none absolute top-3 left-3 z-[400] flex flex-col gap-1.5 transition-all ${
            abrigoSelecionadoBase ? "right-3 sm:right-[410px] md:right-[430px]" : "right-3"
          }`}
        >
          <div className="pointer-events-auto flex w-full max-w-full items-center gap-1 rounded-2xl border border-slate-800/90 bg-slate-950/90 px-1.5 py-1 shadow-lg backdrop-blur-md">
            {/* Botão de rolagem para a esquerda */}
            <button
              type="button"
              onClick={() => rolarBarraFiltros(-1)}
              aria-label="Rolar filtros para a esquerda"
              className="hidden sm:inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-lg text-sm font-black text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              ‹
            </button>

            {/* Container com Scroll Horizontal (suporta toque, barra de rolagem e roda do mouse) */}
            <div
              ref={barraFiltrosRef}
              onWheel={(e) => {
                if (barraFiltrosRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  barraFiltrosRef.current.scrollLeft += e.deltaY;
                }
              }}
              className="barra-filtros-scroll flex flex-1 min-w-0 items-center gap-1.5 px-1 py-0.5"
            >
              {(
                [
                  { id: "TODOS", rotulo: "Todos" },
                  { id: "COM_VAGAS", rotulo: "🟢 Com Vagas" },
                  { id: "PRECISA_DOACOES", rotulo: "🚨 Precisa de Doações" },
                  { id: "INFRA_NORMAL", rotulo: "🛣️ Acesso Normal" },
                  { id: "DESTAQUE", rotulo: "⭐ Prioritários" },
                ] as const
              ).map((pilula) => {
                const ativo = filtroRapido === pilula.id;
                return (
                  <button
                    key={pilula.id}
                    type="button"
                    onClick={() => setFiltroRapido(pilula.id)}
                    className={`h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-[11px] font-bold transition cursor-pointer ${
                      ativo
                        ? "bg-amber-500 text-slate-950 shadow-sm"
                        : "text-slate-300 hover:bg-slate-800/90"
                    }`}
                  >
                    {pilula.rotulo}
                  </button>
                );
              })}

              <span className="h-4 w-px shrink-0 bg-slate-800 mx-0.5" />

              {categorias.map((cat) => {
                const ativo = categoriaSlug === cat.slug;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoriaSlug(ativo ? null : cat.slug)}
                    className={`h-7 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold transition cursor-pointer ${
                      ativo
                        ? "bg-sky-400 text-slate-950 font-bold"
                        : "border border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    📦 {cat.nome}
                  </button>
                );
              })}

              <span className="h-4 w-px shrink-0 bg-slate-800 mx-0.5" />

              <button
                type="button"
                onClick={() => setMostrarAlertasMapa((v) => !v)}
                className={`h-7 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11px] font-bold transition cursor-pointer ${
                  mostrarAlertasMapa
                    ? "border border-rose-500/40 bg-rose-500/20 text-rose-300"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400"
                }`}
              >
                🚧 Alertas ({alertas.length})
              </button>

              {temFiltroAtivo && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroRapido("TODOS");
                    setCategoriaSlug(null);
                    setTermoBusca("");
                  }}
                  className="h-7 shrink-0 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                >
                  ✕ Limpar filtros
                </button>
              )}
            </div>

            {/* Botão de rolagem para a direita */}
            <button
              type="button"
              onClick={() => rolarBarraFiltros(1)}
              aria-label="Rolar filtros para a direita"
              className="hidden sm:inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-lg text-sm font-black text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              ›
            </button>
          </div>

          {/* Avisos flutuantes de GPS ou Erro */}
          {mensagemGps && (
            <div className="pointer-events-auto flex w-fit items-center gap-3 rounded-xl border border-sky-500/40 bg-slate-950/90 px-3 py-1.5 text-xs text-sky-200 shadow-lg backdrop-blur">
              <span>{mensagemGps}</span>
              <button
                type="button"
                onClick={() => setMensagemGps(null)}
                className="font-bold text-sky-300 hover:underline cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {erro && (
            <div className="pointer-events-auto flex w-fit items-center gap-3 rounded-xl border border-rose-500/40 bg-slate-950/90 px-3 py-1.5 text-xs text-rose-200 shadow-lg backdrop-blur">
              <span>{erro}</span>
            </div>
          )}
        </div>

        {/* Gaveta Flutuante Esquerda Opcional: Lista Rápida de Abrigos */}
        {mostrarListaFlutuante && (
          <aside
            aria-label="Lista rápida de abrigos"
            className="pointer-events-auto absolute top-16 bottom-14 left-3 z-[450] flex w-[calc(100%-1.5rem)] sm:w-80 flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/95 shadow-2xl backdrop-blur-xl select-text"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Abrigos na Região ({abrigosFiltrados.length})
                </h2>
                <p className="text-[11px] text-slate-400">
                  Toque em um local para abrir os detalhes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarListaFlutuante(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {carregando && abrigosFiltrados.length === 0 ? (
                <p className="p-4 text-xs text-slate-400 text-center">Carregando abrigos...</p>
              ) : abrigosFiltrados.length === 0 ? (
                <div className="p-4 text-center space-y-2">
                  <p className="text-xs font-semibold text-slate-300">
                    Nenhum abrigo encontrado para este filtro.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTermoBusca("");
                      setFiltroRapido("TODOS");
                      setCategoriaSlug(null);
                    }}
                    className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                abrigosFiltrados.map((abrigo) => {
                  const selecionado = abrigo.id === idSelecionado;
                  const estiloNivel = obterEstiloNivel(abrigo.ocupacao.nivel);
                  return (
                    <button
                      key={abrigo.id}
                      type="button"
                      onClick={() => {
                        selecionarAbrigo(abrigo.id);
                        if (window.innerWidth < 640) {
                          setMostrarListaFlutuante(false);
                        }
                      }}
                      className={`w-full text-left rounded-2xl border p-3 transition cursor-pointer ${
                        selecionado
                          ? "border-amber-500 bg-slate-900 ring-1 ring-amber-500/40"
                          : "border-slate-800/90 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-white line-clamp-1">
                          {abrigo.nome}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${estiloNivel.badge}`}
                        >
                          {estiloNivel.simbolo}{" "}
                          {abrigo.ocupacao.vagasDisponiveis > 0
                            ? `${abrigo.ocupacao.vagasDisponiveis} vagas`
                            : "Lotado"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">
                        {abrigo.endereco}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* ABA LATERAL DETALHADA DO ABRIGO SELECIONADO (ESTILO MOBILE SHEET / CARD) */}
        {abrigoSelecionadoBase && (
          <aside
            role="dialog"
            aria-label={`Detalhes do abrigo ${abrigoSelecionadoBase.nome}`}
            aria-live="polite"
            className="pointer-events-auto absolute top-3 bottom-3 right-3 z-[500] flex w-[calc(100%-1.5rem)] sm:w-[390px] md:w-[410px] flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-slate-950/95 shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl select-text"
          >
            {/* Alça superior estilo Mobile Sheet */}
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <span className="h-1.5 w-11 rounded-full bg-slate-700/80" />
            </div>

            {/* Cabeçalho Fixo da Aba Mobile */}
            <div className="shrink-0 border-b border-slate-800/90 px-4 pb-3 pt-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const estilo = obterEstiloNivel(abrigoSelecionadoBase.ocupacao.nivel);
                    return (
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${estilo.badge}`}
                      >
                        {estilo.simbolo}{" "}
                        {abrigoSelecionadoBase.ocupacao.vagasDisponiveis > 0
                          ? `${abrigoSelecionadoBase.ocupacao.vagasDisponiveis} vagas livres`
                          : "Abrigo Lotado"}
                      </span>
                    );
                  })()}

                  {abrigoSelecionadoBase.destaque && (
                    <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                      ⭐ Prioritário
                    </span>
                  )}

                  {abrigoSelecionadoBase.distanciaKm !== null && (
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-sky-300 tabular-nums">
                      📍 {abrigoSelecionadoBase.distanciaKm.toFixed(1)} km
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={fecharDetalheAbrigo}
                  aria-label="Fechar aba lateral do abrigo"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <h2 className="mt-2 text-lg font-black leading-snug text-white">
                {abrigoSelecionadoBase.nome}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{abrigoSelecionadoBase.endereco}</p>

              {/* Botões Principais de Ação Mobile (Google Maps / Waze / Telefone) */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={
                    detalheSelecionado?.rotas.googleMaps ??
                    `https://www.google.com/maps/dir/?api=1&destination=${abrigoSelecionadoBase.latitude},${abrigoSelecionadoBase.longitude}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-400 transition shadow-sm"
                >
                  🗺️ Google Maps
                </a>
                <a
                  href={
                    detalheSelecionado?.rotas.waze ??
                    `https://waze.com/ul?ll=${abrigoSelecionadoBase.latitude},${abrigoSelecionadoBase.longitude}&navigate=yes`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-slate-800 transition"
                >
                  🚗 Ir com Waze
                </a>
              </div>

              {abrigoSelecionadoBase.telefone && (
                <a
                  href={`tel:${abrigoSelecionadoBase.telefone.replace(/\D/g, "")}`}
                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
                >
                  📞 Ligar para o abrigo: {abrigoSelecionadoBase.telefone}
                </a>
              )}

              {/* Compartilhamento Rápido (Link Direto / WhatsApp) */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void compartilharAbrigo(abrigoSelecionadoBase)}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  {linkCopiado ? "✅ Resumo Copiado!" : "📤 Copiar / Compartilhar"}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `📍 *${abrigoSelecionadoBase.nome}*\n🏠 ${abrigoSelecionadoBase.endereco}\n🟢 Vagas livres: ${abrigoSelecionadoBase.ocupacao.vagasDisponiveis} (${abrigoSelecionadoBase.ocupacao.lotacaoAtual}/${abrigoSelecionadoBase.ocupacao.capacidadeMaxima})${
                      abrigoSelecionadoBase.necessidades.urgentes.length > 0
                        ? `\n🚨 Precisa de: ${abrigoSelecionadoBase.necessidades.urgentes.map((i) => i.nome).join(", ")}`
                        : ""
                    }`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
                >
                  💬 Enviar no WhatsApp
                </a>
              </div>
            </div>

            {/* Corpo Rolável Interno da Aba Mobile */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {/* 1. Card de Lotação e Capacidade */}
              {(() => {
                const estiloNivel = obterEstiloNivel(abrigoSelecionadoBase.ocupacao.nivel);
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Lotação em Tempo Real
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        Atualizado às {formatarHorario(abrigoSelecionadoBase.atualizadoEm)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between tabular-nums">
                      <div>
                        <span className="text-2xl font-black text-white">
                          {abrigoSelecionadoBase.ocupacao.lotacaoAtual}
                        </span>
                        <span className="text-xs text-slate-400">
                          {" "}
                          / {abrigoSelecionadoBase.ocupacao.capacidadeMaxima} acolhidos
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-slate-200">
                        {abrigoSelecionadoBase.ocupacao.percentual}% ocupado
                      </span>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full transition-all ${estiloNivel.barra}`}
                        style={{
                          width: `${Math.min(100, abrigoSelecionadoBase.ocupacao.percentual)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* 2. Card de Condições de Acesso e Infraestrutura */}
              {(() => {
                const estiloInfra = obterEstiloInfra(abrigoSelecionadoBase.statusInfraestrutura);
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Acesso e Infraestrutura
                      </span>
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${estiloInfra.classe}`}
                      >
                        {estiloInfra.icone} {estiloInfra.rotulo}
                      </span>
                    </div>

                    {detalheSelecionado?.ocorrenciasAtivas &&
                    detalheSelecionado.ocorrenciasAtivas.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {detalheSelecionado.ocorrenciasAtivas.map((oc) => (
                          <div
                            key={oc.id}
                            className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <p className="font-bold">
                                {oc.tipo === "AREA_RISCO" ? "🔺" : "⚠️"} {ROTULO_OCORRENCIA[oc.tipo] ?? oc.tipo}
                              </p>
                              {oc.poligono && oc.poligono.length >= 3 && (
                                <span className="rounded-full border border-rose-400/50 bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                                  {oc.poligono.length} pontos no mapa
                                </span>
                              )}
                            </div>
                            {oc.descricao && (
                              <p className="text-[11px] text-rose-300/90 mt-0.5">{oc.descricao}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300">
                        Nenhuma interdição de via ou falha elétrica/hídrica ativa neste abrigo.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* 3. Card de Suprimentos: O que doar agora vs Estoque Cheio */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Suprimentos para Doação
                </span>

                {abrigoSelecionadoBase.necessidades.urgentes.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-rose-300">
                      🚨 Precisa com urgência:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {abrigoSelecionadoBase.necessidades.urgentes.map((item) => (
                        <span
                          key={item.id}
                          className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-200"
                        >
                          {item.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Nenhum item em falta crítica reportado neste momento.
                  </p>
                )}

                {abrigoSelecionadoBase.necessidades.bloqueados.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <p className="text-xs font-bold text-amber-300">
                      🛑 Estoque cheio (evite enviar agora):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {abrigoSelecionadoBase.necessidades.bloqueados.map((item) => (
                        <span
                          key={item.id}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400 line-through"
                        >
                          {item.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Card de Doação Oficial via PIX */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Doação Financeira Oficial (PIX)
                  </span>
                  {detalheSelecionado?.pix && (
                    <button
                      type="button"
                      onClick={() => setMostrarQrPix((v) => !v)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-slate-800 cursor-pointer"
                    >
                      {mostrarQrPix ? "Ocultar QR / BR Code" : "📱 Ver QR / Copia e Cola"}
                    </button>
                  )}
                </div>

                {carregandoDetalhe ? (
                  <p className="text-xs text-slate-400">Consultando chave PIX verificada...</p>
                ) : detalheSelecionado?.pix ? (
                  <>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 break-all">
                      {detalheSelecionado.pix.chave}
                    </div>
                    {detalheSelecionado.pix.titular && (
                      <p className="text-[11px] text-slate-400">
                        Titular oficial:{" "}
                        <strong className="text-slate-200">
                          {detalheSelecionado.pix.titular}
                        </strong>
                      </p>
                    )}

                    {mostrarQrPix && (() => {
                      const payloadBrCode = gerarPayloadPixBrCode(
                        detalheSelecionado.pix.chave,
                        detalheSelecionado.pix.titular,
                      );
                      return (
                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(payloadBrCode)}`}
                            alt="QR Code PIX Oficial do Abrigo"
                            width={148}
                            height={148}
                            className="mx-auto rounded-xl border border-slate-700 bg-white p-1"
                          />
                          <p className="text-[10px] text-slate-400">
                            Escaneie no aplicativo do seu banco ou copie o código BR Code (BACEN) abaixo:
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(payloadBrCode);
                                setBrCodeCopiado(true);
                                setTimeout(() => setBrCodeCopiado(false), 3000);
                              } catch {
                                setBrCodeCopiado(false);
                              }
                            }}
                            className="min-h-9 w-full rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                          >
                            {brCodeCopiado
                              ? "✅ Código PIX Copia e Cola Copiado!"
                              : "📲 Copiar Código PIX Copia e Cola (BR Code)"}
                          </button>
                        </div>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => void copiarChavePix(detalheSelecionado.pix!.chave)}
                      className="min-h-10 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer"
                    >
                      {pixCopiado ? "✅ Chave PIX Copiada!" : "📋 Copiar Chave PIX Oficial"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    Este abrigo recebe apenas doações presenciais de suprimentos no momento.
                  </p>
                )}
              </div>
            </div>

            {/* Rodapé da Aba Lateral: Navegação Rápida entre Abrigos do Mapa */}
            {abrigosFiltrados.length > 1 && (
              <div className="shrink-0 flex items-center justify-between border-t border-slate-800/90 bg-slate-950 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => navegarAbrigoVizinho(-1)}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  ← Anterior
                </button>
                <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                  Abrigo {indiceSelecionado + 1} de {abrigosFiltrados.length}
                </span>
                <button
                  type="button"
                  onClick={() => navegarAbrigoVizinho(1)}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  Próximo →
                </button>
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
