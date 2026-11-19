"use client";

import Link from "next/link";
import { Menu as IconeMenu, RefreshCw, Search, TriangleExclamationPoint, UserRound, UserSearch } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { CLASSES_CAMPO } from "@/components/ui/campo";
import { Icone } from "@/components/ui/icone";
import { Logo } from "@/components/ui/logo";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { SeletorTema } from "@/components/ui/seletor-tema";

/** Telas do painel do mapa que o cabeçalho abre. */
type TelaCabecalho = "alertas" | "familiares";

interface PropriedadesCabecalhoMapa {
  totalAlertas: number;
  termoBusca: string;
  onBuscar: (termo: string) => void;
  onConfirmarBusca: () => void;
  /** Tela do cabeçalho que está à vista no painel, para o botão aparecer ligado. */
  telaAberta: TelaCabecalho | null;
  /** Itens do menu: sempre abrem. */
  onAbrirTela: (tela: TelaCabecalho) => void;
  /** Botões do desktop: liga/desliga. */
  onAlternarTela: (tela: TelaCabecalho) => void;
  onAtualizar: () => void;
}

/**
 * Uma linha: marca, busca e as ações do site. Os filtros ficam no mapa e a
 * lista de abrigos na barra de resumo, perto do polegar.
 * "Área da equipe" fica sempre à vista (no celular, só o ícone de pessoa) e leva a
 * `/admin`: o proxy manda quem não tem sessão para `/login` e quem tem para a tela
 * do seu papel. O cabeçalho não muda com a sessão de propósito: o service worker
 * guarda este HTML para o modo offline, e um nome de usuário ficaria salvo nele.
 */
export function CabecalhoMapa({
  totalAlertas,
  termoBusca,
  onBuscar,
  onConfirmarBusca,
  telaAberta,
  onAbrirTela,
  onAlternarTela,
  onAtualizar,
}: PropriedadesCabecalhoMapa) {
  return (
    <header className="relative z-[700] flex h-14 shrink-0 items-center gap-2 border-b border-borda bg-superficie px-3 sm:px-4">
      <Logo marca="pino" className="h-9" />
      <Logo marca="logotipo" className="hidden h-4.5 md:mr-3 md:block" />
      <h1 className="sr-only">WhereToGo</h1>

      <div className="relative min-w-0 flex-1 md:max-w-md">
        <Icone de={Search} tamanho={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-3" />
        <input
          type="search"
          value={termoBusca}
          onChange={(e) => onBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirmarBusca();
          }}
          placeholder="Buscar abrigo, bairro ou item"
          aria-label="Buscar abrigo, bairro ou item para doar"
          className={`${CLASSES_CAMPO} pl-9`}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Botao
          variante="fantasma"
          icone={TriangleExclamationPoint}
          ligado={telaAberta === "alertas"}
          onClick={() => onAlternarTela("alertas")}
          className="max-lg:hidden"
        >
          Alertas
          {totalAlertas > 0 && <span className="tabular-nums">{totalAlertas}</span>}
        </Botao>
        <Botao
          variante="fantasma"
          icone={UserSearch}
          ligado={telaAberta === "familiares"}
          onClick={() => onAlternarTela("familiares")}
          className="max-lg:hidden"
        >
          Encontrar familiar
        </Botao>
        <Link
          href="/admin"
          prefetch={false}
          aria-label="Área da equipe"
          title="Área da equipe: voluntários, coordenação e Defesa Civil"
          // Link não entra na regra global de 48 px para toque (globals.css): vai aqui.
          className={classesBotao("secundaria", "md", "max-md:w-11 max-md:px-0 lg:ml-1 pointer-coarse:min-h-12 max-md:pointer-coarse:w-12")}
        >
          <Icone de={UserRound} tamanho={18} />
          <span className="hidden md:inline">Área da equipe</span>
        </Link>
        <Menu rotulo="Menu" icone={IconeMenu}>
          <ItemMenu icone={UserSearch} onClick={() => onAbrirTela("familiares")} className="lg:hidden">
            Encontrar familiar
          </ItemMenu>
          <ItemMenu icone={TriangleExclamationPoint} onClick={() => onAbrirTela("alertas")} className="lg:hidden">
            Alertas e avisos ({totalAlertas})
          </ItemMenu>
          <ItemMenu icone={RefreshCw} onClick={onAtualizar}>
            Atualizar dados
          </ItemMenu>
          <SeletorTema />
        </Menu>
      </div>
    </header>
  );
}
