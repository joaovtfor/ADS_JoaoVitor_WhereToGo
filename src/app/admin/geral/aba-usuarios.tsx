"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Ellipsis, Pencil, Search, UserCheck, UserX } from "lucide-react";
import { Botao, BotaoIcone } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Icone } from "@/components/ui/icone";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { ModalConfirmacao } from "@/components/ui/modal";
import { Secao } from "@/components/ui/pagina";
import { SeloStatus } from "@/components/ui/selo-status";
import { papelSemAbrigo } from "@/lib/auth/permissoes";
import { api, mensagemErro } from "@/lib/cliente-api";
import { useAdmin, type PapelUsuario } from "../contexto-admin";
import { ROTULO_PAPEL } from "../rotulos";
import type { Acao } from "../use-acao";
import { TAMANHO_PAGINA_USUARIOS, type PaginaUsuarios, type UsuarioLista } from "./tipos";

interface PropriedadesAbaUsuarios {
  acao: Acao;
  /** Avisa a tela quando a fila de aprovação muda (o contador fica na aba). */
  onPendentes: (total: number) => void;
}

/** Contas da equipe: fila de aprovação, cadastro e lista com busca. */
export function AbaUsuarios({ acao, onPendentes }: PropriedadesAbaUsuarios) {
  const { usuario, abrigos } = useAdmin();
  const ehAdmin = usuario.papel === "ADMIN";
  const { executar, setErro } = acao;

  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [pendentes, setPendentes] = useState<UsuarioLista[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginacao, setPaginacao] = useState({ total: 0, totalPaginas: 1 });
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [desativando, setDesativando] = useState<UsuarioLista | null>(null);

  // Formulário
  const abrigoPadrao = usuario.idAbrigo ?? abrigos[0]?.id ?? "";
  const [editando, setEditando] = useState<UsuarioLista | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<PapelUsuario>("VOLUNTARIO");
  const [idAbrigo, setIdAbrigo] = useState<number | "">(abrigoPadrao);

  // Lista paginada + fila de aprovação à parte, sempre completa.
  const carregar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pagina: String(pagina), tamanho: String(TAMANHO_PAGINA_USUARIOS) });
      if (buscaAplicada) params.set("busca", buscaAplicada);
      const [lista, fila] = await Promise.all([
        api<PaginaUsuarios>(`/api/usuarios?${params.toString()}`),
        api<PaginaUsuarios>("/api/usuarios?pendente=true&tamanho=200"),
      ]);
      setUsuarios(lista.itens);
      setPaginacao({ total: lista.paginacao.total, totalPaginas: lista.paginacao.totalPaginas });
      setPendentes(fila.itens);
      onPendentes(fila.itens.length);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }, [pagina, buscaAplicada, onPendentes, setErro]);

  useEffect(() => {
    void Promise.resolve().then(carregar);
  }, [carregar]);

  // Espera 300 ms depois da última tecla antes de buscar.
  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 300);
    return () => window.clearTimeout(temporizador);
  }, [busca]);

  function abrirFormulario(alvo: UsuarioLista | null) {
    setEditando(alvo);
    setNome(alvo?.nome ?? "");
    setEmail(alvo?.email ?? "");
    setSenha("");
    setPapel(alvo?.papel ?? "VOLUNTARIO");
    setIdAbrigo(alvo?.idAbrigo ?? abrigoPadrao);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    // Coordenador só cadastra voluntários do próprio abrigo.
    const papelFinal = ehAdmin ? papel : "VOLUNTARIO";
    const abrigoFinal = papelSemAbrigo(papelFinal) ? null : ehAdmin ? Number(idAbrigo) : usuario.idAbrigo;

    const salvo = await executar(
      async () => {
        if (editando) {
          const corpo: Record<string, unknown> = { nome };
          if (senha.trim()) corpo.senha = senha;
          if (ehAdmin) Object.assign(corpo, { email, papel: papelFinal, idAbrigo: abrigoFinal });
          await api(`/api/usuarios/${editando.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
        } else {
          const corpo: Record<string, unknown> = { nome, email, papel: papelFinal, idAbrigo: abrigoFinal };
          if (senha.trim()) corpo.senha = senha;
          await api("/api/usuarios", { method: "POST", body: JSON.stringify(corpo) });
        }
        await carregar();
      },
      editando ? `${nome} atualizado.` : senha.trim() ? `${nome} cadastrado.` : `${nome} cadastrado. O primeiro acesso é com a conta Google.`,
    );
    if (salvo) abrirFormulario(null);
  }

  const alternarAtivo = (alvo: UsuarioLista) =>
    executar(
      async () => {
        await api(`/api/usuarios/${alvo.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !alvo.ativo }) });
        await carregar();
      },
      alvo.ativo ? `Conta de ${alvo.nome} desativada.` : `Acesso de ${alvo.nome} liberado.`,
    );

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
      <Secao
        titulo={editando ? `Editar ${editando.nome}` : ehAdmin ? "Nova conta" : "Novo voluntário"}
        className="lg:col-span-4"
        acoes={
          editando && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => abrirFormulario(null)}>
              Cancelar edição
            </Botao>
          )
        }
      >
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome completo">
            <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} className={CLASSES_CAMPO} />
          </Campo>
          <Campo rotulo="E-mail">
            <input
              type="email"
              required
              disabled={Boolean(editando && !ehAdmin)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={CLASSES_CAMPO}
            />
          </Campo>
          <Campo
            rotulo={editando ? "Nova senha (opcional)" : "Senha inicial (opcional)"}
            dica={editando ? "Em branco, a senha atual continua valendo." : "Em branco, a pessoa entra com a conta Google deste e-mail."}
          >
            <input type="password" minLength={8} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={CLASSES_CAMPO} />
          </Campo>

          {ehAdmin && (
            <>
              <Campo rotulo="Perfil de acesso">
                <select value={papel} onChange={(e) => setPapel(e.target.value as PapelUsuario)} className={CLASSES_CAMPO}>
                  <option value="VOLUNTARIO">Voluntário: estoque e check-in</option>
                  <option value="COORDENADOR">Coordenador: gestão do abrigo</option>
                  <option value="DEFESA_CIVIL">Defesa Civil: todos os abrigos e alertas regionais, sem gestão de contas</option>
                  <option value="ADMIN">Administração geral: todos os abrigos</option>
                </select>
              </Campo>
              {!papelSemAbrigo(papel) && (
                <Campo rotulo="Abrigo">
                  <select required value={idAbrigo} onChange={(e) => setIdAbrigo(Number(e.target.value))} className={CLASSES_CAMPO}>
                    {abrigos
                      .filter((a) => a.ativo)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                  </select>
                </Campo>
              )}
            </>
          )}

          <Botao type="submit" variante="primaria" disabled={acao.enviando} className="w-full">
            {editando ? "Salvar alterações" : "Cadastrar"}
          </Botao>
        </form>
      </Secao>

      <div className="space-y-8 lg:col-span-8">
        {pendentes.length > 0 && (
          <Secao titulo="Pedidos de acesso" descricao="Pessoas que se cadastraram com a conta Google e aguardam aprovação.">
            <ul className="border-t border-borda">
              {pendentes.map((pendente) => (
                <li key={pendente.id} className="flex items-center justify-between gap-3 border-b border-borda py-3">
                  <div className="min-w-0">
                    <p className="truncate text-corpo font-medium text-texto">{pendente.nome}</p>
                    <p className="truncate text-meta text-texto-3">
                      {pendente.email} · {pendente.abrigo ?? "sem abrigo"}
                    </p>
                  </div>
                  <Botao tamanho="sm" disabled={acao.enviando} onClick={() => void alternarAtivo(pendente)}>
                    Aprovar
                  </Botao>
                </li>
              ))}
            </ul>
          </Secao>
        )}

        <Secao
          titulo="Contas"
          descricao={<span className="tabular-nums">{paginacao.total === 1 ? "1 conta" : `${paginacao.total} contas`}</span>}
          acoes={
            <div className="relative w-full sm:w-64">
              <Icone de={Search} tamanho={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-3" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                aria-label="Buscar contas por nome ou e-mail"
                className={`${CLASSES_CAMPO} pl-9`}
              />
            </div>
          }
        >
          <ul className="border-t border-borda">
            {usuarios.map((conta) => {
              const podeAlterar = conta.id !== usuario.id && (ehAdmin || conta.papel === "VOLUNTARIO");
              return (
                <li key={conta.id} className="flex items-center gap-3 border-b border-borda py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-corpo font-medium text-texto">{conta.nome}</p>
                    <p className="truncate text-meta text-texto-3">{conta.email}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-texto-3">
                      {!conta.ativo &&
                        (conta.pendenteAprovacao ? <SeloStatus nivel="atencao">Aguardando aprovação</SeloStatus> : <SeloStatus nivel="neutro">Desativada</SeloStatus>)}
                      <span>{ROTULO_PAPEL[conta.papel]}</span>
                      <span>{conta.abrigo ?? "Todos os abrigos"}</span>
                      {conta.possuiGoogle && <span>Entra com Google</span>}
                    </p>
                  </div>
                  {podeAlterar && (
                    <Menu rotulo={`Ações para ${conta.nome}`} icone={Ellipsis}>
                      <ItemMenu icone={Pencil} onClick={() => abrirFormulario(conta)}>
                        Editar
                      </ItemMenu>
                      {conta.ativo ? (
                        <ItemMenu icone={UserX} onClick={() => setDesativando(conta)}>
                          Desativar conta
                        </ItemMenu>
                      ) : (
                        <ItemMenu icone={UserCheck} onClick={() => void alternarAtivo(conta)}>
                          {conta.pendenteAprovacao ? "Aprovar acesso" : "Reativar conta"}
                        </ItemMenu>
                      )}
                    </Menu>
                  )}
                </li>
              );
            })}
          </ul>

          {paginacao.totalPaginas > 1 && (
            <nav aria-label="Páginas da lista de contas" className="flex items-center justify-between">
              <BotaoIcone icone={ChevronLeft} rotulo="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} />
              <span className="text-meta text-texto-3 tabular-nums">
                Página {pagina} de {paginacao.totalPaginas}
              </span>
              <BotaoIcone
                icone={ChevronRight}
                rotulo="Próxima página"
                disabled={pagina >= paginacao.totalPaginas}
                onClick={() => setPagina((p) => Math.min(paginacao.totalPaginas, p + 1))}
              />
            </nav>
          )}
        </Secao>
      </div>

      {desativando && (
        <ModalConfirmacao
          titulo={`Desativar a conta de ${desativando.nome}`}
          rotuloConfirmar="Desativar conta"
          salvando={acao.enviando}
          onFechar={() => setDesativando(null)}
          onConfirmar={() => void alternarAtivo(desativando).then((ok) => ok && setDesativando(null))}
        >
          A pessoa perde o acesso ao painel na hora. A conta e o histórico continuam salvos, e você pode reativá-la depois.
        </ModalConfirmacao>
      )}
    </div>
  );
}
