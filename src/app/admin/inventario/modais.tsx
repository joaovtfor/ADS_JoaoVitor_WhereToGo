"use client";

import { useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import type { AbrigoAdmin } from "../contexto-admin";
import { MOTIVOS_LOTE, type ItemEstoque } from "./tipos";

function Saldo({ item }: { item: ItemEstoque }) {
  return (
    <p className="text-meta text-texto-3 tabular-nums">
      Saldo atual: <span className="text-texto">{item.quantidade}</span> {item.unidadeMedida}
    </p>
  );
}

function AcoesFormulario({ rotuloSalvar, salvando, onCancelar }: { rotuloSalvar: string; salvando: boolean; onCancelar: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Botao variante="fantasma" onClick={onCancelar}>
        Cancelar
      </Botao>
      <Botao type="submit" variante="primaria" disabled={salvando}>
        {salvando ? "Salvando..." : rotuloSalvar}
      </Botao>
    </div>
  );
}

interface PropriedadesModalLote {
  item: ItemEstoque;
  onLancar: (delta: number, motivo: string) => void;
  onFechar: () => void;
}

/** Lançamento em lote só com toques (sem teclado): motivo e quantidade. */
export function ModalLote({ item, onLancar, onFechar }: PropriedadesModalLote) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_LOTE[0]);

  return (
    <Modal titulo={`Lote: ${item.nome}`} onFechar={onFechar}>
      <div className="space-y-4">
        <Saldo item={item} />

        <div className="space-y-2">
          <p className="text-meta font-medium text-texto-2">Motivo</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_LOTE.map((opcao) => (
              <Chip key={opcao} ativo={motivo === opcao} onClick={() => setMotivo(opcao)}>
                {opcao}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2 tabular-nums">
          <p className="text-meta font-medium text-texto-2">Entrada</p>
          <div className="grid grid-cols-4 gap-2">
            {[10, 20, 50, 100].map((quantidade) => (
              <Botao key={quantidade} disabled={!item.itemAtivo} onClick={() => onLancar(quantidade, motivo)}>
                +{quantidade}
              </Botao>
            ))}
          </div>
          <p className="pt-1 text-meta font-medium text-texto-2">Saída</p>
          <div className="grid grid-cols-4 gap-2">
            {[10, 20, 50].map((quantidade) => (
              <Botao key={quantidade} disabled={item.quantidade < quantidade} onClick={() => onLancar(-quantidade, motivo)}>
                −{quantidade}
              </Botao>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface PropriedadesModalConfig {
  item: ItemEstoque;
  salvando: boolean;
  onSalvar: (dados: { minimo: number; contagem: number | null; justificativa: string }) => void;
  onFechar: () => void;
}

/** Estoque mínimo e correção do saldo pela contagem física. */
export function ModalConfig({ item, salvando, onSalvar, onFechar }: PropriedadesModalConfig) {
  const [minimo, setMinimo] = useState(String(item.quantidadeMinima));
  const [contagem, setContagem] = useState(String(item.quantidade));
  const [justificativa, setJustificativa] = useState("");
  const contagemMudou = contagem.trim() !== "" && Number(contagem) !== item.quantidade;

  function enviar(e: FormEvent) {
    e.preventDefault();
    onSalvar({ minimo: Number(minimo), contagem: contagem.trim() === "" ? null : Number(contagem), justificativa });
  }

  return (
    <Modal titulo={item.nome} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo={`Estoque mínimo (${item.unidadeMedida})`} dica="Abaixo disso o item aparece como abaixo do mínimo.">
          <input type="number" min={0} required value={minimo} onChange={(e) => setMinimo(e.target.value)} className={`${CLASSES_CAMPO} tabular-nums`} />
        </Campo>
        <Campo rotulo="Contagem física" dica={`O sistema registra ${item.quantidade}. Altere só se a contagem no depósito for diferente.`}>
          <input type="number" min={0} value={contagem} onChange={(e) => setContagem(e.target.value)} className={`${CLASSES_CAMPO} tabular-nums`} />
        </Campo>
        {contagemMudou && (
          <Campo rotulo="Motivo da correção">
            <input type="text" required value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className={CLASSES_CAMPO} />
          </Campo>
        )}
        <AcoesFormulario rotuloSalvar="Salvar" salvando={salvando} onCancelar={onFechar} />
      </form>
    </Modal>
  );
}

interface PropriedadesModalTransferencia {
  item: ItemEstoque;
  abrigosDestino: AbrigoAdmin[];
  salvando: boolean;
  onTransferir: (dados: { idAbrigoDestino: number; quantidade: number; observacao: string }) => void;
  onFechar: () => void;
}

export function ModalTransferencia({ item, abrigosDestino, salvando, onTransferir, onFechar }: PropriedadesModalTransferencia) {
  const [idDestino, setIdDestino] = useState<number | "">(abrigosDestino[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!idDestino) return;
    onTransferir({ idAbrigoDestino: Number(idDestino), quantidade: Number(quantidade), observacao });
  }

  return (
    <Modal titulo={`Transferir ${item.nome}`} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Saldo item={item} />
        <Campo rotulo="Abrigo de destino">
          <select required value={idDestino} onChange={(e) => setIdDestino(Number(e.target.value))} className={CLASSES_CAMPO}>
            {abrigosDestino.map((abrigo) => (
              <option key={abrigo.id} value={abrigo.id}>
                {abrigo.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={`Quantidade (${item.unidadeMedida})`}>
          <input
            type="number"
            min={1}
            max={item.quantidade}
            required
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={`${CLASSES_CAMPO} tabular-nums`}
          />
        </Campo>
        <Campo rotulo="Motivo">
          <input
            type="text"
            required
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Apoio emergencial ao abrigo vizinho"
            className={CLASSES_CAMPO}
          />
        </Campo>
        <AcoesFormulario rotuloSalvar="Transferir" salvando={salvando} onCancelar={onFechar} />
      </form>
    </Modal>
  );
}
