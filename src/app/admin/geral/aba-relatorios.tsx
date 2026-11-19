"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, FileText } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { EstadoVazio, Secao } from "@/components/ui/pagina";
import { SeloStatus } from "@/components/ui/selo-status";
import { ehVisaoGlobal, pode } from "@/lib/auth/permissoes";
import { api, ErroClienteApi } from "@/lib/cliente-api";
import { useAdmin } from "../contexto-admin";
import type { Acao } from "../use-acao";

// Etapa 4 do plano de integração: eventos de desastre (COBRADE por evento),
// subsídios para o FIDE (S2iD) e prestação de contas com hash.

interface Cobrade {
  codigo: string;
  grupo: string;
  descricao: string;
}

interface Evento {
  id: number;
  nome: string;
  cobrade: string;
  cobradeDescricao: string;
  inicio: string;
  fim: string | null;
  decreto: string | null;
  emCurso: boolean;
  registradoPor: string;
}

interface Subsidios {
  evento: { nome: string; cobrade: string; cobradeDescricao: string; decreto: string | null; emCurso: boolean };
  periodo: { inicio: string; fim: string };
  escopo: { abrigo: { id: number; nome: string } | null; abrigosAtivos: number };
  danosHumanos: {
    desabrigados: number;
    presentesAgora: number;
    semCadastroAgora: number;
    pico: { data: string; pessoas: number } | null;
    faixasEtarias: Array<{ chave: string; rotulo: string; pessoas: number | null }>;
  };
  assistenciaHumanitaria: Array<{ categoria: string; item: string; unidade: string; distribuido: number; doacoesRecebidas: number; perdas: number }>;
  ocorrencias: Array<{ tipo: string; descricao: string; campoFide: string; registradas: number; aindaAtivas: number; abrigosAfetados: number; regionais: number }>;
}

/** Data de hoje no aparelho, "AAAA-MM-DD". */
const hoje = () => new Date().toLocaleDateString("sv-SE");
const formatarData = (data: string) => data.split("-").reverse().join("/");

/** Baixa um CSV da API (com a sessão) e devolve o SHA-256 informado pelo servidor. */
async function baixarCsv(url: string): Promise<{ sha256: string | null; arquivo: string }> {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    const json = (await resposta.json().catch(() => null)) as { erro?: { codigo?: string; mensagem?: string } } | null;
    throw new ErroClienteApi(resposta.status, json?.erro?.codigo ?? "ERRO", json?.erro?.mensagem ?? `Não foi possível gerar o arquivo (HTTP ${resposta.status}).`);
  }
  const arquivo = /filename="([^"]+)"/.exec(resposta.headers.get("Content-Disposition") ?? "")?.[1] ?? "relatorio.csv";
  const endereco = URL.createObjectURL(await resposta.blob());
  const link = document.createElement("a");
  link.href = endereco;
  link.download = arquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(endereco), 2000);
  return { sha256: resposta.headers.get("X-Conteudo-SHA256"), arquivo };
}

function Indicador({ rotulo, valor, complemento }: { rotulo: string; valor: string | number; complemento?: string }) {
  return (
    <div>
      <dt className="text-meta text-texto-3">{rotulo}</dt>
      <dd className="text-titulo font-semibold text-texto tabular-nums">
        {valor}
        {complemento && <span className="ml-1 text-meta font-normal text-texto-3">{complemento}</span>}
      </dd>
    </div>
  );
}

/** Comprovante do arquivo baixado: o hash que também ficou gravado na auditoria. */
function Comprovante({ arquivo, sha256 }: { arquivo: string; sha256: string | null }) {
  return (
    <p className="text-meta text-texto-2">
      <span className="font-medium text-texto">{arquivo}</span> baixado. SHA-256 (gravado na auditoria):{" "}
      <span className="font-mono break-all text-texto-3 select-all">{sha256 ?? "não informado"}</span>
    </p>
  );
}

