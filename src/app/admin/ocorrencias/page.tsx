"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "@/lib/cliente-api";
import { useAdmin } from "../contexto-admin";

interface Ocorrencia {
  id: number;
  idAbrigo: number;
  tipo: string;
  gravidade: "ALERTA" | "CRITICO";
  descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  dataRegistro: string;
  dataResolucao: string | null;
  registradoPor: string;
  resolvidoPor: string | null;
}

const TIPOS_OCORRENCIA = [
  { tipo: "VIA_BLOQUEADA", rotulo: "🚧 Via de Acesso Bloqueada", gravidadePadrao: "CRITICO" as const },
  { tipo: "ALAGAMENTO", rotulo: "🌊 Alagamento no Entorno", gravidadePadrao: "CRITICO" as const },
  { tipo: "DESLIZAMENTO", rotulo: "⛰️ Risco de Deslizamento", gravidadePadrao: "CRITICO" as const },
  { tipo: "RISCO_ESTRUTURAL", rotulo: "🏚️ Risco Estrutural", gravidadePadrao: "CRITICO" as const },
  { tipo: "SEM_ENERGIA", rotulo: "⚡ Sem Energia Elétrica", gravidadePadrao: "ALERTA" as const },
  { tipo: "SEM_AGUA", rotulo: "🚰 Sem Abastecimento de Água", gravidadePadrao: "ALERTA" as const },
  { tipo: "SEM_COMUNICACAO", rotulo: "📡 Sem Internet / Telefone", gravidadePadrao: "ALERTA" as const },
  { tipo: "OUTRO", rotulo: "⚠️ Outra Ocorrência", gravidadePadrao: "ALERTA" as const },
];

