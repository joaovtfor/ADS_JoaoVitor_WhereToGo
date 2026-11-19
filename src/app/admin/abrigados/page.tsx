"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeftRight, Ellipsis, History, LogOut, Pencil, Search } from "lucide-react";
import { Botao, BotaoIcone } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Icone } from "@/components/ui/icone";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { CabecalhoPagina, EstadoVazio, Faixa, Secao } from "@/components/ui/pagina";
import { SeloStatus } from "@/components/ui/selo-status";
import { api, mensagemErro } from "@/lib/cliente-api";
import { pode } from "@/lib/auth/permissoes";
import { ToastFlutuante, useAdmin } from "../contexto-admin";
import { ModalEdicao, ModalHistorico, ModalSaida, ModalTransferenciaAcolhido, ModalTransferenciaLote } from "./modais";
import { formatarCpf, formatarMomento, formatarNascimento, type Abrigado, type FiltroAcolhimento, type PaginaAbrigados } from "./tipos";

type ModalAberto = { tipo: "saida" | "transferencia" | "edicao" | "historico"; abrigado: Abrigado } | null;

const FILTROS: ReadonlyArray<{ id: FiltroAcolhimento; rotulo: string }> = [
  { id: "PRESENTE", rotulo: "Presentes" },
  { id: "DESLIGADO", rotulo: "Saídas" },
  { id: "TODOS", rotulo: "Todos" },
];

interface PropriedadesFormCheckin {
  somenteLeitura: boolean;
  enviando: boolean;
  aguardandoCadastro: number;
  onRegistrar: (dados: { nomeCompleto: string; cpf: string | null; dataNascimento: string | null; descontarDaTriagem: boolean }) => Promise<boolean>;
}

/** Check-in na portaria. Estado próprio: digitar aqui não renderiza a lista de acolhidos. */
function FormCheckin({ somenteLeitura, enviando, aguardandoCadastro, onRegistrar }: PropriedadesFormCheckin) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [descontarDaFila, setDescontarDaFila] = useState(true);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const registrado = await onRegistrar({
      nomeCompleto: nome,
      cpf: cpf.trim() || null,
      dataNascimento: nascimento || null,
      descontarDaTriagem: descontarDaFila && aguardandoCadastro > 0,
    });
    if (!registrado) return;
    setNome("");
    setCpf("");
    setNascimento("");
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo rotulo="Nome completo">
        <input type="text" required disabled={somenteLeitura} value={nome} onChange={(e) => setNome(e.target.value)} className={CLASSES_CAMPO} />
      </Campo>
      <Campo rotulo="CPF (opcional)">
        <input
          type="text"
          inputMode="numeric"
          disabled={somenteLeitura}
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          placeholder="000.000.000-00"
          className={`${CLASSES_CAMPO} tabular-nums`}
        />
      </Campo>
      <Campo rotulo="Data de nascimento (opcional)">
        <input type="date" disabled={somenteLeitura} value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={CLASSES_CAMPO} />
      </Campo>

      {aguardandoCadastro > 0 && (
        <label className="flex cursor-pointer items-start gap-3 text-meta text-texto-2">
          <input
            type="checkbox"
            disabled={somenteLeitura}
            checked={descontarDaFila}
            onChange={(e) => setDescontarDaFila(e.target.checked)}
            className="mt-0.5 size-4 accent-primaria"
          />
          <span>
            Esta pessoa já estava na fila de espera (<span className="tabular-nums">{aguardandoCadastro}</span> aguardando). O check-in não ocupa uma vaga
            nova.
          </span>
        </label>
      )}

      <Botao type="submit" variante="primaria" disabled={somenteLeitura || enviando} className="w-full">
        {enviando ? "Registrando..." : "Fazer check-in"}
      </Botao>
    </form>
  );
}

