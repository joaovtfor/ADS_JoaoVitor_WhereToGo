"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Accessibility, MapPin, Megaphone, PawPrint, Search } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { FOCO, juntarClasses } from "@/components/ui/classes";
import { Folha, type NavegacaoFolha } from "@/components/ui/folha";
import { Icone } from "@/components/ui/icone";
import { SeloStatus } from "@/components/ui/selo-status";
import { ListaAvisosOficiais, useAvisosValidos } from "./avisos-oficiais";
import { obterSeloAtualizacao, obterStatusGravidade, obterStatusOcupacao, type AbrigoMapa, type AlertaMapa, type AvisoOficialMapa } from "./tipos";

/** Uma tela do painel do mapa (folha inferior no celular), com título e resumo no cabeçalho. */
function Gaveta({
  titulo,
  subtitulo,
  navegacao,
  scrollRef,
  onFechar,
  children,
}: {
  titulo: string;
  subtitulo: string;
  navegacao?: NavegacaoFolha;
  scrollRef?: RefObject<HTMLDivElement | null>;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    <Folha
      rotulo={titulo}
      rotuloFechar="Fechar painel"
      onFechar={onFechar}
      scrollRef={scrollRef}
      {...navegacao}
      titulo={
        <>
          <h2 className="truncate text-titulo font-semibold text-texto">{titulo}</h2>
          <p className="truncate text-meta text-texto-3">{subtitulo}</p>
        </>
      }
    >
      {children}
    </Folha>
  );
}

/** Mensagem de resultado dentro de um painel (envio feito, erro de rede...). */
function Retorno({ nivel, children }: { nivel: "ok" | "critico"; children: ReactNode }) {
  return (
    <p
      role={nivel === "critico" ? "alert" : "status"}
      className={juntarClasses("rounded-controle p-3 text-meta", nivel === "ok" ? "bg-ok/12 text-ok-claro" : "bg-critico/12 text-critico-claro")}
    >
      {children}
    </p>
  );
}

interface PropriedadesPainelAlertas {
  alertas: AlertaMapa[];
  /** Avisos oficiais do INMET ainda não vencidos. */
  avisos?: AvisoOficialMapa[];
  abrigos?: AbrigoMapa[];
  posicaoUsuario?: { lat: number; lng: number } | null;
  onVerNoMapa: (alerta: AlertaMapa) => void;
  onVerAbrigo: (idAbrigo: number) => void;
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
}

const TIPOS_REPORTE_CIDADAO = [
  { tipo: "VIA_BLOQUEADA", rotulo: "Via bloqueada ou queda de barreira" },
  { tipo: "ALAGAMENTO", rotulo: "Alagamento na via" },
  { tipo: "DESLIZAMENTO", rotulo: "Risco de deslizamento" },
  { tipo: "RISCO_ESTRUTURAL", rotulo: "Risco estrutural" },
  { tipo: "OUTRO", rotulo: "Outro incidente" },
] as const;

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resumirAlertasEAvisos(totalAlertas: number, totalAvisos: number): string {
  const alertas = totalAlertas === 1 ? "1 alerta ativo" : `${totalAlertas} alertas ativos`;
  if (totalAvisos === 0) return alertas;
  return `${totalAvisos === 1 ? "1 aviso do INMET" : `${totalAvisos} avisos do INMET`} · ${alertas}`;
}

