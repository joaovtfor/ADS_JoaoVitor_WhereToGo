"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { CartaoPix } from "./cartao-pix";
import {
  formatarHorario,
  obterEstiloInfra,
  obterEstiloNivel,
  obterSeloAtualizacao,
  resumoParaCompartilhar,
  ROTULO_OCORRENCIA,
  type AbrigoMapa,
  type DetalheAbrigoPublico,
} from "./tipos";

interface PropriedadesFichaAbrigo {
  abrigo: AbrigoMapa;
  categoriaSlug: string | null;
  itemFiltroId: number | null;
  posicaoNaLista: { indice: number; total: number };
  onNavegar: (direcao: -1 | 1) => void;
  onFechar: () => void;
}

type NivelFolhaMobile = "compacto" | "medio" | "expandido";

const ALTURA_NIVEL_VH: Record<NivelFolhaMobile, number> = {
  compacto: 34,
  medio: 62,
  expandido: 100,
};

/** Detalhes do card (rotas, PIX, ocorrências): carregados ao abrir, com cancelamento ao trocar de abrigo. */
function useDetalheAbrigo(id: number) {
  const [resultado, setResultado] = useState<{ id: number; dados: DetalheAbrigoPublico | null } | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    fetch(`/api/public/abrigos/${id}`, { signal: controlador.signal })
      .then(async (resposta) => (resposta.ok ? ((await resposta.json()) as { dados: DetalheAbrigoPublico }).dados : null))
      .then((dados) => setResultado({ id, dados }))
      .catch(() => {
        // Sem rede: a ficha segue com os dados da listagem (rotas montadas abaixo).
        if (!controlador.signal.aborted) setResultado({ id, dados: null });
      });
    return () => controlador.abort();
  }, [id]);

  const doAbrigoAtual = resultado?.id === id ? resultado : null;
  return { detalhe: doAbrigoAtual?.dados ?? null, carregando: doAbrigoAtual === null };
}

