"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/pagina";
import { api } from "@/lib/cliente-api";
import { ToastFlutuante, useAdmin } from "../contexto-admin";
import { useAcao } from "../use-acao";
import type { AbaGestao, PaginaUsuarios } from "./tipos";

// Cada aba é carregada só quando aberta: o código das outras três não entra na primeira carga.
const carregando = () => <EstadoVazio>Carregando...</EstadoVazio>;
const AbaAbrigos = dynamic(() => import("./aba-abrigos").then((m) => m.AbaAbrigos), { loading: carregando });
const AbaUsuarios = dynamic(() => import("./aba-usuarios").then((m) => m.AbaUsuarios), { loading: carregando });
const AbaCatalogo = dynamic(() => import("./aba-catalogo").then((m) => m.AbaCatalogo), { loading: carregando });
const AbaAuditoria = dynamic(() => import("./aba-auditoria").then((m) => m.AbaAuditoria), { loading: carregando });

export default function PaginaGestao() {
  const { usuario, abrigoAtivo, abrigos } = useAdmin();
  const ehAdmin = usuario.papel === "ADMIN";
  const acao = useAcao();
  const [aba, setAba] = useState<AbaGestao>(ehAdmin ? "abrigos" : "usuarios");
  const [pendentes, setPendentes] = useState(0);

  // O contador de pedidos de acesso aparece na aba mesmo antes de ela ser aberta.
  const atualizarPendentes = useCallback((total: number) => setPendentes(total), []);
  useEffect(() => {
    api<PaginaUsuarios>("/api/usuarios?pendente=true&tamanho=200")
      .then((fila) => setPendentes(fila.itens.length))
      .catch(() => {
        // Sem o contador a tela continua utilizável; o erro aparece ao abrir a aba.
      });
  }, []);

  const abas: Array<{ id: AbaGestao; rotulo: string; contador?: number }> = ehAdmin
    ? [
        { id: "abrigos", rotulo: `Abrigos (${abrigos.length})` },
        { id: "usuarios", rotulo: "Equipe", contador: pendentes },
        { id: "catalogo", rotulo: "Catálogo" },
        { id: "auditoria", rotulo: "Auditoria" },
      ]
    : [
        { id: "usuarios", rotulo: "Voluntários", contador: pendentes },
        { id: "auditoria", rotulo: "Auditoria" },
      ];

  return (
    <div className="space-y-6">
      <ToastFlutuante erro={acao.erro} aviso={acao.aviso} aoFecharErro={() => acao.setErro(null)} aoFecharAviso={() => acao.setAviso(null)} />

      <CabecalhoPagina
        titulo={ehAdmin ? "Gestão" : "Equipe"}
        descricao={ehAdmin ? "Abrigos, contas, catálogo de itens e auditoria de toda a rede." : (abrigoAtivo?.nome ?? usuario.abrigo ?? undefined)}
      />

      <Abas rotulo="Seções da gestão" abas={abas} ativa={aba} onMudar={setAba} />

      {aba === "abrigos" && ehAdmin && <AbaAbrigos acao={acao} />}
      {aba === "usuarios" && <AbaUsuarios acao={acao} onPendentes={atualizarPendentes} />}
      {aba === "catalogo" && ehAdmin && <AbaCatalogo acao={acao} />}
      {aba === "auditoria" && <AbaAuditoria acao={acao} />}
    </div>
  );
}
