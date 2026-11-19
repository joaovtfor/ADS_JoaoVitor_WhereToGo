import { connection } from "next/server";
import { Suspense } from "react";
import { MapaPublico } from "@/components/mapa/mapa-publico";
import type { DadosIniciaisMapa } from "@/components/mapa/use-dados-mapa";
import { obterEstadoInicialMapa } from "@/modules/publico/publico.mapa";

type ParametrosDaBusca = Promise<{ [chave: string]: string | string[] | undefined }>;

/** O que aparece no instante em que o HTML chega, antes dos dados: a mesma estrutura, vazia. */
function EsqueletoMapa() {
  return (
    <div className="flex h-dvh w-screen flex-col bg-fundo text-texto-2">
      <div className="h-14 shrink-0 border-b border-borda bg-superficie" />
      <p role="status" className="flex flex-1 items-center justify-center bg-superficie text-corpo">
        Carregando abrigos...
      </p>
    </div>
  );
}

/**
 * Lê abrigos, alertas e categorias no servidor e entrega a tela já com eles.
 * Antes o navegador recebia uma página vazia, baixava o JavaScript e só então
 * fazia três requisições para ter o que mostrar (DESIGN.md §6.1).
 *
 * `connection()` avisa o Next que este trecho depende da requisição (lê o banco
 * e a hora atual): ele não roda no build, onde não há banco, e é transmitido na
 * mesma resposta, logo depois do esqueleto.
 */
async function MapaComDados({ searchParams }: { searchParams: ParametrosDaBusca }) {
  await connection();
  const { abrigo } = await searchParams;
  const idAbrigo = Number(Array.isArray(abrigo) ? abrigo[0] : abrigo);

  let inicial: DadosIniciaisMapa | null = null;
  try {
    // Passa pelo JSON para o navegador receber exatamente o que a API envia
    // (datas como texto), e não objetos Date do banco.
    inicial = JSON.parse(JSON.stringify(await obterEstadoInicialMapa())) as DadosIniciaisMapa;
  } catch (erro) {
    // Banco fora do ar: a tela abre assim mesmo e tenta pelo navegador
    // (que ainda pode ter o último estado salvo para o modo offline).
    console.error("[mapa] falha ao ler os dados iniciais", erro);
  }

  return <MapaPublico inicial={inicial} abrigoInicial={Number.isInteger(idAbrigo) && idAbrigo > 0 ? idAbrigo : null} />;
}

export default function PaginaMapaPublico({ searchParams }: { searchParams: ParametrosDaBusca }) {
  return (
    <Suspense fallback={<EsqueletoMapa />}>
      <MapaComDados searchParams={searchParams} />
    </Suspense>
  );
}
