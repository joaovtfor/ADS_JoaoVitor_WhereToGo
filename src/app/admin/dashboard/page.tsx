"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Botao, BotaoIcone, classesBotao } from "@/components/ui/botao";
import { CabecalhoPagina, EstadoVazio, Faixa } from "@/components/ui/pagina";
import { pode } from "@/lib/auth/permissoes";
import { api, mensagemErro } from "@/lib/cliente-api";
import { ToastFlutuante, useAdmin } from "../contexto-admin";
import { ROTULO_NECESSIDADE, rotuloOcorrencia } from "../rotulos";
import { FaixaAvisosOficiais } from "./faixa-avisos";
import { ModalAbrigo, SecaoEstoqueEmAlerta, SecaoInfraestrutura, SecaoMovimentacoes, SecaoOcupacao, SecaoSugestoes } from "./secoes";
import type { DadosDashboard, StatusNecessidade, SugestaoTransferencia } from "./tipos";

export default function PaginaDashboard() {
  const { usuario, idAbrigoAtivo, abrigoAtivo, recarregarAbrigos } = useAdmin();
  // A Defesa Civil acompanha qualquer abrigo e age em alertas e trocas, mas não opera a fila nem o cadastro do abrigo.
  const podeOperar = pode(usuario, "abrigo:editar-operacao");
  const podeClassificar = pode(usuario, "estoque:classificar");
  const [dados, setDados] = useState<DadosDashboard | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [editandoAbrigo, setEditandoAbrigo] = useState(false);

  const carregar = useCallback(async () => {
    if (!idAbrigoAtivo) return;
    try {
      setDados(await api<DadosDashboard>(`/api/abrigos/${idAbrigoAtivo}/dashboard`));
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, [idAbrigoAtivo]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
    // Atualiza sozinho a cada 30 s com a aba visível: lotação, estoque crítico e
    // alertas mudam pela ação de voluntários em outros aparelhos.
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 30_000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar]);

  /**
   * Roda uma ação do painel: bloqueia os botões enquanto salva, recarrega os
   * indicadores e mostra o resultado. `afetaCabecalho` atualiza também a lotação
   * e o estado do abrigo no topo da tela.
   */
  async function executar<T>(acao: () => Promise<T>, mensagem: (resultado: T) => string, afetaCabecalho = true): Promise<boolean> {
    setProcessando(true);
    setErro(null);
    try {
      const resultado = await acao();
      await Promise.all(afetaCabecalho ? [carregar(), recarregarAbrigos()] : [carregar()]);
      setAviso(mensagem(resultado));
      return true;
    } catch (err) {
      setErro(mensagemErro(err));
      return false;
    } finally {
      setProcessando(false);
    }
  }

  if (!idAbrigoAtivo) return <EstadoVazio>Selecione um abrigo no topo para ver a visão geral.</EstadoVazio>;
  if (carregando && !dados) return <EstadoVazio>Carregando indicadores do abrigo...</EstadoVazio>;
  if (!dados) return <Faixa nivel="critico">{erro ?? "Não foi possível carregar os indicadores do abrigo."}</Faixa>;

  const { ocupacao, acolhidos, estoque, ocorrenciasAtivas } = dados;
  const somenteLeitura = !dados.abrigo.ativo;
  const bloqueado = somenteLeitura || processando;
  const base = `/api/abrigos/${idAbrigoAtivo}`;
  const reportesPendentes = dados.reportesPendentes ?? 0;
  const sugestoes = dados.sugestoesTransferencia ?? [];

  // Envia só a variação: o banco soma, então toques simultâneos de dois
  // coordenadores (ou duas abas) não se sobrescrevem.
  const ajustarFila = (delta: number) =>
    void executar(
      () => api<{ acolhidosNaoTriados: number }>(`${base}/triagem`, { method: "POST", body: JSON.stringify({ delta }) }),
      (abrigo) => (abrigo.acolhidosNaoTriados === 1 ? "1 pessoa aguardando cadastro." : `${abrigo.acolhidosNaoTriados} pessoas aguardando cadastro.`),
    );

  const resolverOcorrencia = (idOcorrencia: number) =>
    void executar(
      () => api(`${base}/ocorrencias/${idOcorrencia}/resolucao`, { method: "POST", body: JSON.stringify({ observacao: "Resolvido pelo painel de visão geral" }) }),
      () => "Ocorrência marcada como resolvida.",
    );

  /** Liga o alerta ou, se já houver um ativo desse tipo, encerra todos eles. */
  function alternarAlerta(tipo: string) {
    const ativas = ocorrenciasAtivas.filter((o) => o.tipo === tipo);
    if (ativas.length === 0) {
      void executar(
        () => api(`${base}/ocorrencias`, { method: "POST", body: JSON.stringify({ tipo }) }),
        () => `Alerta publicado no mapa: ${rotuloOcorrencia(tipo).toLowerCase()}.`,
      );
      return;
    }
    void executar(
      () =>
        Promise.all(
          ativas.map((o) =>
            api(`${base}/ocorrencias/${o.id}/resolucao`, { method: "POST", body: JSON.stringify({ observacao: "Desativado pelo atalho rápido do painel" }) }),
          ),
        ),
      () => `Alerta encerrado: ${rotuloOcorrencia(tipo).toLowerCase()}.`,
    );
  }

  const enviarSugestao = (sugestao: SugestaoTransferencia) =>
    void executar(
      () =>
        api(`${base}/transferencias-estoque`, {
          method: "POST",
          body: JSON.stringify({
            idAbrigoDestino: sugestao.idAbrigoParceiro,
            idItem: sugestao.idItem,
            quantidade: sugestao.quantidadeSugerida,
            observacao: `Remanejamento sugerido pelo painel (${sugestao.distanciaKm} km)`,
          }),
        }),
      () => `${sugestao.quantidadeSugerida} ${sugestao.unidadeMedida} de ${sugestao.item} enviados para ${sugestao.abrigoParceiro}.`,
      false,
    );

  const alterarStatusItem = (idItem: number, statusNecessidade: StatusNecessidade) =>
    void executar(
      () => api(`${base}/estoque/${idItem}`, { method: "PATCH", body: JSON.stringify({ statusNecessidade }) }),
      () => `Pedido de doação alterado para ${ROTULO_NECESSIDADE[statusNecessidade].toLowerCase()}.`,
      false,
    );

  function alternarPerfil(campo: "aceitaPets" | "acessivelPcd") {
    const ligado = !dados?.abrigo[campo];
    const rotulo = campo === "aceitaPets" ? "Aceita pets" : "Acessível";
    void executar(
      () => api(base, { method: "PATCH", body: JSON.stringify({ [campo]: ligado }) }),
      () => `"${rotulo}" ${ligado ? "ligado" : "desligado"} no mapa público.`,
    );
  }

  return (
    <div className="space-y-6">
      <ToastFlutuante erro={erro} aviso={aviso} aoFecharErro={() => setErro(null)} aoFecharAviso={() => setAviso(null)} />

      <CabecalhoPagina titulo="Visão geral" descricao={abrigoAtivo?.endereco}>
        {podeOperar && (
          <Botao disabled={somenteLeitura} onClick={() => setEditandoAbrigo(true)}>
            Dados do abrigo
          </Botao>
        )}
        <BotaoIcone icone={RefreshCw} rotulo="Atualizar indicadores" onClick={() => void carregar()} />
      </CabecalhoPagina>

      <FaixaAvisosOficiais onAviso={setAviso} onErro={setErro} />

      {reportesPendentes > 0 && (
        <Faixa
          acoes={
            <Link href="/admin/ocorrencias" className={classesBotao("secundaria", "sm")}>
              Revisar
            </Link>
          }
        >
          {reportesPendentes === 1 ? "1 reporte de morador aguarda" : `${reportesPendentes} reportes de moradores aguardam`} revisão. Aprove para publicar no
          mapa ou descarte se for alarme falso.
        </Faixa>
      )}

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 xl:grid-cols-2">
        <SecaoOcupacao ocupacao={ocupacao} acolhidos={acolhidos} bloqueado={bloqueado} onAjustarFila={podeOperar ? ajustarFila : undefined} />
        <SecaoInfraestrutura ocorrencias={ocorrenciasAtivas} bloqueado={bloqueado} onResolver={resolverOcorrencia} onAlternarAlerta={alternarAlerta} />
      </div>

      {sugestoes.length > 0 && <SecaoSugestoes sugestoes={sugestoes} bloqueado={bloqueado} onEnviar={enviarSugestao} />}

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SecaoEstoqueEmAlerta
            itens={estoque.itensCriticos}
            totalUrgentes={estoque.itensUrgentes}
            totalBloqueados={estoque.itensBloqueados}
            bloqueado={bloqueado}
            onAlterarStatus={podeClassificar ? alterarStatusItem : undefined}
          />
        </div>
        <SecaoMovimentacoes movimentacoes={dados.ultimasMovimentacoes} />
      </div>

      {editandoAbrigo && (
        <ModalAbrigo
          capacidade={ocupacao.capacidadeMaxima}
          lotacaoAtual={ocupacao.lotacaoAtual}
          telefone={abrigoAtivo?.telefone ?? null}
          aceitaPets={Boolean(dados.abrigo.aceitaPets)}
          acessivelPcd={Boolean(dados.abrigo.acessivelPcd)}
          salvando={processando}
          onAlternarPerfil={alternarPerfil}
          onFechar={() => setEditandoAbrigo(false)}
          onSalvar={(novosDados) =>
            void executar(
              () => api(base, { method: "PATCH", body: JSON.stringify(novosDados) }),
              () => "Capacidade e contato atualizados.",
            ).then((ok) => ok && setEditandoAbrigo(false))
          }
        />
      )}
    </div>
  );
}
