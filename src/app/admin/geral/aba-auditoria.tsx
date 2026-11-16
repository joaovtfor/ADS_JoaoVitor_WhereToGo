"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { EstadoVazio, Secao } from "@/components/ui/pagina";
import { api, mensagemErro } from "@/lib/cliente-api";
import { useAdmin } from "../contexto-admin";
import type { Acao } from "../use-acao";
import type { LogAuditoria, PaginaAuditoria } from "./tipos";

interface Filtros {
  acao: string;
  idAbrigo: string;
  de: string;
  ate: string;
}

const SEM_FILTROS: Filtros = { acao: "", idAbrigo: "", de: "", ate: "" };

/** Registro permanente do que foi feito no sistema: as 80 ações mais recentes, com filtros. */
export function AbaAuditoria({ acao }: { acao: Acao }) {
  const { usuario, abrigos } = useAdmin();
  const ehAdmin = usuario.papel === "ADMIN";
  const { setErro } = acao;

  const [logs, setLogs] = useState<LogAuditoria[] | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const alterar = (campos: Partial<Filtros>) => setFiltros((atual) => ({ ...atual, ...campos }));

  // Busca ao abrir a aba e ao enviar o formulário (não a cada tecla).
  const carregar = useCallback(
    async (aplicar: Filtros) => {
      try {
        const params = new URLSearchParams({ tamanho: "80" });
        if (aplicar.acao.trim()) params.set("acao", aplicar.acao.trim().toUpperCase());
        if (ehAdmin && aplicar.idAbrigo) params.set("idAbrigo", aplicar.idAbrigo);
        if (aplicar.de) params.set("de", aplicar.de);
        if (aplicar.ate) params.set("ate", aplicar.ate);
        setLogs((await api<PaginaAuditoria>(`/api/auditoria?${params.toString()}`)).itens);
      } catch (err) {
        setErro(mensagemErro(err));
      }
    },
    [ehAdmin, setErro],
  );

  useEffect(() => {
    void Promise.resolve().then(() => carregar(SEM_FILTROS));
  }, [carregar]);

  function filtrar(e: FormEvent) {
    e.preventDefault();
    void carregar(filtros);
  }

  return (
    <Secao titulo="Auditoria" descricao="As 80 ações mais recentes registradas no sistema. O registro não pode ser alterado.">
      <form onSubmit={filtrar} className="flex flex-wrap items-end gap-2">
        {ehAdmin && (
          <Campo rotulo="Abrigo" className="w-full sm:w-52">
            <select value={filtros.idAbrigo} onChange={(e) => alterar({ idAbrigo: e.target.value })} className={CLASSES_CAMPO}>
              <option value="">Todos os abrigos</option>
              {abrigos.map((abrigo) => (
                <option key={abrigo.id} value={String(abrigo.id)}>
                  {abrigo.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Código da ação" className="w-full sm:w-52">
          <input type="text" value={filtros.acao} onChange={(e) => alterar({ acao: e.target.value })} placeholder="ESTOQUE_MOVIMENTADO" className={CLASSES_CAMPO} />
        </Campo>
        <Campo rotulo="De" className="flex-1 sm:w-40 sm:flex-none">
          <input type="date" value={filtros.de} onChange={(e) => alterar({ de: e.target.value })} className={CLASSES_CAMPO} />
        </Campo>
        <Campo rotulo="Até" className="flex-1 sm:w-40 sm:flex-none">
          <input type="date" value={filtros.ate} onChange={(e) => alterar({ ate: e.target.value })} className={CLASSES_CAMPO} />
        </Campo>
        <Botao type="submit">Filtrar</Botao>
      </form>

      {logs === null ? (
        <EstadoVazio>Carregando auditoria...</EstadoVazio>
      ) : logs.length === 0 ? (
        <EstadoVazio>Nenhuma ação registrada com estes filtros.</EstadoVazio>
      ) : (
        <ul className="border-t border-borda">
          {logs.map((log) => (
            <li key={log.id} className="border-b border-borda py-3">
              <p className="text-corpo text-texto">{log.descricao}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-meta text-texto-3 tabular-nums">
                <span>{new Date(log.dataHora).toLocaleString("pt-BR")}</span>
                <span>{log.usuario?.nome ?? "Sem login"}</span>
                {log.abrigo && <span>{log.abrigo.nome}</span>}
                <span className="font-mono">{log.acao}</span>
                {log.enderecoIp && <span className="font-mono">{log.enderecoIp}</span>}
              </p>
              {log.detalhes && Object.keys(log.detalhes).length > 0 && (
                <details className="mt-1 text-meta text-texto-3">
                  <summary className="cursor-pointer hover:text-texto-2">Dados técnicos</summary>
                  <pre className="mt-1 font-mono break-all whitespace-pre-wrap">{JSON.stringify(log.detalhes, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