async function compartilhar(abrigo: AbrigoMapa): Promise<boolean> {
  const url = new URL(window.location.origin);
  url.searchParams.set("abrigo", String(abrigo.id));
  const texto = resumoParaCompartilhar(abrigo, url.toString());

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `WhereToGo • ${abrigo.nome}`, text: texto, url: url.toString() });
      return false;
    } catch {
      // Compartilhamento cancelado ou indisponível: copia o resumo.
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Aba lateral (desktop) / folha inferior arrastável (mobile bottom-sheet) com os detalhes do abrigo selecionado. */
export function FichaAbrigo({ abrigo, categoriaSlug, itemFiltroId, posicaoNaLista, onNavegar, onFechar }: PropriedadesFichaAbrigo) {
  const { detalhe, carregando } = useDetalheAbrigo(abrigo.id);
  const [resumoCopiado, setResumoCopiado] = useState(false);
  const [nivelMobile, setNivelMobile] = useState<NivelFolhaMobile>("medio");
  const [deltaArrasteY, setDeltaArrasteY] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const toqueInicialYRef = useRef<number | null>(null);
  const moveuArrasteRef = useRef(false);

  const estiloNivel = obterEstiloNivel(abrigo.ocupacao.nivel);
  const estiloInfra = obterEstiloInfra(abrigo.statusInfraestrutura);
  const seloAtualizacao = obterSeloAtualizacao(abrigo.atualizadoEm);
  const { ocupacao } = abrigo;

  const rotas = detalhe?.rotas ?? {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${abrigo.latitude},${abrigo.longitude}`,
    waze: `https://waze.com/ul?ll=${abrigo.latitude},${abrigo.longitude}&navigate=yes`,
  };

  useEffect(() => {
    if (!resumoCopiado) return;
    const temporizador = window.setTimeout(() => setResumoCopiado(false), 3000);
    return () => window.clearTimeout(temporizador);
  }, [resumoCopiado]);

  function iniciarArraste(e: TouchEvent<HTMLElement>) {
    if (e.touches.length !== 1) return;
    toqueInicialYRef.current = e.touches[0].clientY;
    moveuArrasteRef.current = false;
    setArrastando(true);
    setDeltaArrasteY(0);
  }

  function moverArraste(e: TouchEvent<HTMLElement>) {
    if (toqueInicialYRef.current === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - toqueInicialYRef.current;
    if (Math.abs(dy) > 6) {
      moveuArrasteRef.current = true;
    }
    setDeltaArrasteY(dy);
  }

  function finalizarArraste() {
    if (toqueInicialYRef.current === null) return;
    const dy = deltaArrasteY;
    toqueInicialYRef.current = null;
    setArrastando(false);
    setDeltaArrasteY(0);

    // Puxou para cima: expande (compacto -> medio -> expandido 100%)
    if (dy < -35) {
      if (dy < -120 || nivelMobile === "medio") {
        setNivelMobile("expandido");
      } else {
        setNivelMobile("medio");
      }
      return;
    }

    // Puxou para baixo: reduz (expandido -> medio -> compacto -> fechar)
    if (dy > 35) {
      if (nivelMobile === "expandido") {
        setNivelMobile(dy > 160 ? "compacto" : "medio");
      } else if (nivelMobile === "medio") {
        if (dy > 150) onFechar();
        else setNivelMobile("compacto");
      } else {
        onFechar();
      }
    }
  }

  function alternarExpansaoToque() {
    if (moveuArrasteRef.current) return;
    setNivelMobile((atual) => (atual === "expandido" ? "medio" : "expandido"));
  }

  // Altura no mobile (% da área útil do mapa) com feedback em tempo real durante o arraste
  const alturaBasePct = ALTURA_NIVEL_VH[nivelMobile];
  const classeAlturaMobile =
    nivelMobile === "expandido"
      ? "h-full max-h-full rounded-t-none"
      : nivelMobile === "compacto"
        ? "h-[34%] max-h-[34%] rounded-t-3xl"
        : "h-[62%] max-h-[62%] rounded-t-3xl";

  const estiloArrasteMobile =
    arrastando && deltaArrasteY !== 0
      ? {
          height: `clamp(24%, calc(${alturaBasePct}% - ${Math.round(deltaArrasteY)}px), 100%)`,
          maxHeight: "100%",
        }
      : undefined;

  return (
    <aside
      role="dialog"
      aria-label={`Detalhes do abrigo ${abrigo.nome}`}
      style={estiloArrasteMobile}
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-[500] flex flex-col overflow-hidden border border-slate-700/90 bg-slate-950/95 shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl ${
        arrastando ? "" : "transition-[height,max-height,border-radius] duration-200 ease-out"
      } ${classeAlturaMobile} sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-3 sm:h-auto sm:max-h-none sm:w-[400px] sm:rounded-3xl md:w-[420px]`}
    >
      {/* Topo compacto fixo + Alça de Puxar Mobile (Drag Handle) */}
      <div
        onTouchStart={iniciarArraste}
        onTouchMove={moverArraste}
        onTouchEnd={finalizarArraste}
        onTouchCancel={finalizarArraste}
        className="shrink-0 touch-none select-none border-b border-slate-800/90 bg-slate-950/95 px-4 pt-2 pb-2.5"
      >
        {/* Barra de puxar (mobile) */}
        <button
          type="button"
          onClick={alternarExpansaoToque}
          aria-label={nivelMobile === "expandido" ? "Reduzir painel para metade da tela" : "Expandir painel para tela cheia"}
          className="flex w-full flex-col items-center justify-center pb-1.5 sm:hidden"
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-600" />
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-slate-400">
            {nivelMobile === "expandido"
              ? "⬇ Puxe para baixo ou toque para ver o mapa"
              : "⬆ Puxe para cima ou toque para tela cheia"}
          </span>
        </button>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${estiloNivel.badge}`}>
                {estiloNivel.simbolo}{" "}
                {ocupacao.vagasDisponiveis > 0 ? `${ocupacao.vagasDisponiveis} vagas livres` : "Abrigo lotado"}
              </span>
              {abrigo.distanciaKm !== null && (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-xs font-bold text-sky-300 tabular-nums">
                  📍 {abrigo.distanciaKm.toFixed(1)} km
                </span>
              )}
              {abrigo.destaque && (
                <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-300">
                  ⭐ Precisa de doação
                </span>
              )}
            </div>
            <h2 className="mt-1.5 truncate text-base font-bold leading-snug text-white sm:text-lg">{abrigo.nome}</h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setNivelMobile((atual) => (atual === "expandido" ? "medio" : "expandido"))}
              aria-label={nivelMobile === "expandido" ? "Restaurar tamanho do painel" : "Expandir para tela cheia"}
              className="flex h-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-amber-300 hover:bg-slate-800 sm:hidden"
            >
              {nivelMobile === "expandido" ? "⬇ Mapa" : "⬆ Expandir"}
            </button>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar detalhes do abrigo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Corpo único 100% rolável: endereço, rotas, alertas, lotação, suprimentos e PIX rolam juntos */}
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-4">
        {/* Bloco inicial de endereço, perfil e ações rápidas de navegação/contato */}
        <div className="space-y-2.5">
          <p className="text-xs sm:text-sm text-slate-300">{abrigo.endereco}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${seloAtualizacao.classe}`}>
              {seloAtualizacao.icone} {seloAtualizacao.rotulo}
            </span>
            {abrigo.aceitaPets && (
              <span className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-2.5 py-0.5 text-xs font-bold text-teal-200">
                🐾 Aceita pets
              </span>
            )}
            {abrigo.acessivelPcd && (
              <span className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-bold text-indigo-200">
                ♿ Acessível PCD
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <a
              href={rotas.googleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-amber-500 px-3 text-xs sm:text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400"
            >
              🗺️ Google Maps
            </a>
            <a
              href={rotas.waze}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900 px-3 text-xs sm:text-sm font-bold text-slate-100 transition hover:bg-slate-800"
            >
              🚗 Ir com Waze
            </a>
          </div>

          {abrigo.rotaCruzaAreaRisco && (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/60 bg-rose-950/70 px-3 py-2 text-xs font-semibold text-rose-100"
            >
              🔺 <strong>Rota cruza Área de Risco (PostGIS):</strong> o trajeto direto da sua localização até este abrigo atravessa um perímetro de risco demarcado. Redobre a atenção e siga desvios seguros.
            </p>
          )}

          {(abrigo.statusInfraestrutura !== "NORMAL" || abrigo.emAreaDeRisco) && (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200"
            >
              ⚠️ <strong>Atenção no deslocamento:</strong>{" "}
              {abrigo.emAreaDeRisco
                ? "o abrigo fica dentro de uma área de risco demarcada."
                : "há alerta de acesso ou infraestrutura neste abrigo."}{" "}
              Confira os detalhes abaixo antes de sair.
            </p>
          )}

          {abrigo.telefone && (
            <a
              href={`tel:${abrigo.telefone.replace(/\D/g, "")}`}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-xs sm:text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              📞 Ligar para o abrigo: {abrigo.telefone}
            </a>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void compartilhar(abrigo).then(setResumoCopiado)}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              {resumoCopiado ? "✅ Resumo copiado!" : "📤 Compartilhar"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(resumoParaCompartilhar(abrigo))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-2.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
            >
              💬 WhatsApp
            </a>
          </div>
        </div>

        {/* Lotação agora */}
        <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Lotação agora</h3>
            <span className="text-xs text-slate-400 tabular-nums">Atualizado às {formatarHorario(abrigo.atualizadoEm)}</span>
          </div>
          <div className="flex items-baseline justify-between tabular-nums">
            <p>
              <span className="text-2xl font-extrabold text-white">{ocupacao.lotacaoAtual}</span>
              <span className="text-sm text-slate-400"> / {ocupacao.capacidadeMaxima} acolhidos</span>
            </p>
            <span className="text-sm font-bold text-slate-200">{ocupacao.percentual}% ocupado</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full transition-all ${estiloNivel.barra}`} style={{ width: `${Math.min(100, ocupacao.percentual)}%` }} />
          </div>
        </section>

        {/* Acesso e infraestrutura */}
        <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Acesso e infraestrutura</h3>
            <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${estiloInfra.classe}`}>
              {estiloInfra.icone} {estiloInfra.rotulo}
            </span>
          </div>
          {detalhe && detalhe.ocorrenciasAtivas.length > 0 ? (
            <ul className="space-y-1.5 pt-1">
              {detalhe.ocorrenciasAtivas.map((oc) => (
                <li key={oc.id} className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  <p className="font-bold">
                    {oc.tipo === "AREA_RISCO" ? "🔺" : "⚠️"} {ROTULO_OCORRENCIA[oc.tipo] ?? oc.tipo}
                  </p>
                  {oc.descricao && <p className="mt-0.5 text-xs text-rose-300/90">{oc.descricao}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-300">
              {carregando && abrigo.ocorrenciasAtivas.length > 0
                ? "Carregando ocorrências..."
                : "Nenhuma interdição de via ou falta de energia/água neste abrigo."}
            </p>
          )}
        </section>

        {/* Doação de suprimentos */}
        <section className="space-y-2.5 rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Doação de suprimentos</h3>
          {abrigo.necessidades.urgentes.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-rose-300">🚨 Precisa com urgência:</p>
              <ul className="flex flex-wrap gap-1.5">
                {abrigo.necessidades.urgentes.map((item) => {
                  const bateFiltro =
                    (categoriaSlug !== null && item.categoria === categoriaSlug) || (itemFiltroId !== null && item.id === itemFiltroId);
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border px-2.5 py-1 text-sm font-bold ${
                        bateFiltro
                          ? "border-sky-400 bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50"
                          : "border-rose-500/40 bg-rose-500/15 text-rose-200"
                      }`}
                    >
                      {bateFiltro ? "⭐ " : ""}
                      {item.nome}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhum item em falta no momento.</p>
          )}

          {abrigo.necessidades.bloqueados.length > 0 && (
            <div className="space-y-1.5 border-t border-slate-800 pt-2">
              <p className="text-sm font-bold text-amber-300">🛑 Estoque cheio (evite enviar agora):</p>
              <ul className="flex flex-wrap gap-1.5">
                {abrigo.necessidades.bloqueados.map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-400 line-through">
                    {item.nome}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* PIX */}
        <CartaoPix pix={detalhe?.pix ?? null} carregando={carregando} />
      </div>

      {posicaoNaLista.total > 1 && (
        <nav
          aria-label="Navegar entre abrigos"
          className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-800/90 bg-slate-950 px-4 py-2"
        >
          <button
            type="button"
            onClick={() => onNavegar(-1)}
            className="min-h-10 rounded-xl border border-slate-800 bg-slate-900 px-3.5 text-xs sm:text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            ← Anterior
          </button>
          <span className="text-xs font-bold text-slate-400 tabular-nums">
            {posicaoNaLista.indice + 1} de {posicaoNaLista.total}
          </span>
          <button
            type="button"
            onClick={() => onNavegar(1)}
            className="min-h-10 rounded-xl border border-slate-800 bg-slate-900 px-3.5 text-xs sm:text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Próximo →
          </button>
        </nav>
      )}
    </aside>
  );
}