export default function PaginaOcorrencias() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, recarregarAbrigos } = useAdmin();
  const podeGerenciar = usuario.papel === "ADMIN" || usuario.papel === "COORDENADOR";

  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [somenteAtivas, setSomenteAtivas] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Formulário de nova ocorrência
  const [tipo, setTipo] = useState("VIA_BLOQUEADA");
  const [gravidade, setGravidade] = useState<"ALERTA" | "CRITICO">("CRITICO");
  const [descricao, setDescricao] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [observacaoResolucao, setObservacaoResolucao] = useState<Record<number, string>>({});

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      const lista = await api<Ocorrencia[]>(
        `/api/abrigos/${idAbrigoAtivo}/ocorrencias${somenteAtivas ? "?ativas=true" : ""}`,
      );
      setOcorrencias(lista);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigoAtivo, somenteAtivas]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  function selecionarTipo(novoTipo: string) {
    setTipo(novoTipo);
    const info = TIPOS_OCORRENCIA.find((t) => t.tipo === novoTipo);
    if (info) setGravidade(info.gravidadePadrao);
  }

  function usarLocalDoAbrigo() {
    if (!abrigoAtivo) return;
    setLatitude(String(abrigoAtivo.latitude));
    setLongitude(String(abrigoAtivo.longitude));
  }

  function capturarGpsNavegador() {
    if (!("geolocation" in navigator)) {
      setErro("Geolocalização não suportada neste navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
      },
      () => setErro("Não foi possível obter a localização GPS do dispositivo."),
    );
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (!idAbrigoAtivo) return;
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const corpo: Record<string, unknown> = {
        tipo,
        gravidade,
        descricao: descricao.trim() || null,
      };
      if (latitude.trim() !== "" || longitude.trim() !== "") {
        corpo.latitude = Number(latitude);
        corpo.longitude = Number(longitude);
      }

      await api(`/api/abrigos/${idAbrigoAtivo}/ocorrencias`, {
        method: "POST",
        body: JSON.stringify(corpo),
      });
      setDescricao("");
      setLatitude("");
      setLongitude("");
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso("Ocorrência registrada e publicada nos alertas do mapa.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function resolver(idOcorrencia: number) {
    if (!idAbrigoAtivo) return;
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      await api(`/api/abrigos/${idAbrigoAtivo}/ocorrencias/${idOcorrencia}/resolucao`, {
        method: "POST",
        body: JSON.stringify({ observacao: observacaoResolucao[idOcorrencia]?.trim() || null }),
      });
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso("Ocorrência encerrada e status do abrigo recalculado.");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  if (!idAbrigoAtivo) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
        Selecione um abrigo no topo para gerenciar ocorrências de infraestrutura.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
          RF05 & RF09 • Monitoramento de Infraestrutura e Vias Colapsadas
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          Reporte de Infraestrutura — {abrigoAtivo?.nome}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Alertas ativos atualizam o status operacional do abrigo e aparecem em tempo real no mapa público para evitar deslocamentos por rotas interditadas.
        </p>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200">{erro}</div>
      )}
      {aviso && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
          {aviso}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Registro (Coordenador / Admin) */}
        {podeGerenciar && (
          <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Registrar Nova Ocorrência</h2>

            <form onSubmit={registrar} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  1. Tipo de Incidente
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TIPOS_OCORRENCIA.map((item) => {
                    const selecionado = tipo === item.tipo;
                    return (
                      <button
                        key={item.tipo}
                        type="button"
                        onClick={() => selecionarTipo(item.tipo)}
                        className={`min-h-11 rounded-xl border p-2.5 text-left text-xs font-bold transition cursor-pointer ${
                          selecionado
                            ? "border-amber-400 bg-amber-500/20 text-amber-200"
                            : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {item.rotulo}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  2. Gravidade do Impacto
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["ALERTA", "CRITICO"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGravidade(g)}
                      className={`min-h-11 rounded-xl border py-2 text-xs font-black transition cursor-pointer ${
                        gravidade === g
                          ? g === "CRITICO"
                            ? "border-red-400 bg-red-500 text-slate-950"
                            : "border-amber-400 bg-amber-400 text-slate-950"
                          : "border-slate-800 bg-slate-950 text-slate-300"
                      }`}
                    >
                      {g === "CRITICO" ? "🚨 CRÍTICO (Risco / Interdição)" : "⚠️ ALERTA (Operação Parcial)"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  3. Descrição / Orientação de Rota Alternativa {tipo === "OUTRO" && "(Obrigatória)"}
                </label>
                <textarea
                  rows={3}
                  required={tipo === "OUTRO"}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: Ponte principal interditada; acesse pela rua lateral Norte."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder-slate-500"
                />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Coordenadas do Ponto Bloqueado (opcional)
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={usarLocalDoAbrigo}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      Local do Abrigo
                    </button>
                    <button
                      type="button"
                      onClick={capturarGpsNavegador}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-amber-300 hover:bg-slate-800 cursor-pointer"
                    >
                      📍 Meu GPS
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Latitude (ex.: -28.2486)"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Longitude (ex.: -52.4230)"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full min-h-12 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
              >
                {enviando ? "Publicando Alerta..." : "Publicar Alerta de Infraestrutura"}
              </button>
            </form>
          </section>
        )}

        {/* Lista de Ocorrências */}
        <section
          className={`${podeGerenciar ? "lg:col-span-7" : "lg:col-span-12"} rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">
              {somenteAtivas ? "Ocorrências Ativas no Momento" : "Histórico Completo de Ocorrências"}
            </h2>
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setSomenteAtivas(true)}
                className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                  somenteAtivas ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                }`}
              >
                Ativas
              </button>
              <button
                type="button"
                onClick={() => setSomenteAtivas(false)}
                className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                  !somenteAtivas ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                }`}
              >
                Todas / Resolvidas
              </button>
            </div>
          </div>

          {carregando ? (
            <p className="py-8 text-center text-sm text-slate-400">Carregando ocorrências...</p>
          ) : ocorrencias.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center text-sm text-slate-400">
              Nenhuma ocorrência encontrada neste filtro.
            </div>
          ) : (
            <ul className="space-y-3">
              {ocorrencias.map((oc) => {
                const rotulo = TIPOS_OCORRENCIA.find((t) => t.tipo === oc.tipo)?.rotulo ?? oc.tipo;
                const ativa = !oc.dataResolucao;
                return (
                  <li
                    key={oc.id}
                    className={`rounded-xl border p-4 space-y-3 ${
                      !ativa
                        ? "border-slate-800 bg-slate-950/60 opacity-80"
                        : oc.gravidade === "CRITICO"
                          ? "border-red-500/40 bg-red-950/25"
                          : "border-amber-500/40 bg-amber-950/25"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-black ${
                              !ativa
                                ? "bg-emerald-500/20 text-emerald-300"
                                : oc.gravidade === "CRITICO"
                                  ? "bg-red-500 text-slate-950"
                                  : "bg-amber-400 text-slate-950"
                            }`}
                          >
                            {ativa ? oc.gravidade : "RESOLVIDA"}
                          </span>
                          <h3 className="text-base font-bold text-white">{rotulo}</h3>
                        </div>
                        {oc.descricao && (
                          <p className="text-sm text-slate-200 mt-1.5 whitespace-pre-line">{oc.descricao}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(oc.dataRegistro).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-t border-slate-800/80 pt-2.5">
                      <div>
                        <span>Registrado por: <strong className="text-slate-300">{oc.registradoPor}</strong></span>
                        {oc.latitude !== null && oc.longitude !== null && (
                          <span className="ml-3 font-mono text-[11px] text-amber-300">
                            📍 {oc.latitude.toFixed(4)}, {oc.longitude.toFixed(4)}
                          </span>
                        )}
                        {oc.resolvidoPor && (
                          <span className="ml-3 text-emerald-300">
                            • Resolvido por {oc.resolvidoPor} em{" "}
                            {new Date(oc.dataResolucao!).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>

                      {ativa && podeGerenciar && (
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                          <input
                            type="text"
                            placeholder="Observação de resolução (opcional)"
                            value={observacaoResolucao[oc.id] ?? ""}
                            onChange={(e) =>
                              setObservacaoResolucao((ant) => ({ ...ant, [oc.id]: e.target.value }))
                            }
                            className="flex-1 sm:w-56 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <button
                            type="button"
                            disabled={enviando}
                            onClick={() => resolver(oc.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                          >
                            ✓ Resolver
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
