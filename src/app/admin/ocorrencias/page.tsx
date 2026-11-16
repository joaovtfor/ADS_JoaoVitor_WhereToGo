"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { CabecalhoPagina, EstadoVazio, Secao } from "@/components/ui/pagina";
import { SeloStatus } from "@/components/ui/selo-status";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ToastFlutuante, useAdmin } from "../contexto-admin";
import { rotuloOcorrencia } from "../rotulos";
import { FormOcorrencia } from "./form-ocorrencia";
import { estaAtiva, estaPendente, statusDaOcorrencia, type Ocorrencia } from "./tipos";

function formatarMomento(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Encerrar um alerta pede confirmação e aceita uma observação (o que foi feito). */
function ModalResolver({ ocorrencia, salvando, onConfirmar, onFechar }: { ocorrencia: Ocorrencia; salvando: boolean; onConfirmar: (observacao: string | null) => void; onFechar: () => void }) {
  const [observacao, setObservacao] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    onConfirmar(observacao.trim() || null);
  }

  return (
    <Modal titulo={`Encerrar: ${rotuloOcorrencia(ocorrencia.tipo).toLowerCase()}`} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-meta text-texto-2">O alerta sai do mapa público e o estado do abrigo é recalculado.</p>
        <Campo rotulo="O que foi feito (opcional)">
          <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} className={CLASSES_CAMPO} />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primaria" disabled={salvando}>
            {salvando ? "Encerrando..." : "Encerrar alerta"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

export default function PaginaOcorrencias() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, recarregarAbrigos } = useAdmin();
  const podeGerenciar = usuario.papel === "ADMIN" || usuario.papel === "COORDENADOR";
  const somenteLeitura = abrigoAtivo ? !abrigoAtivo.ativo : false;

  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [somenteAtivas, setSomenteAtivas] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resolvendo, setResolvendo] = useState<Ocorrencia | null>(null);

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      setOcorrencias(await api<Ocorrencia[]>(`/api/abrigos/${idAbrigoAtivo}/ocorrencias${somenteAtivas ? "?ativas=true" : ""}`));
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

  /** Toda ação aqui muda o estado do abrigo: recarrega a lista e o cabeçalho. */
  async function executar(acao: () => Promise<unknown>, mensagem: string): Promise<boolean> {
    if (!idAbrigoAtivo || somenteLeitura) return false;
    setEnviando(true);
    setErro(null);
    try {
      await acao();
      await Promise.all([carregar(), recarregarAbrigos()]);
      setAviso(mensagem);
      return true;
    } catch (err) {
      setErro(mensagemErro(err));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  if (!idAbrigoAtivo) return <EstadoVazio>Selecione um abrigo no topo para ver os alertas de infraestrutura.</EstadoVazio>;

  const base = `/api/abrigos/${idAbrigoAtivo}/ocorrencias`;
  const moderar = (ocorrencia: Ocorrencia, acao: "APROVAR" | "REJEITAR") =>
    void executar(
      () => api(`${base}/${ocorrencia.id}/moderacao`, { method: "POST", body: JSON.stringify({ acao, observacao: null }) }),
      acao === "APROVAR" ? "Reporte aprovado e publicado no mapa." : "Reporte descartado.",
    );

  return (
    <div className="space-y-6">
      <ToastFlutuante erro={erro} aviso={aviso} aoFecharErro={() => setErro(null)} aoFecharAviso={() => setAviso(null)} />

      <CabecalhoPagina
        titulo="Infraestrutura e acesso"
        descricao="Vias bloqueadas, áreas de risco e falhas de energia ou água. O que estiver ativo aparece para a população no mapa."
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
        {podeGerenciar && (
          <Secao titulo="Novo alerta" className="lg:col-span-5">
            <FormOcorrencia
              abrigo={abrigoAtivo}
              somenteLeitura={somenteLeitura}
              enviando={enviando}
              onErro={setErro}
              onRegistrar={(corpo, ehAreaDeRisco) =>
                executar(
                  () => api(base, { method: "POST", body: JSON.stringify(corpo) }),
                  ehAreaDeRisco ? "Área de risco publicada no mapa." : "Alerta publicado no mapa.",
                )
              }
            />
          </Secao>
        )}

        <Secao
          titulo={somenteAtivas ? "Alertas ativos" : "Todos os alertas"}
          className={podeGerenciar ? "lg:col-span-7" : "lg:col-span-12"}
          acoes={
            <>
              <Chip ativo={somenteAtivas} onClick={() => setSomenteAtivas(true)}>
                Ativos
              </Chip>
              <Chip ativo={!somenteAtivas} onClick={() => setSomenteAtivas(false)}>
                Todos
              </Chip>
            </>
          }
        >
          {carregando ? (
            <EstadoVazio>Carregando alertas...</EstadoVazio>
          ) : ocorrencias.length === 0 ? (
            <EstadoVazio>{somenteAtivas ? "Nenhum alerta ativo neste abrigo." : "Nenhum alerta registrado neste abrigo."}</EstadoVazio>
          ) : (
            <ul className="border-t border-borda">
              {ocorrencias.map((ocorrencia) => {
                const status = statusDaOcorrencia(ocorrencia);
                const pendente = estaPendente(ocorrencia);
                return (
                  <li key={ocorrencia.id} className="border-b border-borda py-4">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <h3 className="text-corpo font-medium text-texto">{rotuloOcorrencia(ocorrencia.tipo)}</h3>
                      <SeloStatus nivel={status.nivel}>{status.rotulo}</SeloStatus>
                    </div>
                    {ocorrencia.descricao && <p className="mt-1 text-corpo whitespace-pre-line text-texto-2">{ocorrencia.descricao}</p>}
                    <p className="mt-1 flex flex-wrap gap-x-3 text-meta text-texto-3 tabular-nums">
                      <span>{formatarMomento(ocorrencia.dataRegistro)}</span>
                      <span>
                        {ocorrencia.origemCidada ? "Reporte de morador: " : "Por "}
                        {ocorrencia.registradoPor}
                        {ocorrencia.relatorContato && ` (${ocorrencia.relatorContato})`}
                      </span>
                      {ocorrencia.poligono && ocorrencia.poligono.length >= 3 ? (
                        <span>Área demarcada no mapa</span>
                      ) : (
                        ocorrencia.latitude !== null && ocorrencia.longitude !== null && <span>Local marcado no mapa</span>
                      )}
                      {ocorrencia.resolvidoPor && ocorrencia.dataResolucao && (
                        <span>
                          {ocorrencia.statusValidacao === "REJEITADA" ? "Descartado" : "Resolvido"} por {ocorrencia.resolvidoPor} em{" "}
                          {formatarMomento(ocorrencia.dataResolucao)}
                        </span>
                      )}
                    </p>

                    {estaAtiva(ocorrencia) && podeGerenciar && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendente ? (
                          <>
                            <Botao tamanho="sm" disabled={somenteLeitura || enviando} onClick={() => moderar(ocorrencia, "APROVAR")}>
                              Aprovar e publicar
                            </Botao>
                            <Botao tamanho="sm" variante="fantasma" disabled={somenteLeitura || enviando} onClick={() => moderar(ocorrencia, "REJEITAR")}>
                              Descartar
                            </Botao>
                          </>
                        ) : (
                          <Botao tamanho="sm" disabled={somenteLeitura || enviando} onClick={() => setResolvendo(ocorrencia)}>
                            Resolver
                          </Botao>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      </div>

      {resolvendo && (
        <ModalResolver
          ocorrencia={resolvendo}
          salvando={enviando}
          onFechar={() => setResolvendo(null)}
          onConfirmar={(observacao) =>
            void executar(
              () => api(`${base}/${resolvendo.id}/resolucao`, { method: "POST", body: JSON.stringify({ observacao }) }),
              "Alerta encerrado.",
            ).then((ok) => ok && setResolvendo(null))
          }
        />
      )}
    </div>
  );
}