function ItemAlerta({
  alerta,
  onVerNoMapa,
  onVerAbrigo,
}: {
  alerta: AlertaMapa;
  onVerNoMapa: (alerta: AlertaMapa) => void;
  onVerAbrigo: (idAbrigo: number) => void;
}) {
  const gravidade = obterStatusGravidade(alerta.gravidade);
  return (
    <article className="border-t border-borda py-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-corpo font-medium text-texto">{alerta.descricaoTipo}</h3>
        <SeloStatus nivel={gravidade.nivel} forma="preenchido" className="shrink-0">
          {gravidade.rotulo}
        </SeloStatus>
      </div>
      {alerta.descricao && <p className="mt-1 text-corpo text-texto-2">{alerta.descricao}</p>}
      <p className="mt-1 text-meta text-texto-3">
        {obterSeloAtualizacao(alerta.dataRegistro).rotulo} · {alerta.abrigo ? `Perto de ${alerta.abrigo.nome}` : "Alerta regional (Defesa Civil)"}
        {!alerta.localizacaoPropria && " · local exato não informado"}
      </p>
      <div className="mt-3 flex gap-2">
        <Botao tamanho="sm" icone={MapPin} onClick={() => onVerNoMapa(alerta)}>
          Ver no mapa
        </Botao>
        {alerta.abrigo && (
          <Botao tamanho="sm" variante="fantasma" onClick={() => onVerAbrigo(alerta.abrigo!.id)}>
            Ver abrigo
          </Botao>
        )}
      </div>
    </article>
  );
}

function calcularScrollMargin(container: HTMLDivElement | null, scrollEl: HTMLDivElement | null): number {
  if (!container) return 0;
  // Quando o contêiner rolável não é o offsetParent direto (ex.: <aside> da Folha),
  // subtrair scrollEl.offsetTop isola a distância interna acima da lista.
  if (scrollEl && container.offsetParent !== scrollEl) {
    return Math.max(0, container.offsetTop - scrollEl.offsetTop);
  }
  return container.offsetTop;
}

const LIMITE_RENDER_DIRETA_ALERTAS = 25;

