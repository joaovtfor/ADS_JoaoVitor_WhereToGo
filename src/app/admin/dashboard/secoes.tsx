"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { juntarClasses } from "@/components/ui/classes";
import { Modal } from "@/components/ui/modal";
import { Secao } from "@/components/ui/pagina";
import { SeloStatus, type NivelStatus } from "@/components/ui/selo-status";
import type { NivelOcupacao } from "../contexto-admin";
import { ROTULO_GRAVIDADE, ROTULO_NECESSIDADE, ROTULO_TIPO_MOVIMENTACAO, rotuloOcorrencia } from "../rotulos";
import {
  ALERTAS_RAPIDOS,
  type FluxoAcolhidos,
  type ItemCritico,
  type MovimentacaoRecente,
  type OcorrenciaAtiva,
  type Ocupacao,
  type StatusNecessidade,
  type SugestaoTransferencia,
} from "./tipos";

const STATUS_OCUPACAO: Record<NivelOcupacao, { nivel: NivelStatus; rotulo: string; barra: string }> = {
  VERDE: { nivel: "ok", rotulo: "Com vagas", barra: "bg-ok" },
  AMARELO: { nivel: "atencao", rotulo: "Quase cheio", barra: "bg-atencao" },
  VERMELHO: { nivel: "critico", rotulo: "Lotado", barra: "bg-critico" },
};

const CLASSES_BLOCO = "border-t border-borda pt-5";

function Indicador({ rotulo, valor, complemento }: { rotulo: string; valor: number; complemento?: string }) {
  return (
    <div>
      <dt className="text-meta text-texto-3">{rotulo}</dt>
      <dd className="mt-0.5 tabular-nums">
        <span className="text-numero font-semibold text-texto">{valor}</span>
        {complemento && <span className="text-meta text-texto-3"> {complemento}</span>}
      </dd>
    </div>
  );
}

interface PropriedadesSecaoOcupacao {
  ocupacao: Ocupacao;
  acolhidos: FluxoAcolhidos;
  bloqueado: boolean;
  onAjustarFila: (delta: number) => void;
}

