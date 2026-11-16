"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Secao } from "@/components/ui/pagina";
import { api, mensagemErro } from "@/lib/cliente-api";
import type { Acao } from "../use-acao";
import type { CategoriaCatalogo, ItemCatalogo } from "./tipos";

/** Catálogo de itens que os abrigos podem ter em estoque (só a administração geral). */
export function AbaCatalogo({ acao }: { acao: Acao }) {
  const { executar, setErro } = acao;
  const [categorias, setCategorias] = useState<CategoriaCatalogo[]>([]);
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [idCategoria, setIdCategoria] = useState<number | "">("");
  const [nomeItem, setNomeItem] = useState("");
  const [unidade, setUnidade] = useState("unidade");

  const carregar = useCallback(async () => {
    try {
      const [listaCategorias, listaItens] = await Promise.all([api<CategoriaCatalogo[]>("/api/categorias"), api<ItemCatalogo[]>("/api/itens")]);
      setCategorias(listaCategorias);
      setItens(listaItens);
      // Mantém a categoria escolhida; na primeira carga, sugere a primeira da lista.
      setIdCategoria((atual) => atual || (listaCategorias[0]?.id ?? ""));
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }, [setErro]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  async function criarCategoria(e: FormEvent) {
    e.preventDefault();
    const criada = await executar(async () => {
      await api("/api/categorias", { method: "POST", body: JSON.stringify({ nome: nomeCategoria }) });
      await carregar();
    }, "Categoria criada.");
    if (criada) setNomeCategoria("");
  }

  async function criarItem(e: FormEvent) {
    e.preventDefault();
    if (!idCategoria) return;
    const criado = await executar(async () => {
      await api("/api/itens", { method: "POST", body: JSON.stringify({ idCategoria: Number(idCategoria), nome: nomeItem, unidadeMedida: unidade }) });
      await carregar();
    }, "Item adicionado ao catálogo.");
    if (criado) setNomeItem("");
  }

  const alternarAtivo = (item: ItemCatalogo) =>
    void executar(async () => {
      await api(`/api/itens/${item.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !item.ativo }) });
      await carregar();
    }, `${item.nome} ${item.ativo ? "desativado" : "ativado"}.`);

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
      <div className="space-y-8 lg:col-span-4">
        <Secao titulo="Novo item">
          <form onSubmit={criarItem} className="space-y-4">
            <Campo rotulo="Categoria">
              <select required value={idCategoria} onChange={(e) => setIdCategoria(Number(e.target.value))} className={CLASSES_CAMPO}>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Nome do item">
              <input type="text" required value={nomeItem} onChange={(e) => setNomeItem(e.target.value)} placeholder="Soro fisiológico 500 ml" className={CLASSES_CAMPO} />
            </Campo>
            <Campo rotulo="Unidade de medida" dica="Como o item é contado: unidade, pacote, kg, litro.">
              <input type="text" required value={unidade} onChange={(e) => setUnidade(e.target.value)} className={CLASSES_CAMPO} />
            </Campo>
            <Botao type="submit" variante="primaria" disabled={acao.enviando} className="w-full">
              Adicionar item
            </Botao>
          </form>
        </Secao>

        <Secao titulo="Nova categoria">
          <form onSubmit={criarCategoria} className="space-y-4">
            <Campo rotulo="Nome da categoria">
              <input
                type="text"
                required
                value={nomeCategoria}
                onChange={(e) => setNomeCategoria(e.target.value)}
                placeholder="Medicamentos contínuos"
                className={CLASSES_CAMPO}
              />
            </Campo>
            <Botao type="submit" disabled={acao.enviando} className="w-full">
              Criar categoria
            </Botao>
          </form>
        </Secao>
      </div>

      <Secao
        titulo="Itens do catálogo"
        descricao={<span className="tabular-nums">{itens.length === 1 ? "1 item" : `${itens.length} itens`}. Item desativado não recebe novas entradas.</span>}
        className="lg:col-span-8"
      >
        <ul className="border-t border-borda">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 border-b border-borda py-2.5">
              <div className="min-w-0">
                <p className="truncate text-corpo text-texto">{item.nome}</p>
                <p className="truncate text-meta text-texto-3">
                  {item.categoria} · {item.unidadeMedida}
                </p>
              </div>
              <Chip ativo={item.ativo} disabled={acao.enviando} onClick={() => alternarAtivo(item)}>
                {item.ativo ? "Ativo" : "Inativo"}
              </Chip>
            </li>
          ))}
        </ul>
      </Secao>
    </div>
  );
}
