"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Ellipsis, Pencil } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { ModalConfirmacao } from "@/components/ui/modal";
import { Secao } from "@/components/ui/pagina";
import { SeloStatus } from "@/components/ui/selo-status";
import { api } from "@/lib/cliente-api";
import { useAdmin, type AbrigoAdmin } from "../contexto-admin";
import { ROTULO_STATUS_INFRA } from "../rotulos";
import type { Acao } from "../use-acao";

const SeletorPontoMapa = dynamic(() => import("@/components/seletor-ponto-mapa"), {
  ssr: false,
  loading: () => <div className="flex h-48 w-full items-center justify-center rounded-controle bg-superficie text-meta text-texto-3">Carregando mapa...</div>,
});

interface FormularioAbrigo {
  nome: string;
  endereco: string;
  telefone: string;
  chavePix: string;
  titularPix: string;
  latitude: string;
  longitude: string;
  capacidade: string;
  aceitaPets: boolean;
  acessivelPcd: boolean;
}

function formularioDe(abrigo: AbrigoAdmin | null): FormularioAbrigo {
  return {
    nome: abrigo?.nome ?? "",
    endereco: abrigo?.endereco ?? "",
    telefone: abrigo?.telefone ?? "",
    chavePix: abrigo?.chavePix ?? "",
    titularPix: abrigo?.titularPix ?? "",
    latitude: String(abrigo?.latitude ?? -28.262),
    longitude: String(abrigo?.longitude ?? -52.4083),
    capacidade: String(abrigo?.capacidadeMaxima ?? 100),
    aceitaPets: Boolean(abrigo?.aceitaPets),
    acessivelPcd: Boolean(abrigo?.acessivelPcd),
  };
}