export default function PaginaAbrigados() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, abrigos, recarregarAbrigos } = useAdmin();
  // Check-in é da equipe do abrigo; a Defesa Civil consulta e transfere entre abrigos.
  const podeRegistrar = pode(usuario, "abrigado:registrar");
  const podeEditar = pode(usuario, "abrigado:editar");
  const podeTransferir = pode(usuario, "abrigado:transferir");
  const podeDesligar = pode(usuario, "abrigado:desligar");
  const temAcoes = podeEditar || podeTransferir || podeDesligar;
  const somenteLeitura = abrigoAtivo ? !abrigoAtivo.ativo : false;

  const [dados, setDados] = useState<PaginaAbrigados | null>(null);
  const [filtro, setFiltro] = useState<FiltroAcolhimento>("PRESENTE");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modal, setModal] = useState<ModalAberto>(null);
  // Transferência em grupo (evacuação preventiva): marca várias pessoas e transfere tudo ou nada.
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [loteAberto, setLoteAberto] = useState(false);

  function encerrarSelecao() {
    setSelecionando(false);
    setSelecionados([]);
    setLoteAberto(false);
  }

  function alternarSelecionado(id: number) {
    setSelecionados((atuais) => (atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]));
  }

  // Espera 300 ms depois da última tecla antes de buscar, para poupar rede.
  useEffect(() => {
    const temporizador = window.setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => window.clearTimeout(temporizador);
  }, [busca]);

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      const params = new URLSearchParams({ status: filtro, tamanho: "100" });
      if (buscaAplicada) params.set("busca", buscaAplicada);
      setDados(await api<PaginaAbrigados>(`/api/abrigos/${idAbrigoAtivo}/abrigados?${params.toString()}`));
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigoAtivo, filtro, buscaAplicada]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  /** Roda uma ação, recarrega a lista (e a lotação no topo, quando muda) e mostra o resultado. */
  async function executar<T>(acao: () => Promise<T>, mensagem: (resultado: T) => string, mudaLotacao = true): Promise<boolean> {
    if (somenteLeitura) return false;
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await acao();
      await Promise.all(mudaLotacao ? [carregar(), recarregarAbrigos()] : [carregar()]);
      setAviso(mensagem(resultado));
      return true;
    } catch (err) {
      setErro(mensagemErro(err));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  if (!idAbrigoAtivo) return <EstadoVazio>Selecione um abrigo no topo para ver os acolhidos.</EstadoVazio>;

  const abrigosDestino = abrigos.filter((a) => a.ativo && a.id !== idAbrigoAtivo && a.ocupacao.vagasDisponiveis > 0);
  const vagasLivres = abrigoAtivo?.ocupacao.vagasDisponiveis ?? 0;
  const fecharSeDeuCerto = (ok: boolean) => ok && setModal(null);
  const podeTransferirEmGrupo = podeTransferir && !somenteLeitura && filtro === "PRESENTE";
  const presentesNaLista = (dados?.itens ?? []).filter((a) => a.statusAcolhimento === "PRESENTE");
  // Só vale quem ainda está na lista: depois de recarregar, quem saiu ou foi movido deixa de contar.
  const marcados = selecionados.filter((id) => presentesNaLista.some((a) => a.id === id));

  return (
    <div className="space-y-6">
      <ToastFlutuante erro={erro} aviso={aviso} aoFecharErro={() => setErro(null)} aoFecharAviso={() => setAviso(null)} />

      <CabecalhoPagina titulo="Acolhidos" descricao="Entrada na portaria, com ou sem documento, saídas e transferências entre abrigos." />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
        {podeRegistrar && (
          <Secao
            titulo="Check-in"
            className="lg:col-span-4"
            acoes={<SeloStatus nivel={vagasLivres > 0 ? "ok" : "critico"}>{vagasLivres === 1 ? "1 vaga livre" : `${vagasLivres} vagas livres`}</SeloStatus>}
          >
            <FormCheckin
              somenteLeitura={somenteLeitura}
              enviando={enviando}
              aguardandoCadastro={abrigoAtivo?.acolhidosNaoTriados ?? 0}
              onRegistrar={(corpo) =>
                executar(
                  () => api<{ abrigado: Abrigado; reentrada: boolean }>(`/api/abrigos/${idAbrigoAtivo}/abrigados`, { method: "POST", body: JSON.stringify(corpo) }),
                  (resposta) =>
                    resposta.reentrada ? `Reentrada de ${resposta.abrigado.nomeCompleto} registrada.` : `Check-in de ${resposta.abrigado.nomeCompleto} feito.`,
                )
              }
            />
          </Secao>
        )}

        <section className={podeRegistrar ? "space-y-3 lg:col-span-8" : "space-y-3 lg:col-span-12"}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Icone de={Search} tamanho={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-3" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou CPF"
                aria-label="Buscar acolhido por nome ou CPF"
                className={`${CLASSES_CAMPO} pl-9`}
              />
            </div>
            {FILTROS.map((opcao) => (
              <Chip
                key={opcao.id}
                ativo={filtro === opcao.id}
                onClick={() => {
                  setFiltro(opcao.id);
                  encerrarSelecao();
                }}
              >
                {opcao.rotulo}
              </Chip>
            ))}
            {podeTransferirEmGrupo && (
              <Botao tamanho="sm" icone={ArrowLeftRight} ligado={selecionando} onClick={() => (selecionando ? encerrarSelecao() : setSelecionando(true))}>
                Transferir em grupo
              </Botao>
            )}
          </div>

          {selecionando && (
            <Faixa
              nivel="ok"
              acoes={
                <>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    onClick={() =>
                      setSelecionados(marcados.length === presentesNaLista.length ? [] : presentesNaLista.map((a) => a.id))
                    }
                  >
                    {marcados.length === presentesNaLista.length && presentesNaLista.length > 0 ? "Limpar seleção" : "Marcar todos da lista"}
                  </Botao>
                  <Botao tamanho="sm" variante="primaria" disabled={marcados.length === 0} onClick={() => setLoteAberto(true)}>
                    Transferir
                  </Botao>
                  <Botao tamanho="sm" variante="fantasma" onClick={encerrarSelecao}>
                    Cancelar
                  </Botao>
                </>
              }
            >
              {marcados.length === 0
                ? "Marque as pessoas que vão juntas para outro abrigo."
                : marcados.length === 1
                  ? "1 pessoa marcada."
                  : `${marcados.length} pessoas marcadas.`}
            </Faixa>
          )}

          {carregando ? (
            <EstadoVazio>Carregando acolhidos...</EstadoVazio>
          ) : !dados || dados.itens.length === 0 ? (
            <EstadoVazio>Ninguém encontrado com estes filtros.</EstadoVazio>
          ) : (
            <ul className="border-t border-borda">
              {dados.itens.map((abrigado) => {
                const presente = abrigado.statusAcolhimento === "PRESENTE";
                const marcavel = selecionando && presente;
                return (
                  <li key={abrigado.id} className="flex items-center gap-3 border-b border-borda py-3">
                    {marcavel && (
                      <input
                        type="checkbox"
                        checked={selecionados.includes(abrigado.id)}
                        onChange={() => alternarSelecionado(abrigado.id)}
                        aria-label={`Marcar ${abrigado.nomeCompleto} para transferir`}
                        className="size-5 shrink-0 cursor-pointer accent-primaria"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corpo font-medium text-texto">{abrigado.nomeCompleto}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-texto-3 tabular-nums">
                        {!presente && <SeloStatus nivel="neutro">Saiu em {formatarMomento(abrigado.dataSaida ?? abrigado.dataEntrada)}</SeloStatus>}
                        <span>{formatarCpf(abrigado.cpf)}</span>
                        {abrigado.dataNascimento && <span>Nasc. {formatarNascimento(abrigado.dataNascimento)}</span>}
                        <span>Entrou em {formatarMomento(abrigado.dataEntrada)}</span>
                      </p>
                    </div>

                    {selecionando ? null : temAcoes ? (
                      <Menu rotulo={`Ações para ${abrigado.nomeCompleto}`} icone={Ellipsis}>
                        <ItemMenu icone={History} onClick={() => setModal({ tipo: "historico", abrigado })}>
                          Histórico de transferências
                        </ItemMenu>
                        {!somenteLeitura && podeEditar && (
                          <ItemMenu icone={Pencil} onClick={() => setModal({ tipo: "edicao", abrigado })}>
                            Editar cadastro
                          </ItemMenu>
                        )}
                        {!somenteLeitura && presente && podeTransferir && (
                          <ItemMenu icone={ArrowLeftRight} onClick={() => setModal({ tipo: "transferencia", abrigado })}>
                            Transferir de abrigo
                          </ItemMenu>
                        )}
                        {!somenteLeitura && presente && podeDesligar && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setModal({ tipo: "saida", abrigado })}
                            className="flex min-h-11 w-full items-center gap-3 border-t border-borda px-3 text-left text-corpo text-critico-claro hover:bg-superficie-2"
                          >
                            <Icone de={LogOut} />
                            Dar saída
                          </button>
                        )}
                      </Menu>
                    ) : (
                      <BotaoIcone icone={History} rotulo={`Histórico de transferências de ${abrigado.nomeCompleto}`} onClick={() => setModal({ tipo: "historico", abrigado })} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {modal?.tipo === "saida" && (
        <ModalSaida
          abrigado={modal.abrigado}
          salvando={enviando}
          onFechar={() => setModal(null)}
          onConfirmar={(motivo) =>
            void executar(
              () => api(`/api/abrigados/${modal.abrigado.id}/desligamento`, { method: "POST", body: JSON.stringify({ motivo }) }),
              () => `Saída de ${modal.abrigado.nomeCompleto} registrada e vaga liberada.`,
            ).then(fecharSeDeuCerto)
          }
        />
      )}
      {modal?.tipo === "transferencia" && (
        <ModalTransferenciaAcolhido
          abrigado={modal.abrigado}
          abrigosDestino={abrigosDestino}
          salvando={enviando}
          onFechar={() => setModal(null)}
          onConfirmar={(corpo) =>
            void executar(
              () => api(`/api/abrigados/${modal.abrigado.id}/transferencias`, { method: "POST", body: JSON.stringify(corpo) }),
              () => `${modal.abrigado.nomeCompleto} foi para outro abrigo.`,
            ).then(fecharSeDeuCerto)
          }
        />
      )}
      {modal?.tipo === "edicao" && (
        <ModalEdicao
          abrigado={modal.abrigado}
          salvando={enviando}
          onFechar={() => setModal(null)}
          onSalvar={(corpo) =>
            void executar(
              () => api(`/api/abrigados/${modal.abrigado.id}`, { method: "PATCH", body: JSON.stringify(corpo) }),
              () => "Cadastro atualizado.",
              false,
            ).then(fecharSeDeuCerto)
          }
        />
      )}
      {modal?.tipo === "historico" && <ModalHistorico abrigado={modal.abrigado} onFechar={() => setModal(null)} />}
      {loteAberto && marcados.length > 0 && (
        <ModalTransferenciaLote
          quantidade={marcados.length}
          abrigosDestino={abrigosDestino}
          salvando={enviando}
          onFechar={() => setLoteAberto(false)}
          onConfirmar={(corpo) =>
            void executar(
              () =>
                api<{ transferidos: number; destino: { nome: string } }>(`/api/abrigos/${idAbrigoAtivo}/transferencias-lote`, {
                  method: "POST",
                  body: JSON.stringify({ ...corpo, idsAbrigados: marcados }),
                }),
              (resposta) =>
                `${resposta.transferidos === 1 ? "1 pessoa foi" : `${resposta.transferidos} pessoas foram`} para ${resposta.destino.nome}.`,
            ).then((ok) => {
              if (ok) return encerrarSelecao();
              // Falhou (ex.: alguém saiu no meio do caminho): recarrega; quem não está mais na lista sai da seleção.
              setLoteAberto(false);
              void carregar();
            })
          }
        />
      )}
    </div>
  );
}
