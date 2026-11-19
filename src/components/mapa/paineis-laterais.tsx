"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Accessibility, MapPin, Megaphone, PawPrint, Search } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { FOCO, juntarClasses } from "@/components/ui/classes";
import { Folha, type NavegacaoFolha } from "@/components/ui/folha";
import { Icone } from "@/components/ui/icone";
import { SeloStatus } from "@/components/ui/selo-status";
import { ListaAvisosOficiais } from "./avisos-oficiais";
import { obterSeloAtualizacao, obterStatusGravidade, obterStatusOcupacao, type AbrigoMapa, type AlertaMapa, type AvisoOficialMapa } from "./tipos";

/** Uma tela do painel do mapa (folha inferior no celular), com título e resumo no cabeçalho. */
function Gaveta({
  titulo,
  subtitulo,
  navegacao,
  onFechar,
  children,
}: {
  titulo: string;
  subtitulo: string;
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    <Folha
      rotulo={titulo}
      rotuloFechar="Fechar painel"
      onFechar={onFechar}
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

function resumirAlertasEAvisos(totalAlertas: number, totalAvisos: number): string {
  const alertas = totalAlertas === 1 ? "1 alerta ativo" : `${totalAlertas} alertas ativos`;
  if (totalAvisos === 0) return alertas;
  return `${totalAvisos === 1 ? "1 aviso do INMET" : `${totalAvisos} avisos do INMET`} · ${alertas}`;
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
    <Gaveta titulo="Alertas e avisos" subtitulo={resumirAlertasEAvisos(alertas.length, avisos.length)} navegacao={navegacao} onFechar={onFechar}>
      <ListaAvisosOficiais avisos={avisos} />

      <div className={juntarClasses("space-y-3 py-4", avisos.length > 0 && "border-t border-borda")}>
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
              <Campo rotulo="Abrigo de referência (opcional)">
                <select value={idAbrigo} onChange={(e) => setIdAbrigo(e.target.value)} className={CLASSES_CAMPO}>
                  <option value="">O mais próximo de você</option>
                  {abrigos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </Campo>
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

      {alertas.length === 0 && <p className="border-t border-borda py-4 text-corpo text-texto-2">Nenhum alerta ativo no momento.</p>}

      {alertas.map((alerta) => {
        const gravidade = obterStatusGravidade(alerta.gravidade);
        return (
          <article key={alerta.id} className="border-t border-borda py-4">
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
  navegacao?: NavegacaoFolha;
  onFechar: () => void;
}

/** Lista dos abrigos que atendem aos filtros: uma linha por abrigo, com o número de vagas à direita. */
export function ListaAbrigos({ abrigos, carregando, idSelecionado, onSelecionar, onLimparFiltros, navegacao, onFechar }: PropriedadesListaAbrigos) {
  return (
    <Gaveta
      titulo="Abrigos"
      subtitulo={abrigos.length === 1 ? "1 abrigo com os filtros atuais" : `${abrigos.length} abrigos com os filtros atuais`}
      navegacao={navegacao}
      onFechar={onFechar}
    >
      {carregando && abrigos.length === 0 ? (
        <p className="py-6 text-center text-corpo text-texto-2">Carregando abrigos...</p>
      ) : abrigos.length === 0 ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-corpo text-texto-2">Nenhum abrigo encontrado com estes filtros.</p>
          <Botao onClick={onLimparFiltros}>Limpar filtros</Botao>
        </div>
      ) : (
        <ul className="-mx-4">
          {abrigos.map((abrigo) => {
            const status = obterStatusOcupacao(abrigo.ocupacao);
            const vagas = Math.max(0, abrigo.ocupacao.vagasDisponiveis);
            const selecionado = abrigo.id === idSelecionado;
            return (
              <li key={abrigo.id} className="border-b border-borda last:border-b-0">
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
