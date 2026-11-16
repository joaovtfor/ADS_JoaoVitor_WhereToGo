"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { api, mensagemErro } from "@/lib/cliente-api";
import type { AbrigoAdmin } from "../contexto-admin";
import { formatarMomento, MOTIVOS_SAIDA, type Abrigado, type TransferenciaHistorico } from "./tipos";

interface PropriedadesBase {
  abrigado: Abrigado;
  salvando: boolean;
  onFechar: () => void;
}

/** Confirmação obrigatória: dar saída encerra o acolhimento e libera a vaga (DESIGN.md §5.5). */
export function ModalSaida({ abrigado, salvando, onConfirmar, onFechar }: PropriedadesBase & { onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_SAIDA[0]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onConfirmar(motivo.trim() || "Saída registrada no painel");
  }

  return (
    <Modal titulo={`Dar saída a ${abrigado.nomeCompleto}`} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-meta text-texto-2">Encerra o acolhimento e libera uma vaga no abrigo. O histórico da pessoa continua salvo.</p>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_SAIDA.map((opcao) => (
            <Chip key={opcao} ativo={motivo === opcao} onClick={() => setMotivo(opcao)}>
              {opcao}
            </Chip>
          ))}
        </div>
        <Campo rotulo="Motivo da saída">
          <input type="text" required value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASSES_CAMPO} />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="perigo" disabled={salvando}>
            {salvando ? "Confirmando..." : "Confirmar saída"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

interface PropriedadesModalTransferencia extends PropriedadesBase {
  /** Abrigos ativos com vaga, sem contar o atual. */
  abrigosDestino: AbrigoAdmin[];
  onConfirmar: (dados: { idAbrigoDestino: number; motivo: string }) => void;
}

export function ModalTransferenciaAcolhido({ abrigado, abrigosDestino, salvando, onConfirmar, onFechar }: PropriedadesModalTransferencia) {
  const [idDestino, setIdDestino] = useState<number | "">(abrigosDestino[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (idDestino) onConfirmar({ idAbrigoDestino: Number(idDestino), motivo });
  }

  return (
    <Modal titulo={`Transferir ${abrigado.nomeCompleto}`} onFechar={onFechar}>
      {abrigosDestino.length === 0 ? (
        <div className="space-y-4">
          <p className="text-corpo text-texto-2">Nenhum outro abrigo ativo tem vaga disponível agora.</p>
          <div className="flex justify-end">
            <Botao onClick={onFechar}>Fechar</Botao>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo rotulo="Abrigo de destino">
            <select required value={idDestino} onChange={(e) => setIdDestino(Number(e.target.value))} className={CLASSES_CAMPO}>
              {abrigosDestino.map((abrigo) => (
                <option key={abrigo.id} value={abrigo.id}>
                  {abrigo.nome} ({abrigo.ocupacao.vagasDisponiveis} vagas livres)
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Motivo da transferência">
            <input
              type="text"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Reunificação familiar"
              className={CLASSES_CAMPO}
            />
          </Campo>
          <div className="flex justify-end gap-2 pt-1">
            <Botao variante="fantasma" onClick={onFechar}>
              Cancelar
            </Botao>
            <Botao type="submit" variante="primaria" disabled={salvando}>
              {salvando ? "Transferindo..." : "Transferir"}
            </Botao>
          </div>
        </form>
      )}
    </Modal>
  );
}

interface PropriedadesModalEdicao extends PropriedadesBase {
  onSalvar: (dados: { nomeCompleto: string; cpf: string | null; dataNascimento: string | null }) => void;
}

export function ModalEdicao({ abrigado, salvando, onSalvar, onFechar }: PropriedadesModalEdicao) {
  const [nome, setNome] = useState(abrigado.nomeCompleto);
  const [cpf, setCpf] = useState(abrigado.cpf ?? "");
  const [nascimento, setNascimento] = useState(abrigado.dataNascimento?.slice(0, 10) ?? "");

  function enviar(e: FormEvent) {
    e.preventDefault();
    onSalvar({ nomeCompleto: nome, cpf: cpf.trim() || null, dataNascimento: nascimento || null });
  }

  return (
    <Modal titulo="Editar cadastro" onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome completo">
          <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} className={CLASSES_CAMPO} />
        </Campo>
        <Campo rotulo="CPF (opcional)">
          <input type="text" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} className={`${CLASSES_CAMPO} tabular-nums`} />
        </Campo>
        <Campo rotulo="Data de nascimento (opcional)">
          <input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={CLASSES_CAMPO} />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primaria" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

/** Por onde a pessoa passou: busca as transferências ao abrir. */
export function ModalHistorico({ abrigado, onFechar }: { abrigado: Abrigado; onFechar: () => void }) {
  const [estado, setEstado] = useState<{ lista: TransferenciaHistorico[] } | { erro: string } | null>(null);

  useEffect(() => {
    let ativo = true;
    api<TransferenciaHistorico[]>(`/api/abrigados/${abrigado.id}/transferencias`)
      .then((lista) => {
        if (ativo) setEstado({ lista });
      })
      .catch((err) => {
        if (ativo) setEstado({ erro: mensagemErro(err) });
      });
    return () => {
      ativo = false;
    };
  }, [abrigado.id]);

  return (
    <Modal titulo={`Transferências de ${abrigado.nomeCompleto}`} onFechar={onFechar}>
      {estado === null ? (
        <p className="text-corpo text-texto-2">Carregando...</p>
      ) : "erro" in estado ? (
        <p role="alert" className="rounded-controle bg-critico/12 p-3 text-meta text-critico-claro">
          {estado.erro}
        </p>
      ) : estado.lista.length === 0 ? (
        <p className="text-corpo text-texto-2">Nenhuma transferência registrada para esta pessoa.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {estado.lista.map((transferencia) => (
            <li key={transferencia.id} className="border-b border-borda py-3 first:pt-0 last:border-b-0">
              <p className="text-corpo text-texto">
                De {transferencia.abrigoOrigem} para {transferencia.abrigoDestino}
              </p>
              <p className="mt-0.5 text-meta text-texto-2">{transferencia.motivo}</p>
              <p className="mt-0.5 text-meta text-texto-3 tabular-nums">
                {formatarMomento(transferencia.dataTransferencia)} · autorizado por {transferencia.usuario}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