/** Lotação do abrigo e a fila de quem chegou e ainda não foi cadastrado. */
export function SecaoOcupacao({ ocupacao, acolhidos, bloqueado, onAjustarFila }: PropriedadesSecaoOcupacao) {
  const status = STATUS_OCUPACAO[ocupacao.nivel];

  return (
    <Secao titulo="Ocupação" className={CLASSES_BLOCO} acoes={<SeloStatus nivel={status.nivel}>{`${status.rotulo} · ${ocupacao.percentual.toLocaleString("pt-BR")}% ocupado`}</SeloStatus>}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-2">
        <div className={juntarClasses("h-full", status.barra)} style={{ width: `${Math.min(100, ocupacao.percentual)}%` }} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Indicador rotulo="Lotação" valor={ocupacao.lotacaoAtual} complemento={`de ${ocupacao.capacidadeMaxima}`} />
        <Indicador rotulo="Vagas livres" valor={ocupacao.vagasDisponiveis} />
        <Indicador rotulo="Cadastrados" valor={acolhidos.presentes} />
        <Indicador rotulo="Aguardando cadastro" valor={acolhidos.naoTriados} />
      </dl>

      <div className="space-y-2 pt-2">
        <p className="text-meta text-texto-2">
          Chegou um grupo? Reserve as vagas agora; o mapa público atualiza na hora e o cadastro de cada pessoa fica para depois.
        </p>
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          {[-5, -1, 1, 5, 10].map((delta) => (
            <Botao
              key={delta}
              disabled={bloqueado || (delta < 0 && acolhidos.naoTriados === 0) || (delta > 0 && ocupacao.vagasDisponiveis < delta)}
              onClick={() => onAjustarFila(delta)}
              className="flex-1"
            >
              {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
            </Botao>
          ))}
          <Link href="/admin/abrigados" className={classesBotao("fantasma")}>
            Fazer check-in
          </Link>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-texto-3 tabular-nums">
        <span>Últimas 24 h:</span>
        <span>{acolhidos.entradas24h} entradas</span>
        <span>{acolhidos.desligados24h} saídas</span>
        <span>{acolhidos.recebidas24h} recebidos</span>
        <span>{acolhidos.enviadas24h} transferidos</span>
      </p>
    </Secao>
  );
}

interface PropriedadesSecaoInfra {
  ocorrencias: OcorrenciaAtiva[];
  bloqueado: boolean;
  onResolver: (idOcorrencia: number) => void;
  onAlternarAlerta: (tipo: string) => void;
}

/** Alertas ativos de energia, água e acesso, com atalhos para ligar e desligar os mais comuns. */
export function SecaoInfraestrutura({ ocorrencias, bloqueado, onResolver, onAlternarAlerta }: PropriedadesSecaoInfra) {
  return (
    <Secao
      titulo="Infraestrutura e acesso"
      descricao="Alertas ativos aparecem para a população no mapa público."
      className={CLASSES_BLOCO}
      acoes={
        <Link href="/admin/ocorrencias" className={classesBotao("fantasma", "sm")}>
          Ver detalhes
        </Link>
      }
    >
      {ocorrencias.length === 0 ? (
        <SeloStatus nivel="ok">Energia, água e vias de acesso normais</SeloStatus>
      ) : (
        <ul>
          {ocorrencias.map((ocorrencia) => (
            <li key={ocorrencia.id} className="flex items-start justify-between gap-3 border-b border-borda py-3 first:pt-0 last:border-b-0">
              <div className="min-w-0">
                <p className="text-corpo text-texto">{rotuloOcorrencia(ocorrencia.tipo)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-texto-3">
                  <SeloStatus nivel={ocorrencia.gravidade === "CRITICO" ? "critico" : "atencao"}>{ROTULO_GRAVIDADE[ocorrencia.gravidade]}</SeloStatus>
                  {ocorrencia.descricao && <span>{ocorrencia.descricao}</span>}
                </p>
              </div>
              <Botao tamanho="sm" disabled={bloqueado} onClick={() => onResolver(ocorrencia.id)}>
                Resolver
              </Botao>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 pt-2">
        <p className="text-meta text-texto-3">Ligar ou desligar um alerta</p>
        <div className="flex flex-wrap gap-2">
          {ALERTAS_RAPIDOS.map((alerta) => (
            <Chip
              key={alerta.tipo}
              ativo={ocorrencias.some((o) => o.tipo === alerta.tipo)}
              disabled={bloqueado}
              onClick={() => onAlternarAlerta(alerta.tipo)}
            >
              {alerta.rotulo}
            </Chip>
          ))}
        </div>
      </div>
    </Secao>
  );
}

interface PropriedadesSecaoSugestoes {
  sugestoes: SugestaoTransferencia[];
  bloqueado: boolean;
  onEnviar: (sugestao: SugestaoTransferencia) => void;
}

/** Trocas possíveis com abrigos próximos: quem tem sobra do que falta aqui, e o contrário. */
export function SecaoSugestoes({ sugestoes, bloqueado, onEnviar }: PropriedadesSecaoSugestoes) {
  return (
    <Secao titulo="Trocas com abrigos próximos" descricao="Itens em falta aqui que sobram em um vizinho, e itens que sobram aqui e faltam lá." className={CLASSES_BLOCO}>
      <ul>
        {sugestoes.map((s, indice) => (
          <li
            key={`${s.direcao}-${s.idItem}-${s.idAbrigoParceiro}-${indice}`}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-borda py-3 first:pt-0 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-corpo text-texto">
                {s.direcao === "ENVIAR" ? "Enviar" : "Pedir"}{" "}
                <span className="tabular-nums">
                  {s.quantidadeSugerida} {s.unidadeMedida}
                </span>{" "}
                de {s.item} {s.direcao === "ENVIAR" ? "para" : "a"} {s.abrigoParceiro}
              </p>
              <p className="mt-0.5 text-meta text-texto-3 tabular-nums">
                {s.direcao === "ENVIAR"
                  ? `Eles têm ${s.quantidadeParceiro} e você tem ${s.quantidadeAtual}`
                  : `Você tem ${s.quantidadeAtual} e eles têm ${s.quantidadeParceiro}`}
                {" · "}
                {s.distanciaKm} km
                {s.telefoneParceiro && ` · ${s.telefoneParceiro}`}
              </p>
            </div>
            {s.direcao === "ENVIAR" ? (
              <Botao tamanho="sm" disabled={bloqueado} onClick={() => onEnviar(s)}>
                Enviar agora
              </Botao>
            ) : (
              <Link href="/admin/inventario" className={classesBotao("fantasma", "sm")}>
                Ver no estoque
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function statusDoItemCritico(item: ItemCritico): { nivel: NivelStatus; rotulo: string } {
  if (item.statusNecessidade === "URGENTE") return { nivel: "critico", rotulo: "Urgente" };
  if (item.statusNecessidade === "BLOQUEADO") return { nivel: "neutro", rotulo: "Doações bloqueadas" };
  return { nivel: "atencao", rotulo: "Abaixo do mínimo" };
}

interface PropriedadesSecaoEstoque {
  itens: ItemCritico[];
  totalUrgentes: number;
  totalBloqueados: number;
  bloqueado: boolean;
  onAlterarStatus: (idItem: number, status: StatusNecessidade) => void;
}

/** Itens urgentes ou abaixo do mínimo, com o pedido de doação que aparece no mapa. */
export function SecaoEstoqueEmAlerta({ itens, totalUrgentes, totalBloqueados, bloqueado, onAlterarStatus }: PropriedadesSecaoEstoque) {
  return (
    <Secao
      titulo="Estoque em alerta"
      descricao={`Urgentes: ${totalUrgentes}. Bloqueados: ${totalBloqueados}. Itens urgentes aparecem em destaque para doadores no mapa.`}
      className={CLASSES_BLOCO}
      acoes={
        <Link href="/admin/inventario" className={classesBotao("fantasma", "sm")}>
          Abrir estoque
        </Link>
      }
    >
      {itens.length === 0 ? (
        <SeloStatus nivel="ok">Todos os itens estão acima do mínimo e sem pedido urgente</SeloStatus>
      ) : (
        <ul>
          {itens.map((item) => {
            const status = statusDoItemCritico(item);
            return (
              <li key={item.idItem} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-borda py-3 first:pt-0 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-corpo text-texto">{item.nome}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-texto-3 tabular-nums">
                    <SeloStatus nivel={status.nivel}>{status.rotulo}</SeloStatus>
                    <span>
                      {item.quantidade} {item.unidadeMedida} em estoque, mínimo {item.quantidadeMinima}
                    </span>
                  </p>
                </div>
                <select
                  aria-label={`Pedido de doação de ${item.nome}`}
                  value={item.statusNecessidade}
                  disabled={bloqueado}
                  onChange={(e) => onAlterarStatus(item.idItem, e.target.value as StatusNecessidade)}
                  className={`${CLASSES_CAMPO} sm:w-36`}
                >
                  {(["URGENTE", "NORMAL", "BLOQUEADO"] as const).map((necessidade) => (
                    <option key={necessidade} value={necessidade}>
                      {ROTULO_NECESSIDADE[necessidade]}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

export function SecaoMovimentacoes({ movimentacoes }: { movimentacoes: MovimentacaoRecente[] }) {
  return (
    <Secao titulo="Últimas movimentações" className={CLASSES_BLOCO}>
      {movimentacoes.length === 0 ? (
        <p className="text-corpo text-texto-2">Nenhuma movimentação registrada neste abrigo.</p>
      ) : (
        <ul>
          {movimentacoes.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 border-b border-borda py-2.5 first:pt-0 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-corpo text-texto">{m.item}</p>
                <p className="truncate text-meta text-texto-3">
                  {ROTULO_TIPO_MOVIMENTACAO[m.tipo] ?? "Movimentação"} · {m.usuario}
                </p>
              </div>
              <p className="shrink-0 text-right tabular-nums">
                <span className="text-corpo text-texto">{m.quantidade > 0 ? `+${m.quantidade}` : `−${Math.abs(m.quantidade)}`}</span>
                <span className="block text-meta text-texto-3">saldo {m.quantidadeResultante}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

interface PropriedadesModalAbrigo {
  capacidade: number;
  lotacaoAtual: number;
  telefone: string | null;
  aceitaPets: boolean;
  acessivelPcd: boolean;
  salvando: boolean;
  onAlternarPerfil: (campo: "aceitaPets" | "acessivelPcd") => void;
  onSalvar: (dados: { capacidadeMaxima: number; telefone: string | null }) => void;
  onFechar: () => void;
}

/** Dados do abrigo que a coordenação ajusta no dia a dia: capacidade, contato e quem ele recebe. */
export function ModalAbrigo({ capacidade, lotacaoAtual, telefone, aceitaPets, acessivelPcd, salvando, onAlternarPerfil, onSalvar, onFechar }: PropriedadesModalAbrigo) {
  const [novaCapacidade, setNovaCapacidade] = useState(String(capacidade));
  const [novoTelefone, setNovoTelefone] = useState(telefone ?? "");

  function enviar(e: FormEvent) {
    e.preventDefault();
    onSalvar({ capacidadeMaxima: Number(novaCapacidade), telefone: novoTelefone.trim() || null });
  }

  return (
    <Modal titulo="Dados do abrigo" onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="space-y-2">
          <p className="text-meta font-medium text-texto-2">O que aparece no mapa público</p>
          <div className="flex flex-wrap gap-2">
            <Chip ativo={aceitaPets} disabled={salvando} onClick={() => onAlternarPerfil("aceitaPets")}>
              Aceita pets
            </Chip>
            <Chip ativo={acessivelPcd} disabled={salvando} onClick={() => onAlternarPerfil("acessivelPcd")}>
              Acessível
            </Chip>
          </div>
        </div>
        <Campo rotulo="Capacidade máxima (vagas)" dica={`Não pode ser menor que a lotação atual (${lotacaoAtual}).`}>
          <input
            type="number"
            min={Math.max(1, lotacaoAtual)}
            required
            value={novaCapacidade}
            onChange={(e) => setNovaCapacidade(e.target.value)}
            className={`${CLASSES_CAMPO} tabular-nums`}
          />
        </Campo>
        <Campo rotulo="Telefone de emergência">
          <input type="tel" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} placeholder="(54) 99999-0000" className={CLASSES_CAMPO} />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <Botao variante="fantasma" onClick={onFechar}>
            Fechar
          </Botao>
          <Botao type="submit" variante="primaria" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