function ListaAlertasVirtualizada({
  alertas,
  scrollRef,
  topoRef,
  onVerNoMapa,
  onVerAbrigo,
}: {
  alertas: AlertaMapa[];
  scrollRef: RefObject<HTMLDivElement | null>;
  topoRef: RefObject<HTMLDivElement | null>;
  onVerNoMapa: (alerta: AlertaMapa) => void;
  onVerAbrigo: (idAbrigo: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const atualizar = () => {
      const proximo = calcularScrollMargin(containerRef.current, scrollRef.current);
      setScrollMargin((atual) => (atual === proximo ? atual : proximo));
    };

    void Promise.resolve().then(atualizar);

    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(atualizar);
    if (topoRef.current) observador.observe(topoRef.current);
    if (scrollRef.current) observador.observe(scrollRef.current);
    return () => observador.disconnect();
  }, [scrollRef, topoRef]);

  const virtualizer = useVirtualizer({
    count: alertas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 148,
    overscan: 5,
    scrollMargin,
    getItemKey: (index) => alertas[index]?.id ?? index,
  });

  return (
    <div ref={containerRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const alerta = alertas[item.index];
        if (!alerta) return null;
        return (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
          >
            <ItemAlerta alerta={alerta} onVerNoMapa={onVerNoMapa} onVerAbrigo={onVerAbrigo} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Avisos oficiais do INMET, vias bloqueadas e áreas de risco ativas, com o
 * formulário de reporte do cidadão (moderado pela coordenação).
 */
export function PainelAlertas({
  alertas,
  avisos = [],
  abrigos = [],
  posicaoUsuario = null,
  onVerNoMapa,
  onVerAbrigo,
  navegacao,
  onFechar,
}: PropriedadesPainelAlertas) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topoRef = useRef<HTMLDivElement | null>(null);
  const selectAbrigoId = useId();
  const avisosValidos = useAvisosValidos(avisos);

  const [formAberto, setFormAberto] = useState(false);
  const [tipo, setTipo] = useState<string>("VIA_BLOQUEADA");
  const [idAbrigo, setIdAbrigo] = useState<string>("");
  const [filtroAbrigo, setFiltroAbrigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [relatorNome, setRelatorNome] = useState("");
  const [relatorContato, setRelatorContato] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const abrigoSelecionadoForm = useMemo(
    () => (idAbrigo ? (abrigos.find((a) => String(a.id) === idAbrigo) ?? null) : null),
    [abrigos, idAbrigo],
  );

  const termoFiltroAbrigo = normalizarTexto(filtroAbrigo);
  const { opcoesAbrigo, semResultadosFiltro } = useMemo(() => {
    if (termoFiltroAbrigo) {
      const filtrados = abrigos.filter((a) => normalizarTexto(a.nome).includes(termoFiltroAbrigo)).slice(0, 8);
      const opcoes =
        abrigoSelecionadoForm && !filtrados.some((a) => a.id === abrigoSelecionadoForm.id)
          ? [abrigoSelecionadoForm, ...filtrados]
          : filtrados;
      return { opcoesAbrigo: opcoes, semResultadosFiltro: filtrados.length === 0 };
    }
    const primeiros = abrigos.slice(0, 5);
    const opcoes =
      abrigoSelecionadoForm && !primeiros.some((a) => a.id === abrigoSelecionadoForm.id)
        ? [...primeiros, abrigoSelecionadoForm]
        : primeiros;
    return { opcoesAbrigo: opcoes, semResultadosFiltro: false };
  }, [abrigos, termoFiltroAbrigo, abrigoSelecionadoForm]);

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
        setFiltroAbrigo("");
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
      titulo="Alertas e avisos"
      subtitulo={resumirAlertasEAvisos(alertas.length, avisosValidos.length)}
      navegacao={navegacao}
      scrollRef={scrollRef}
      onFechar={onFechar}
    >
      <div ref={topoRef}>
        <ListaAvisosOficiais avisos={avisosValidos} />

        <div className={juntarClasses("space-y-3 py-4", avisosValidos.length > 0 && "border-t border-borda")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-corpo text-texto-2">Viu uma via interditada ou um alagamento?</p>
            <Botao
              tamanho="sm"
              icone={Megaphone}
              aria-expanded={formAberto}
              onClick={() => {
                setFormAberto((v) => !v);
                setFeedback(null);
              }}
            >
              {formAberto ? "Cancelar" : "Reportar"}
            </Botao>
          </div>

          {feedback && <Retorno nivel={feedback.tipo === "ok" ? "ok" : "critico"}>{feedback.texto}</Retorno>}

          {formAberto && (
            <form onSubmit={enviarReporte} className="space-y-3">
              <Campo rotulo="Tipo de ocorrência">
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={CLASSES_CAMPO}>
                  {TIPOS_REPORTE_CIDADAO.map((item) => (
                    <option key={item.tipo} value={item.tipo}>
                      {item.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>

              {abrigos.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={selectAbrigoId} className="text-meta font-medium text-texto-2">
                    Abrigo de referência (opcional)
                  </label>
                  {abrigos.length > 5 && (
                    <input
                      type="search"
                      value={filtroAbrigo}
                      onChange={(e) => setFiltroAbrigo(e.target.value)}
                      placeholder="Filtrar outro abrigo pelo nome..."
                      aria-label="Filtrar outro abrigo pelo nome"
                      className={juntarClasses(CLASSES_CAMPO, "sm:min-h-9")}
                    />
                  )}
                  <select id={selectAbrigoId} value={idAbrigo} onChange={(e) => setIdAbrigo(e.target.value)} className={CLASSES_CAMPO}>
                    <option value="">O mais próximo de você</option>
                    {opcoesAbrigo.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                    {semResultadosFiltro && (
                      <option value="" disabled>
                        Nenhum abrigo encontrado
                      </option>
                    )}
                  </select>
                </div>
              )}

              <Campo rotulo="O que aconteceu e onde" dica="Será revisado pela coordenação antes de aparecer no mapa.">
                <textarea
                  required
                  rows={3}
                  maxLength={400}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Água cobrindo a ponte da Av. Brasil, perto do cruzamento"
                  className={`${CLASSES_CAMPO} py-2`}
                />
              </Campo>

              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Seu nome (opcional)">
                  <input type="text" maxLength={100} value={relatorNome} onChange={(e) => setRelatorNome(e.target.value)} className={CLASSES_CAMPO} />
                </Campo>
                <Campo rotulo="Telefone (opcional)">
                  <input type="tel" maxLength={40} value={relatorContato} onChange={(e) => setRelatorContato(e.target.value)} className={CLASSES_CAMPO} />
                </Campo>
              </div>

              <Botao type="submit" variante="primaria" disabled={enviando || !descricao.trim()} className="w-full">
                {enviando ? "Enviando..." : "Enviar para a coordenação"}
              </Botao>
            </form>
          )}
        </div>
      </div>

      {alertas.length === 0 ? (
        <p className="border-t border-borda py-4 text-corpo text-texto-2">Nenhum alerta ativo no momento.</p>
      ) : alertas.length <= LIMITE_RENDER_DIRETA_ALERTAS ? (
        alertas.map((alerta) => <ItemAlerta key={alerta.id} alerta={alerta} onVerNoMapa={onVerNoMapa} onVerAbrigo={onVerAbrigo} />)
      ) : (
        <ListaAlertasVirtualizada
          alertas={alertas}
          scrollRef={scrollRef}
          topoRef={topoRef}
          onVerNoMapa={onVerNoMapa}
          onVerAbrigo={onVerAbrigo}
        />
      )}
    </Gaveta>
  );
}

interface PropriedadesListaAbrigos {
  abrigos: AbrigoMapa[];
  carregando: boolean;
  idSelecionado: number | null;
  onSelecionar: (id: number) => void;
  onLimparFiltros: () => void;
  filtroCluster?: { quantidade: number; onLimpar: () => void } | null;
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
}

/** Lista dos abrigos que atendem aos filtros: uma linha por abrigo, com o número de vagas à direita. */
export function ListaAbrigos({
  abrigos,
  carregando,
  idSelecionado,
  onSelecionar,
  onLimparFiltros,
  filtroCluster = null,
  navegacao,
  onFechar,
}: PropriedadesListaAbrigos) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: abrigos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 112,
    overscan: 6,
    getItemKey: (index) => abrigos[index]?.id ?? index,
  });

  return (
    <Gaveta
      titulo="Abrigos"
      subtitulo={abrigos.length === 1 ? "1 abrigo com os filtros atuais" : `${abrigos.length} abrigos com os filtros atuais`}
      navegacao={navegacao}
      scrollRef={scrollRef}
      onFechar={onFechar}
    >
      {filtroCluster && (
        <div className="-mx-4 flex items-center justify-between gap-2 border-b border-borda px-4 py-2">
          <p className="text-meta text-texto-2">Mostrando {filtroCluster.quantidade} abrigos neste ponto</p>
          <Botao tamanho="sm" variante="fantasma" onClick={filtroCluster.onLimpar}>
            Ver todos
          </Botao>
        </div>
      )}

      {carregando && abrigos.length === 0 ? (
        <p className="py-6 text-center text-corpo text-texto-2">Carregando abrigos...</p>
      ) : abrigos.length === 0 ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-corpo text-texto-2">Nenhum abrigo encontrado com estes filtros.</p>
          <Botao onClick={onLimparFiltros}>Limpar filtros</Botao>
        </div>
      ) : (
        <ul className="relative -mx-4" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const abrigo = abrigos[item.index];
            if (!abrigo) return null;
            const status = obterStatusOcupacao(abrigo.ocupacao);
            const vagas = Math.max(0, abrigo.ocupacao.vagasDisponiveis);
            const selecionado = abrigo.id === idSelecionado;
            return (
              <li
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className={juntarClasses("absolute inset-x-0 top-0", item.index < abrigos.length - 1 && "border-b border-borda")}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <button
                  type="button"
                  aria-current={selecionado ? "true" : undefined}
                  onClick={() => onSelecionar(abrigo.id)}
                  className={juntarClasses(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors -outline-offset-2",
                    FOCO,
                    selecionado ? "bg-primaria/12" : "hover:bg-superficie-2",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-corpo font-medium text-texto">{abrigo.nome}</span>
                    <span className="mt-0.5 block truncate text-meta text-texto-3">{abrigo.endereco}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-texto-2">
                      <SeloStatus nivel={status.nivel}>{status.rotulo}</SeloStatus>
                      {abrigo.distanciaKm !== null && <span className="tabular-nums">{abrigo.distanciaKm.toFixed(1)} km</span>}
                      {abrigo.aceitaPets && (
                        <span className="inline-flex items-center gap-1">
                          <Icone de={PawPrint} tamanho={14} />
                          Pets
                        </span>
                      )}
                      {abrigo.acessivelPcd && (
                        <span className="inline-flex items-center gap-1">
                          <Icone de={Accessibility} tamanho={14} />
                          Acessível
                        </span>
                      )}
                    </span>
                    {abrigo.destaque && <span className="mt-1 block text-meta text-primaria-clara">Precisa do que você quer doar</span>}
                    {abrigo.emAreaDeRisco && <span className="mt-1 block text-meta text-critico-claro">Dentro de área de risco</span>}
                    {abrigo.rotaCruzaAreaRisco && (
                      <span className="mt-1 block text-meta text-critico-claro">O caminho direto passa por área de risco</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-titulo font-semibold tabular-nums text-texto">{vagas}</span>
                    <span className="block text-meta text-texto-3">{vagas === 1 ? "vaga" : "vagas"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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

/** Busca pública de familiares acolhidos, com os dados pessoais protegidos (LGPD). */
export function PainelBuscaFamiliar({
  onVerAbrigo,
  navegacao,
  onFechar,
}: {
  onVerAbrigo: (idAbrigo: number) => void;
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<{ termo: string; itens: ResultadoFamiliarPublico[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    const busca = termo.trim();
    if (busca.length < 3) {
      setErro("Digite ao menos 3 letras do nome ou o CPF da pessoa.");
      return;
    }
    setBuscando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/public/acolhidos?busca=${encodeURIComponent(busca)}`);
      const json = (await resposta.json()) as {
        dados?: ResultadoFamiliarPublico[];
        erro?: { mensagem?: string };
      };
      if (!resposta.ok) {
        setErro(json.erro?.mensagem ?? "Não foi possível realizar a consulta.");
      } else {
        setResultados({ termo: busca, itens: json.dados ?? [] });
      }
    } catch {
      setErro("Sem conexão para consultar a base de acolhidos no momento.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Gaveta titulo="Encontrar familiar" subtitulo="Pessoas acolhidas nos abrigos agora" navegacao={navegacao} onFechar={onFechar}>
      <form onSubmit={buscar} className="space-y-3 py-4">
        <Campo rotulo="Nome ou CPF" dica="Por privacidade, parte do nome é abreviada e o CPF aparece mascarado." erro={erro}>
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Maria Oliveira"
            className={CLASSES_CAMPO}
          />
        </Campo>
        <Botao type="submit" variante="primaria" icone={Search} disabled={buscando} className="w-full">
          {buscando ? "Buscando..." : "Buscar"}
        </Botao>
      </form>

      {resultados !== null && resultados.itens.length === 0 && !erro && (
        <p className="border-t border-borda py-4 text-corpo text-texto-2">
          Nenhuma pessoa acolhida encontrada para &ldquo;{resultados.termo}&rdquo;. Confira a grafia ou tente pelo CPF.
        </p>
      )}

      {resultados?.itens.map((item) => (
        <article key={item.id} className="border-t border-borda py-4">
          <h3 className="text-corpo font-medium text-texto">{item.nomeExibicao}</h3>
          <p className="text-meta text-texto-3 tabular-nums">
            {item.cpfMascarado && <>CPF {item.cpfMascarado} · </>}
            Entrada em {new Date(item.dataEntrada).toLocaleDateString("pt-BR")}
          </p>
          <p className="mt-2 text-corpo text-texto">{item.abrigo.nome}</p>
          <p className="text-meta text-texto-2">
            {item.abrigo.endereco}
            {item.abrigo.telefone && <> · {item.abrigo.telefone}</>}
          </p>
          <Botao tamanho="sm" icone={MapPin} onClick={() => onVerAbrigo(item.abrigo.id)} className="mt-3">
            Ver abrigo no mapa
          </Botao>
        </article>
      ))}
    </Gaveta>
  );
}
