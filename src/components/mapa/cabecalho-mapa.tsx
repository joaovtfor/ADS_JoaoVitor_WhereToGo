"use client";

import Link from "next/link";
import { List, LogIn, Menu as IconeMenu, RefreshCw, Search, TriangleExclamationPoint, UserSearch } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CLASSES_CAMPO } from "@/components/ui/campo";
import { juntarClasses } from "@/components/ui/classes";
import { Icone } from "@/components/ui/icone";
import { Logo } from "@/components/ui/logo";
import { CLASSES_ITEM_MENU, ItemMenu, Menu } from "@/components/ui/menu";

interface PropriedadesCabecalhoMapa {
  totalAbrigos: number;
  totalAlertas: number;
  termoBusca: string;
  onBuscar: (termo: string) => void;
  onConfirmarBusca: () => void;
  listaAberta: boolean;
  onAlternarLista: () => void;
  onBuscarFamiliar: () => void;
  onVerAlertas: () => void;
  onAtualizar: () => void;
}

/** Uma linha: marca, busca, lista e menu. Fica acima das camadas do mapa para o menu abrir por cima delas. */
export function CabecalhoMapa({
  totalAbrigos,
  totalAlertas,
  termoBusca,
  onBuscar,
  onConfirmarBusca,
  listaAberta,
  onAlternarLista,
  onBuscarFamiliar,
  onVerAlertas,
  onAtualizar,
}: PropriedadesCabecalhoMapa) {
  return (
    <header className="relative z-[700] flex shrink-0 items-center gap-2 bg-superficie px-3 pt-2 sm:px-4">
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
        <Botao variante="fantasma" icone={List} ligado={listaAberta} onClick={onAlternarLista} aria-label={`Lista de abrigos (${totalAbrigos})`}>
          <span className="hidden md:inline">Lista</span>
          <span className="tabular-nums">{totalAbrigos}</span>
        </Botao>
        <Menu rotulo="Menu" icone={IconeMenu}>
          <ItemMenu icone={UserSearch} onClick={onBuscarFamiliar}>
            Encontrar familiar
          </ItemMenu>
          <ItemMenu icone={TriangleExclamationPoint} onClick={onVerAlertas}>
            Vias e áreas de risco ({totalAlertas})
          </ItemMenu>
          <ItemMenu icone={RefreshCw} onClick={onAtualizar}>
            Atualizar dados
          </ItemMenu>
          <Link href="/login" prefetch={false} role="menuitem" className={juntarClasses(CLASSES_ITEM_MENU, "border-t border-borda")}>
            <Icone de={LogIn} />
            Acesso da equipe
          </Link>
        </Menu>
      </div>
    </header>
  );
}