export function AbaRelatorios({ acao }: { acao: Acao }) {
  const { usuario, abrigos } = useAdmin();
  const visaoGlobal = ehVisaoGlobal(usuario);
  const podeGerenciarEventos = pode(usuario, "evento:gerenciar");
  const { executar, enviando } = acao;

  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [cobrade, setCobrade] = useState<Cobrade[]>([]);

  // Novo evento
  const [nome, setNome] = useState("");
  const [codigoCobrade, setCodigoCobrade] = useState("");
  const [inicioEvento, setInicioEvento] = useState(hoje());
  const [decreto, setDecreto] = useState("");

  // Subsídios FIDE
  const [idEvento, setIdEvento] = useState<number | "">("");
  const [idAbrigoFide, setIdAbrigoFide] = useState<number | "">("");
  const [subsidios, setSubsidios] = useState<Subsidios | null>(null);
  const [comprovanteFide, setComprovanteFide] = useState<{ arquivo: string; sha256: string | null } | null>(null);

  // Prestação de contas
  const [inicioContas, setInicioContas] = useState(() => {
    const data = new Date();
    data.setDate(1);
    return data.toLocaleDateString("sv-SE");
  });
  const [fimContas, setFimContas] = useState(hoje());
  const [idAbrigoContas, setIdAbrigoContas] = useState<number | "">("");
  const [comprovanteContas, setComprovanteContas] = useState<{ arquivo: string; sha256: string | null } | null>(null);

  const carregar = useCallback(async () => {
    const dados = await api<{ eventos: Evento[]; cobrade: Cobrade[] }>("/api/eventos");
    setEventos(dados.eventos);
    setCobrade(dados.cobrade);
    setIdEvento((atual) => (atual === "" ? (dados.eventos[0]?.id ?? "") : atual));
    setCodigoCobrade((atual) => atual || (dados.cobrade.find((c) => c.codigo === "1.3.2.1.4")?.codigo ?? dados.cobrade[0]?.codigo ?? ""));
  }, []);

  useEffect(() => {
    void executar(carregar);
  }, [executar, carregar]);

  async function registrarEvento(e: FormEvent) {
    e.preventDefault();
    const ok = await executar(async () => {
      const criado = await api<Evento>("/api/eventos", {
        method: "POST",
        body: JSON.stringify({ nome, cobrade: codigoCobrade, inicio: inicioEvento, decreto: decreto.trim() || null }),
      });
      await carregar();
      setIdEvento(criado.id);
    }, "Evento registrado.");
    if (ok) {
      setNome("");
      setDecreto("");
    }
  }

  const encerrarEvento = (evento: Evento) =>
    void executar(async () => {
      await api(`/api/eventos/${evento.id}`, { method: "PATCH", body: JSON.stringify({ fim: hoje() < evento.inicio ? evento.inicio : hoje() }) });
      await carregar();
    }, `Evento "${evento.nome}" encerrado.`);

  const consultaFide = () => {
    const params = new URLSearchParams({ idEvento: String(idEvento) });
    if (idAbrigoFide) params.set("idAbrigo", String(idAbrigoFide));
    return params;
  };

  const verSubsidios = () =>
    void executar(async () => {
      setComprovanteFide(null);
      setSubsidios(await api<Subsidios>(`/api/relatorios/fide?${consultaFide().toString()}`));
    });

  const baixarSubsidios = () =>
    void executar(async () => {
      const params = consultaFide();
      params.set("formato", "csv");
      setComprovanteFide(await baixarCsv(`/api/relatorios/fide?${params.toString()}`));
    });

  function baixarContas(e: FormEvent) {
    e.preventDefault();
    void executar(async () => {
      const params = new URLSearchParams({ inicio: inicioContas, fim: fimContas });
      if (idAbrigoContas) params.set("idAbrigo", String(idAbrigoContas));
      setComprovanteContas(await baixarCsv(`/api/relatorios/prestacao-contas?${params.toString()}`));
    });
  }

  const seletorAbrigo = (valor: number | "", aoMudar: (v: number | "") => void) =>
    visaoGlobal ? (
      <Campo rotulo="Abrangência">
        <select value={valor} onChange={(e) => aoMudar(e.target.value ? Number(e.target.value) : "")} className={CLASSES_CAMPO}>
          <option value="">Todos os abrigos</option>
          {abrigos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </Campo>
    ) : (
      <p className="text-meta text-texto-3">Abrangência: o seu abrigo.</p>
    );

  const gruposCobrade = Array.from(new Set(cobrade.map((c) => c.grupo)));

  return (
    <div className="space-y-10">
      <Secao
        titulo="Eventos de desastre"
        descricao="O COBRADE classifica o evento (um por decreto ou operação), não cada ocorrência. O período do evento é o dos subsídios para o FIDE."
      >
        {eventos === null ? (
          <EstadoVazio>Carregando eventos...</EstadoVazio>
        ) : eventos.length === 0 ? (
          <EstadoVazio>Nenhum evento registrado ainda.</EstadoVazio>
        ) : (
          <ul className="border-t border-borda">
            {eventos.map((evento) => (
              <li key={evento.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-borda py-3">
                <div className="min-w-0">
                  <p className="text-corpo font-medium text-texto">{evento.nome}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-texto-3 tabular-nums">
                    <SeloStatus nivel={evento.emCurso ? "atencao" : "neutro"}>{evento.emCurso ? "Em curso" : "Encerrado"}</SeloStatus>
                    <span>
                      COBRADE {evento.cobrade} · {evento.cobradeDescricao}
                    </span>
                    <span>
                      {formatarData(evento.inicio)} a {evento.fim ? formatarData(evento.fim) : "hoje"}
                    </span>
                    {evento.decreto && <span>Decreto {evento.decreto}</span>}
                  </p>
                </div>
                {podeGerenciarEventos && evento.emCurso && (
                  <Botao tamanho="sm" variante="fantasma" disabled={enviando} onClick={() => encerrarEvento(evento)}>
                    Encerrar hoje
                  </Botao>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeGerenciarEventos && (
          <form onSubmit={registrarEvento} className="grid grid-cols-1 gap-3 rounded-controle bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Nome do evento">
              <input type="text" required maxLength={150} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Enchente de novembro/2026" className={CLASSES_CAMPO} />
            </Campo>
            <Campo rotulo="COBRADE">
              <select required value={codigoCobrade} onChange={(e) => setCodigoCobrade(e.target.value)} className={CLASSES_CAMPO}>
                {gruposCobrade.map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {cobrade
                      .filter((c) => c.grupo === grupo)
                      .map((c) => (
                        <option key={c.codigo} value={c.codigo}>
                          {c.codigo} · {c.descricao}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Início">
              <input type="date" required value={inicioEvento} onChange={(e) => setInicioEvento(e.target.value)} className={CLASSES_CAMPO} />
            </Campo>
            <Campo rotulo="Decreto (opcional)">
              <input type="text" maxLength={120} value={decreto} onChange={(e) => setDecreto(e.target.value)} placeholder="Nº 123/2026" className={CLASSES_CAMPO} />
            </Campo>
            <div className="sm:col-span-2 lg:col-span-4">
              <Botao type="submit" disabled={enviando}>
                Registrar evento
              </Botao>
            </div>
          </form>
        )}
      </Secao>

      <Secao
        titulo="Subsídios para o FIDE (S2iD)"
        descricao="Desabrigados, assistência humanitária e ocorrências do evento, só em números (LGPD). Desalojados, feridos e mortos vêm de outras fontes."
      >
        {eventos && eventos.length === 0 ? (
          <EstadoVazio>Registre um evento para gerar os subsídios.</EstadoVazio>
        ) : (
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]">
            <Campo rotulo="Evento">
              <select value={idEvento} onChange={(e) => setIdEvento(Number(e.target.value))} className={CLASSES_CAMPO}>
                {(eventos ?? []).map((evento) => (
                  <option key={evento.id} value={evento.id}>
                    {evento.nome} ({evento.cobrade})
                  </option>
                ))}
              </select>
            </Campo>
            {seletorAbrigo(idAbrigoFide, setIdAbrigoFide)}
            <div className="flex flex-wrap gap-2">
              <Botao icone={FileText} disabled={!idEvento || enviando} onClick={verSubsidios}>
                Ver resumo
              </Botao>
              <Botao icone={Download} variante="primaria" disabled={!idEvento || enviando} onClick={baixarSubsidios}>
                Baixar planilha
              </Botao>
            </div>
          </div>
        )}

        {comprovanteFide && <Comprovante {...comprovanteFide} />}

        {subsidios && (
          <div className="space-y-6 border-t border-borda pt-4">
            <p className="text-meta text-texto-3">
              {subsidios.evento.nome} · COBRADE {subsidios.evento.cobrade} · {formatarData(subsidios.periodo.inicio)} a {formatarData(subsidios.periodo.fim)}
              {subsidios.evento.emCurso && " (em curso)"} · {subsidios.escopo.abrigo ? subsidios.escopo.abrigo.nome : "todos os abrigos"}
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Indicador rotulo="Desabrigados no período" valor={subsidios.danosHumanos.desabrigados} complemento="pessoas" />
              <Indicador rotulo="Presentes agora" valor={subsidios.danosHumanos.presentesAgora} />
              <Indicador rotulo="Chegaram, sem cadastro" valor={subsidios.danosHumanos.semCadastroAgora} />
              <Indicador
                rotulo="Pico"
                valor={subsidios.danosHumanos.pico?.pessoas ?? "—"}
                complemento={subsidios.danosHumanos.pico ? `em ${formatarData(subsidios.danosHumanos.pico.data)}` : "só no consolidado"}
              />
            </dl>

            <div>
              <h3 className="text-meta font-medium text-texto-2">Faixa etária (planejamento interno, não é campo do FIDE)</h3>
              <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-corpo text-texto tabular-nums">
                {subsidios.danosHumanos.faixasEtarias.map((f) => (
                  <span key={f.chave}>
                    <span className="text-texto-3">{f.rotulo}:</span> {f.pessoas ?? "menos de 5"}
                  </span>
                ))}
              </p>
            </div>

            <div className="overflow-x-auto">
              <h3 className="text-meta font-medium text-texto-2">Assistência humanitária</h3>
              {subsidios.assistenciaHumanitaria.length === 0 ? (
                <p className="py-3 text-meta text-texto-3">Nenhuma movimentação de estoque no período.</p>
              ) : (
                <table className="mt-1 w-full text-left text-meta">
                  <thead>
                    <tr className="border-b border-borda text-texto-3">
                      <th className="py-2 pr-4 font-normal">Item</th>
                      <th className="py-2 pr-4 text-right font-normal">Distribuído</th>
                      <th className="py-2 pr-4 text-right font-normal">Doações recebidas</th>
                      <th className="py-2 text-right font-normal">Perdas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsidios.assistenciaHumanitaria.map((a) => (
                      <tr key={`${a.categoria}-${a.item}`} className="border-b border-borda last:border-b-0">
                        <td className="py-2 pr-4 text-texto">
                          {a.item} <span className="text-texto-3">({a.unidade})</span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{a.distribuido}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{a.doacoesRecebidas}</td>
                        <td className="py-2 text-right tabular-nums">{a.perdas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-x-auto">
              <h3 className="text-meta font-medium text-texto-2">Ocorrências aprovadas no período</h3>
              {subsidios.ocorrencias.length === 0 ? (
                <p className="py-3 text-meta text-texto-3">Nenhuma ocorrência no período.</p>
              ) : (
                <table className="mt-1 w-full text-left text-meta">
                  <thead>
                    <tr className="border-b border-borda text-texto-3">
                      <th className="py-2 pr-4 font-normal">Tipo</th>
                      <th className="py-2 pr-4 font-normal">Campo sugerido no FIDE</th>
                      <th className="py-2 pr-4 text-right font-normal">Registradas</th>
                      <th className="py-2 text-right font-normal">Ativas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsidios.ocorrencias.map((o) => (
                      <tr key={o.tipo} className="border-b border-borda last:border-b-0">
                        <td className="py-2 pr-4 text-texto">{o.descricao}</td>
                        <td className="py-2 pr-4 text-texto-2">{o.campoFide}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{o.registradas}</td>
                        <td className="py-2 text-right tabular-nums">{o.aindaAtivas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Secao>

      <Secao
        titulo="Prestação de contas"
        descricao="Planilha com todas as movimentações de estoque e os eventos críticos da auditoria do período. O SHA-256 do arquivo fica gravado na auditoria."
      >
        <form onSubmit={baixarContas} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <Campo rotulo="De">
            <input type="date" required value={inicioContas} onChange={(e) => setInicioContas(e.target.value)} className={CLASSES_CAMPO} />
          </Campo>
          <Campo rotulo="Até">
            <input type="date" required value={fimContas} onChange={(e) => setFimContas(e.target.value)} className={CLASSES_CAMPO} />
          </Campo>
          {seletorAbrigo(idAbrigoContas, setIdAbrigoContas)}
          <Botao type="submit" icone={Download} disabled={enviando}>
            Baixar planilha
          </Botao>
        </form>
        {comprovanteContas && <Comprovante {...comprovanteContas} />}
      </Secao>
    </div>
  );
}
