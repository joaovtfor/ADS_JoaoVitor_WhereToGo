"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { obterEstiloNivel, obterSeloAtualizacao, type AbrigoMapa, type AlertaMapa } from "./tipos";

function Gaveta({
  titulo,
  subtitulo,
  cor,
  onFechar,
  children,
}: {
  titulo: string;
  subtitulo: string;
  cor: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  const [expandidoMobile, setExpandidoMobile] = useState(false);
  const [deslocamentoArrasteY, setDeslocamentoArrasteY] = useState(0);
  const inicioToqueYRef = useRef<number | null>(null);

  const iniciarArraste = (clientY: number) => {
    inicioToqueYRef.current = clientY;
    setDeslocamentoArrasteY(0);
  };

  const moverArraste = (clientY: number) => {
    if (inicioToqueYRef.current === null) return;
    setDeslocamentoArrasteY(clientY - inicioToqueYRef.current);
  };

  const finalizarArraste = () => {
    if (inicioToqueYRef.current === null) return;
    const deltaY = deslocamentoArrasteY;
    inicioToqueYRef.current = null;
    setDeslocamentoArrasteY(0);

    if (deltaY < -35) {
      setExpandidoMobile(true);
    } else if (deltaY > 45) {
      if (expandidoMobile) {
        setExpandidoMobile(false);
      } else {
        onFechar();
      }
    }
  };

  const classeAlturaMobile = expandidoMobile
    ? "inset-x-0 bottom-0 h-[100%] max-h-[100%] rounded-none border-x-0 border-b-0"
    : "inset-x-2 bottom-2 h-[65%] max-h-[65%] rounded-3xl";

  return (
    <aside
      aria-label={titulo}
      style={
        deslocamentoArrasteY !== 0
          ? { transform: `translateY(${Math.max(-90, Math.min(180, deslocamentoArrasteY))}px)` }
          : undefined
      }
      className={`pointer-events-auto absolute z-[450] flex flex-col overflow-hidden border bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-[height,max-height,bottom,border-radius] duration-200 ease-out ${classeAlturaMobile} sm:inset-auto sm:top-24 sm:bottom-16 sm:left-3 sm:h-auto sm:max-h-none sm:w-96 sm:rounded-3xl sm:border ${cor}`}
    >
      {/* Alça de puxar exclusiva para Mobile */}
      <div
        role="button"
        tabIndex={0}
        aria-label={expandidoMobile ? "Reduzir painel para ver o mapa" : "Puxar ou tocar para expandir painel em tela cheia"}
        onClick={() => setExpandidoMobile((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpandidoMobile((v) => !v);
          }
        }}
        onTouchStart={(e) => iniciarArraste(e.touches[0].clientY)}
        onTouchMove={(e) => moverArraste(e.touches[0].clientY)}
        onTouchEnd={finalizarArraste}
        className="flex shrink-0 cursor-grab touch-none flex-col items-center justify-center pt-2 pb-1 select-none active:cursor-grabbing sm:hidden"
      >
        <div className="h-1.5 w-12 rounded-full bg-slate-600/90" />
        <span className="mt-1 text-[10px] font-semibold tracking-wide text-slate-400">
          {expandidoMobile ? "⬇ Puxe para baixo para ver o mapa" : "⬆ Puxe ou toque para tela cheia"}
        </span>
      </div>

      <div
        onTouchStart={(e) => iniciarArraste(e.touches[0].clientY)}
        onTouchMove={(e) => moverArraste(e.touches[0].clientY)}
        onTouchEnd={finalizarArraste}
        className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 sm:py-3"
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white sm:text-base">{titulo}</h2>
          <p className="truncate text-xs text-slate-400">{subtitulo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpandidoMobile((v) => !v)}
            className="flex h-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-800 sm:hidden"
          >
            {expandidoMobile ? "⬇ Mapa" : "⬆ Expandir"}
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label={`Fechar ${titulo.toLowerCase()}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm font-bold text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">{children}</div>
    </aside>
  );
}

interface PropriedadesPainelAlertas {
  alertas: AlertaMapa[];
  abrigos?: AbrigoMapa[];
  posicaoUsuario?: { lat: number; lng: number } | null;
  onVerNoMapa: (alerta: AlertaMapa) => void;
  onVerAbrigo: (idAbrigo: number) => void;
  onFechar: () => void;
}

const TIPOS_REPORTE_CIDADAO = [
  { tipo: "VIA_BLOQUEADA", rotulo: "🚧 Via bloqueada / Queda de barreira" },
  { tipo: "ALAGAMENTO", rotulo: "🌊 Alagamento na via" },
  { tipo: "DESLIZAMENTO", rotulo: "⛰️ Risco de deslizamento" },
  { tipo: "RISCO_ESTRUTURAL", rotulo: "🏚️ Risco estrutural" },
  { tipo: "OUTRO", rotulo: "⚠️ Outro incidente" },
] as const;

/** Lista de vias bloqueadas e áreas de risco ativas + Formulário de Reporte Cidadão (crowdsourcing moderado). */
export function PainelAlertas({
  alertas,
  abrigos = [],
  posicaoUsuario = null,
  onVerNoMapa,
  onVerAbrigo,
  onFechar,
}: PropriedadesPainelAlertas) {
  const [formAberto, setFormAberto] = useState(false);
  const [tipo, setTipo] = useState<string>("VIA_BLOQUEADA");
  const [idAbrigo, setIdAbrigo] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [relatorNome, setRelatorNome] = useState("");
  const [relatorContato, setRelatorContato] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function enviarReporte(e: FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) return;
    setEnviando(true);
    setFeedback(null);

    const abrigoRef = abrigos.find((a) => String(a.id) === idAbrigo) ?? abrigos[0];
    const latitude = posicaoUsuario?.lat ?? abrigoRef?.latitude ?? -28.258;
    const longitude = posicaoUsuario?.lng ?? abrigoRef?.longitude ?? -52.406;

    try {
      const resposta = await fetch("/api/public/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(idAbrigo ? { idAbrigo: Number(idAbrigo) } : {}),
          tipo,
          descricao: descricao.trim(),
          latitude,
          longitude,
          relatorNome: relatorNome.trim() || null,
          relatorContato: relatorContato.trim() || null,
        }),
      });
      const json = (await resposta.json()) as {
        dados?: { abrigo: { nome: string } };
        erro?: { mensagem?: string };
      };
      if (!resposta.ok) {
        setFeedback({ tipo: "erro", texto: json.erro?.mensagem ?? "Não foi possível enviar o reporte." });
      } else {
        setDescricao("");
        setFormAberto(false);
        setFeedback({
          tipo: "ok",
          texto: `Reporte enviado para validação da coordenação (${json.dados?.abrigo.nome ?? "abrigo mais próximo"}).`,
        });
      }
    } catch {
      setFeedback({ tipo: "erro", texto: "Sem conexão no momento para enviar o reporte." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Gaveta
      titulo={`Vias e áreas de risco (${alertas.length})`}
      subtitulo="Toque para ver no mapa ou reporte um bloqueio"
      cor="border-rose-500/40"
      onFechar={onFechar}
    >
      <div className="rounded-2xl border border-amber-500/35 bg-slate-900/90 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-amber-300">📢 Viu uma via interditada ou alagamento?</p>
            <p className="text-[11px] text-slate-400">Envie para a fila de moderação da coordenação.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormAberto((v) => !v);
              setFeedback(null);
            }}
            className="min-h-9 shrink-0 rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400"
          >
            {formAberto ? "Fechar" : "+ Reportar"}
          </button>
        </div>

        {feedback && (
          <p
            role="status"
            className={`mt-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${
              feedback.tipo === "ok"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/15 text-rose-200"
            }`}
          >
            {feedback.texto}
          </p>
        )}

        {formAberto && (
          <form onSubmit={enviarReporte} className="mt-3 space-y-2 border-t border-slate-800 pt-2.5">
            <div>
              <label htmlFor="reporte-tipo" className="block text-[11px] font-bold text-slate-300">
                Tipo de ocorrência
              </label>
              <select
                id="reporte-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-1 h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-white"
              >
                {TIPOS_REPORTE_CIDADAO.map((item) => (
                  <option key={item.tipo} value={item.tipo}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </div>

            {abrigos.length > 0 && (
              <div>
                <label htmlFor="reporte-abrigo" className="block text-[11px] font-bold text-slate-300">
                  Abrigo de referência (opcional)
                </label>
                <select
                  id="reporte-abrigo"
                  value={idAbrigo}
                  onChange={(e) => setIdAbrigo(e.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-white"
                >
                  <option value="">Mais próximo automaticamente (PostGIS)</option>
                  {abrigos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="reporte-descricao" className="block text-[11px] font-bold text-slate-300">
                Descrição e ponto de referência *
              </label>
              <textarea
                id="reporte-descricao"
                required
                rows={2}
                maxLength={400}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Água cobrindo a ponte da Av. Brasil próximo ao cruzamento..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                maxLength={100}
                value={relatorNome}
                onChange={(e) => setRelatorNome(e.target.value)}
                placeholder="Seu nome (opcional)"
                aria-label="Seu nome (opcional)"
                className="h-9 rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-white placeholder-slate-500"
              />
              <input
                type="text"
                maxLength={40}
                value={relatorContato}
                onChange={(e) => setRelatorContato(e.target.value)}
                placeholder="Telefone (opcional)"
                aria-label="Telefone (opcional)"
                className="h-9 rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={enviando || !descricao.trim()}
              className="min-h-10 w-full rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {enviando ? "Enviando reporte..." : "Enviar para validação da equipe"}
            </button>
          </form>
        )}
      </div>

      {alertas.map((alerta) => {
        const selo = obterSeloAtualizacao(alerta.dataRegistro);
        return (
          <article
            key={alerta.id}
            className={`space-y-2 rounded-2xl border p-3 ${alerta.gravidade === "CRITICO" ? "border-rose-500/40 bg-rose-950/25" : "border-amber-500/40 bg-amber-950/25"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                {alerta.tipo === "AREA_RISCO" ? "🔺" : "🚧"} {alerta.descricaoTipo}
              </h3>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${selo.classe}`}>
                  {selo.icone} {selo.rotulo}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-bold ${alerta.gravidade === "CRITICO" ? "bg-rose-500 text-slate-950" : "bg-amber-400 text-slate-950"}`}
                >
                  {alerta.gravidade === "CRITICO" ? "Crítico" : "Alerta"}
                </span>
              </div>
            </div>
            {alerta.descricao && <p className="text-sm text-slate-200">{alerta.descricao}</p>}
            {!alerta.localizacaoPropria && <p className="text-xs text-slate-400">Local exato não informado: alerta no próprio abrigo.</p>}
            <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
              <span className="truncate text-xs text-slate-400">Abrigo: {alerta.abrigo.nome}</span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onVerNoMapa(alerta)}
                  className="min-h-12 rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 text-xs font-bold text-rose-200 hover:bg-rose-500/30 sm:min-h-9"
                >
                  🎯 No mapa
                </button>
                <button
                  type="button"
                  onClick={() => onVerAbrigo(alerta.abrigo.id)}
                  className="min-h-12 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800 sm:min-h-9"
                >
                  🏠 Abrigo
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </Gaveta>
  );
}

interface PropriedadesListaAbrigos {
  abrigos: AbrigoMapa[];
  carregando: boolean;
  idSelecionado: number | null;
  onSelecionar: (id: number) => void;
  onLimparFiltros: () => void;
  onFechar: () => void;
}

/** Lista rápida dos abrigos que atendem aos filtros. */
export function ListaAbrigos({ abrigos, carregando, idSelecionado, onSelecionar, onLimparFiltros, onFechar }: PropriedadesListaAbrigos) {
  return (
    <Gaveta
      titulo={`Abrigos na região (${abrigos.length})`}
      subtitulo="Toque em um abrigo para ver os detalhes"
      cor="border-slate-700/80"
      onFechar={onFechar}
    >
      {carregando && abrigos.length === 0 ? (
        <p className="p-4 text-center text-sm text-slate-400">Carregando abrigos...</p>
      ) : abrigos.length === 0 ? (
        <div className="space-y-3 p-4 text-center">
          <p className="text-sm font-semibold text-slate-300">Nenhum abrigo encontrado com estes filtros.</p>
          <button type="button" onClick={onLimparFiltros} className="min-h-12 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950">
            Limpar filtros
          </button>
        </div>
      ) : (
        abrigos.map((abrigo) => {
          const estilo = obterEstiloNivel(abrigo.ocupacao.nivel);
          const selo = obterSeloAtualizacao(abrigo.atualizadoEm);
          const selecionado = abrigo.id === idSelecionado;
          return (
            <button
              key={abrigo.id}
              type="button"
              onClick={() => onSelecionar(abrigo.id)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                selecionado
                  ? "border-amber-500 bg-slate-900 ring-1 ring-amber-500/40"
                  : abrigo.destaque
                    ? "border-sky-500/50 bg-sky-950/20 hover:bg-slate-900"
                    : "border-slate-800/90 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-1 text-sm font-bold text-white">
                  {abrigo.destaque ? "⭐ " : ""}
                  {abrigo.nome}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${estilo.badge}`}>
                  {estilo.simbolo} {abrigo.ocupacao.vagasDisponiveis > 0 ? `${abrigo.ocupacao.vagasDisponiveis} vagas` : "Lotado"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="truncate">{abrigo.endereco}</span>
                {abrigo.distanciaKm !== null && (
                  <span className="shrink-0 font-bold text-sky-300 tabular-nums">{abrigo.distanciaKm.toFixed(1)} km</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${selo.classe}`}>
                  {selo.icone} {selo.rotulo}
                </span>
                {abrigo.aceitaPets && (
                  <span className="rounded-full border border-teal-500/40 bg-teal-500/15 px-2 py-0.5 text-[10px] font-bold text-teal-200">
                    🐾 Aceita pets
                  </span>
                )}
                {abrigo.acessivelPcd && (
                  <span className="rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-200">
                    ♿ PCD
                  </span>
                )}
              </div>
              {abrigo.emAreaDeRisco && <p className="mt-1 text-xs font-bold text-rose-300">🔺 Dentro de área de risco</p>}
              {abrigo.rotaCruzaAreaRisco && (
                <p className="mt-1 text-xs font-bold text-rose-300">⚠️ Trajeto direto cruza área de risco</p>
              )}
            </button>
          );
        })
      )}
    </Gaveta>
  );
}

interface ResultadoFamiliarPublico {
  id: number;
  nomeExibicao: string;
  cpfMascarado: string | null;
  dataEntrada: string;
  abrigo: {
    id: number;
    nome: string;
    endereco: string;
    telefone: string | null;
  };
}

/** Busca pública de familiares acolhidos ("Encontre um Familiar" - protegida pela LGPD). */
export function PainelBuscaFamiliar({
  onVerAbrigo,
  onFechar,
}: {
  onVerAbrigo: (idAbrigo: number) => void;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoFamiliarPublico[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 3) {
      setErro("Digite ao menos 3 letras do nome ou o CPF da pessoa.");
      return;
    }
    setBuscando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/public/acolhidos?busca=${encodeURIComponent(termo.trim())}`);
      const json = (await resposta.json()) as {
        dados?: ResultadoFamiliarPublico[];
        erro?: { mensagem?: string };
      };
      if (!resposta.ok) {
        setErro(json.erro?.mensagem ?? "Não foi possível realizar a consulta.");
      } else {
        setResultados(json.dados ?? []);
      }
    } catch {
      setErro("Sem conexão para consultar a base de acolhidos no momento.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Gaveta
      titulo="🔍 Encontre um familiar"
      subtitulo="Consulta pública protegida (LGPD) de pessoas acolhidas"
      cor="border-teal-500/40"
      onFechar={onFechar}
    >
      <form onSubmit={buscar} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-3">
        <label htmlFor="busca-familiar-input" className="block text-xs font-bold text-slate-300">
          Nome ou CPF do familiar
        </label>
        <div className="flex gap-2">
          <input
            id="busca-familiar-input"
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Ex.: Maria Oliveira ou CPF..."
            className="h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={buscando}
            className="h-10 shrink-0 rounded-xl bg-teal-400 px-3.5 text-xs font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-50"
          >
            {buscando ? "..." : "Buscar"}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          🔒 Por privacidade (LGPD), nomes intermediários são abreviados e o CPF é exibido de forma mascarada.
        </p>
      </form>

      {erro && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs font-semibold text-rose-200">
          {erro}
        </p>
      )}

      {resultados !== null && resultados.length === 0 && !erro && (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-400">
          Nenhum acolhido com status <strong>PRESENTE</strong> encontrado para &ldquo;{termo}&rdquo;.
        </p>
      )}

      {resultados?.map((item) => (
        <article key={item.id} className="space-y-2 rounded-2xl border border-teal-500/30 bg-slate-900/80 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">{item.nomeExibicao}</h3>
              {item.cpfMascarado && <p className="text-[11px] text-slate-400 tabular-nums">CPF: {item.cpfMascarado}</p>}
            </div>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              ● Acolhido(a)
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 text-xs">
            <p className="font-bold text-teal-300">🏠 {item.abrigo.nome}</p>
            <p className="mt-0.5 text-slate-400">{item.abrigo.endereco}</p>
            {item.abrigo.telefone && <p className="mt-0.5 text-slate-300">📞 {item.abrigo.telefone}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-slate-400">
              Entrada: {new Date(item.dataEntrada).toLocaleDateString("pt-BR")}
            </span>
            <button
              type="button"
              onClick={() => onVerAbrigo(item.abrigo.id)}
              className="min-h-9 rounded-xl bg-teal-400 px-3 text-xs font-bold text-slate-950 hover:bg-teal-300"
            >
              🏠 Ver abrigo no mapa
            </button>
          </div>
        </article>
      ))}
    </Gaveta>
  );
}