/** Cadastro e manutenção dos abrigos da rede (só a administração geral). */
export function AbaAbrigos({ acao }: { acao: Acao }) {
  const router = useRouter();
  const { abrigos, recarregarAbrigos, selecionarAbrigo } = useAdmin();
  const [editando, setEditando] = useState<AbrigoAdmin | null>(null);
  const [form, setForm] = useState<FormularioAbrigo>(() => formularioDe(null));
  const [arquivando, setArquivando] = useState<AbrigoAdmin | null>(null);

  const alterar = (campos: Partial<FormularioAbrigo>) => setForm((atual) => ({ ...atual, ...campos }));

  function abrirFormulario(abrigo: AbrigoAdmin | null) {
    setEditando(abrigo);
    setForm(formularioDe(abrigo));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const corpo = {
      nome: form.nome,
      endereco: form.endereco,
      telefone: form.telefone.trim() || null,
      chavePix: form.chavePix.trim() || null,
      titularPix: form.titularPix.trim() || null,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      capacidadeMaxima: Number(form.capacidade),
      aceitaPets: form.aceitaPets,
      acessivelPcd: form.acessivelPcd,
    };
    const salvo = await acao.executar(
      async () => {
        if (editando) await api(`/api/abrigos/${editando.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
        else await api("/api/abrigos", { method: "POST", body: JSON.stringify(corpo) });
        await recarregarAbrigos();
      },
      editando ? `${form.nome} atualizado.` : `${form.nome} cadastrado.`,
    );
    if (salvo) abrirFormulario(null);
  }

  const alternarAtivo = (abrigo: AbrigoAdmin) =>
    acao.executar(
      async () => {
        await api(`/api/abrigos/${abrigo.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !abrigo.ativo }) });
        await recarregarAbrigos();
      },
      `${abrigo.nome} ${abrigo.ativo ? "arquivado" : "reativado"}.`,
    );

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
      <Secao
        titulo={editando ? `Editar ${editando.nome}` : "Novo abrigo"}
        className="lg:col-span-5"
        acoes={
          editando && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => abrirFormulario(null)}>
              Cancelar edição
            </Botao>
          )
        }
      >
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome">
            <input type="text" required value={form.nome} onChange={(e) => alterar({ nome: e.target.value })} className={CLASSES_CAMPO} />
          </Campo>
          <Campo rotulo="Endereço completo">
            <input type="text" required value={form.endereco} onChange={(e) => alterar({ endereco: e.target.value })} className={CLASSES_CAMPO} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Telefone (opcional)">
              <input type="tel" value={form.telefone} onChange={(e) => alterar({ telefone: e.target.value })} className={CLASSES_CAMPO} />
            </Campo>
            <Campo rotulo="Capacidade (vagas)">
              <input
                type="number"
                min={1}
                required
                value={form.capacidade}
                onChange={(e) => alterar({ capacidade: e.target.value })}
                className={`${CLASSES_CAMPO} tabular-nums`}
              />
            </Campo>
          </div>

          <div className="space-y-2 border-t border-borda pt-4">
            <p className="text-meta font-medium text-texto-2">Local no mapa</p>
            <SeletorPontoMapa
              latitude={form.latitude.trim() !== "" ? Number(form.latitude) : null}
              longitude={form.longitude.trim() !== "" ? Number(form.longitude) : null}
              aoSelecionarCoordenada={(lat, lng) => alterar({ latitude: String(lat), longitude: String(lng) })}
              alturaClasse="h-48"
            />
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Latitude">
                <input
                  type="number"
                  step="any"
                  required
                  value={form.latitude}
                  onChange={(e) => alterar({ latitude: e.target.value })}
                  className={`${CLASSES_CAMPO} tabular-nums`}
                />
              </Campo>
              <Campo rotulo="Longitude">
                <input
                  type="number"
                  step="any"
                  required
                  value={form.longitude}
                  onChange={(e) => alterar({ longitude: e.target.value })}
                  className={`${CLASSES_CAMPO} tabular-nums`}
                />
              </Campo>
            </div>
          </div>

          <div className="space-y-3 border-t border-borda pt-4">
            <p className="text-meta font-medium text-texto-2">Doações por PIX (opcional)</p>
            <Campo rotulo="Chave PIX" dica="E-mail, CNPJ ou telefone. Só a administração geral altera.">
              <input type="text" value={form.chavePix} onChange={(e) => alterar({ chavePix: e.target.value })} className={CLASSES_CAMPO} />
            </Campo>
            <Campo rotulo="Titular da conta">
              <input type="text" value={form.titularPix} onChange={(e) => alterar({ titularPix: e.target.value })} className={CLASSES_CAMPO} />
            </Campo>
          </div>

          <div className="space-y-2 border-t border-borda pt-4">
            <p className="text-meta font-medium text-texto-2">O que aparece no mapa público</p>
            <div className="flex flex-wrap gap-2">
              <Chip ativo={form.aceitaPets} onClick={() => alterar({ aceitaPets: !form.aceitaPets })}>
                Aceita pets
              </Chip>
              <Chip ativo={form.acessivelPcd} onClick={() => alterar({ acessivelPcd: !form.acessivelPcd })}>
                Acessível
              </Chip>
            </div>
          </div>

          <Botao type="submit" variante="primaria" disabled={acao.enviando} className="w-full">
            {editando ? "Salvar alterações" : "Cadastrar abrigo"}
          </Botao>
        </form>
      </Secao>

      <Secao titulo="Abrigos da rede" className="lg:col-span-7">
        <ul className="border-t border-borda">
          {abrigos.map((abrigo) => (
            <li key={abrigo.id} className="flex items-center gap-3 border-b border-borda py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-corpo font-medium text-texto">{abrigo.nome}</p>
                <p className="truncate text-meta text-texto-3">{abrigo.endereco}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-texto-3 tabular-nums">
                  {!abrigo.ativo && <SeloStatus nivel="neutro">Arquivado</SeloStatus>}
                  <span>
                    {abrigo.ocupacao.lotacaoAtual} de {abrigo.ocupacao.capacidadeMaxima} vagas ocupadas
                  </span>
                  {abrigo.statusInfraestrutura !== "NORMAL" && (
                    <SeloStatus nivel={abrigo.statusInfraestrutura === "CRITICO" ? "critico" : "atencao"}>
                      Infraestrutura: {ROTULO_STATUS_INFRA[abrigo.statusInfraestrutura].toLowerCase()}
                    </SeloStatus>
                  )}
                  <span>{abrigo.chavePix ? "Com PIX" : "Sem PIX"}</span>
                </p>
              </div>
              <Botao
                tamanho="sm"
                onClick={() => {
                  selecionarAbrigo(abrigo.id);
                  router.push("/admin/dashboard");
                }}
                className="max-sm:hidden"
              >
                Abrir painel
              </Botao>
              <Menu rotulo={`Ações para ${abrigo.nome}`} icone={Ellipsis}>
                <ItemMenu icone={Pencil} onClick={() => abrirFormulario(abrigo)}>
                  Editar
                </ItemMenu>
                {abrigo.ativo ? (
                  <ItemMenu icone={Archive} onClick={() => setArquivando(abrigo)}>
                    Arquivar
                  </ItemMenu>
                ) : (
                  <ItemMenu icone={ArchiveRestore} onClick={() => void alternarAtivo(abrigo)}>
                    Reativar
                  </ItemMenu>
                )}
              </Menu>
            </li>
          ))}
        </ul>
      </Secao>

      {arquivando && (
        <ModalConfirmacao
          titulo={`Arquivar ${arquivando.nome}`}
          rotuloConfirmar="Arquivar abrigo"
          salvando={acao.enviando}
          onFechar={() => setArquivando(null)}
          onConfirmar={() => void alternarAtivo(arquivando).then((ok) => ok && setArquivando(null))}
        >
          O abrigo sai do mapa público e fica somente para consulta no painel. Você pode reativá-lo depois.
        </ModalConfirmacao>
      )}
    </div>
  );
}
