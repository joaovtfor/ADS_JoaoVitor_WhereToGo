"use client";

import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import type { VerticePoligono } from "@/components/seletor-ponto-mapa";
import { Botao } from "@/components/ui/botao";
import { Campo, CLASSES_CAMPO } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import type { AbrigoAdmin } from "../contexto-admin";
import { rotuloOcorrencia } from "../rotulos";
import { bordasSeCruzam, TIPOS_OCORRENCIA, type Gravidade } from "./tipos";

const SeletorPontoMapa = dynamic(() => import("@/components/seletor-ponto-mapa"), {
  ssr: false,
  loading: () => <div className="flex h-60 w-full items-center justify-center rounded-controle bg-superficie text-meta text-texto-3">Carregando mapa...</div>,
});

interface PropriedadesFormOcorrencia {
  abrigo: AbrigoAdmin | null;
  somenteLeitura: boolean;
  enviando: boolean;
  onErro: (mensagem: string) => void;
  /** Devolve `true` quando o alerta foi publicado (o formulário é limpo). */
  onRegistrar: (corpo: Record<string, unknown>, ehAreaDeRisco: boolean) => Promise<boolean>;
}

/**
 * Registro de um alerta: tipo, gravidade, descrição e, se fizer sentido, o
 * local (um ponto) ou o contorno (área de risco) marcado no mapa.
 */
export function FormOcorrencia({ abrigo, somenteLeitura, enviando, onErro, onRegistrar }: PropriedadesFormOcorrencia) {
  const [tipo, setTipo] = useState("VIA_BLOQUEADA");
  const [gravidade, setGravidade] = useState<Gravidade>("CRITICO");
  const [descricao, setDescricao] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [poligono, setPoligono] = useState<VerticePoligono[]>([]);
  const [mapaAberto, setMapaAberto] = useState(true);

  const ehAreaDeRisco = tipo === "AREA_RISCO";
  const modoContorno = ehAreaDeRisco || poligono.length > 0;

  function selecionarTipo(novoTipo: string) {
    setTipo(novoTipo);
    const padrao = TIPOS_OCORRENCIA.find((t) => t.tipo === novoTipo);
    if (padrao) setGravidade(padrao.gravidadePadrao);
    if (novoTipo === "AREA_RISCO") setMapaAberto(true);
    else if (poligono.length > 0) setPoligono([]);
  }

  function usarLocalDoAbrigo() {
    if (!abrigo) return;
    setLatitude(String(abrigo.latitude));
    setLongitude(String(abrigo.longitude));
  }

  function usarMinhaLocalizacao() {
    if (!("geolocation" in navigator)) return onErro("Este navegador não permite usar a localização.");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLatitude(posicao.coords.latitude.toFixed(6));
        setLongitude(posicao.coords.longitude.toFixed(6));
      },
      () => onErro("Não foi possível obter a localização deste aparelho."),
    );
  }

  /** Ponto de partida: um quadrilátero em volta do ponto marcado (ou do abrigo), para ajustar arrastando. */
  function gerarContornoInicial() {
    const baseLat = latitude.trim() !== "" ? Number(latitude) : (abrigo?.latitude ?? -28.258);
    const baseLng = longitude.trim() !== "" ? Number(longitude) : (abrigo?.longitude ?? -52.406);
    const ponto = (dLat: number, dLng: number): VerticePoligono => ({ lat: Number((baseLat + dLat).toFixed(6)), lng: Number((baseLng + dLng).toFixed(6)) });
    setPoligono([ponto(0.0022, -0.0022), ponto(0.0022, 0.0022), ponto(-0.0018, 0.0026), ponto(-0.0018, -0.0026)]);
    setLatitude(baseLat.toFixed(6));
    setLongitude(baseLng.toFixed(6));
    setMapaAberto(true);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (somenteLeitura) return;
    if (ehAreaDeRisco && poligono.length < 3) return onErro("Marque ao menos 3 pontos no mapa para delimitar a área de risco.");

    const corpo: Record<string, unknown> = { tipo, gravidade, descricao: descricao.trim() || null };
    if (poligono.length >= 3) {
      // O rótulo da área é posicionado pelo servidor, sempre dentro do contorno.
      corpo.poligono = poligono;
    } else if (latitude.trim() !== "" && longitude.trim() !== "") {
      corpo.latitude = Number(latitude);
      corpo.longitude = Number(longitude);
    }

    if (!(await onRegistrar(corpo, ehAreaDeRisco))) return;
    setDescricao("");
    setLatitude("");
    setLongitude("");
    setPoligono([]);
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo rotulo="Tipo">
        <select disabled={somenteLeitura} value={tipo} onChange={(e) => selecionarTipo(e.target.value)} className={CLASSES_CAMPO}>
          {TIPOS_OCORRENCIA.map((opcao) => (
            <option key={opcao.tipo} value={opcao.tipo}>
              {rotuloOcorrencia(opcao.tipo)}
            </option>
          ))}
        </select>
      </Campo>

      <div className="space-y-1.5">
        <p className="text-meta font-medium text-texto-2">Gravidade</p>
        <div className="flex flex-wrap gap-2">
          <Chip ativo={gravidade === "ALERTA"} disabled={somenteLeitura} onClick={() => setGravidade("ALERTA")}>
            Alerta: funciona em parte
          </Chip>
          <Chip ativo={gravidade === "CRITICO"} disabled={somenteLeitura} onClick={() => setGravidade("CRITICO")}>
            Crítico: risco ou interdição
          </Chip>
        </div>
      </div>

      <Campo rotulo={tipo === "OUTRO" ? "Descrição" : "Descrição ou rota alternativa (opcional)"}>
        <textarea
          rows={3}
          disabled={somenteLeitura}
          required={tipo === "OUTRO"}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={ehAreaDeRisco ? "Encosta instável neste quarteirão. Evite passar por dentro da área marcada." : "Ponte principal interditada; entre pela rua lateral norte."}
          className={`${CLASSES_CAMPO} py-2`}
        />
      </Campo>

      <div className="space-y-3 border-t border-borda pt-4">
        <div>
          <p className="text-meta font-medium text-texto-2">{modoContorno ? "Contorno da área de risco" : "Local (opcional)"}</p>
          <p className="text-meta text-texto-3">
            {modoContorno ? "Toque em 3 ou mais pontos do mapa para cercar a área." : "Sem local, o alerta aparece como aviso no pino do abrigo."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Botao tamanho="sm" ligado={mapaAberto} disabled={somenteLeitura} onClick={() => setMapaAberto((v) => !v)}>
            Mapa
          </Botao>
          {modoContorno ? (
            <>
              <Botao tamanho="sm" disabled={somenteLeitura} onClick={gerarContornoInicial}>
                Sugerir contorno
              </Botao>
              {poligono.length > 0 && (
                <>
                  <Botao tamanho="sm" variante="fantasma" disabled={somenteLeitura} onClick={() => setPoligono((anteriores) => anteriores.slice(0, -1))}>
                    Desfazer ponto
                  </Botao>
                  <Botao tamanho="sm" variante="fantasma" disabled={somenteLeitura} onClick={() => setPoligono([])}>
                    Limpar
                  </Botao>
                </>
              )}
            </>
          ) : (
            <>
              <Botao tamanho="sm" disabled={somenteLeitura} onClick={usarLocalDoAbrigo}>
                Local do abrigo
              </Botao>
              <Botao tamanho="sm" disabled={somenteLeitura} onClick={usarMinhaLocalizacao}>
                Minha localização
              </Botao>
            </>
          )}
        </div>

        {mapaAberto && !somenteLeitura && (
          <SeletorPontoMapa
            latitude={latitude.trim() !== "" ? Number(latitude) : null}
            longitude={longitude.trim() !== "" ? Number(longitude) : null}
            referenciaAbrigo={abrigo ? { lat: abrigo.latitude, lng: abrigo.longitude, nome: abrigo.nome } : null}
            modo={modoContorno ? "poligono" : "ponto"}
            poligono={poligono}
            aoAlterarPoligono={setPoligono}
            aoSelecionarCoordenada={(lat, lng) => {
              setLatitude(String(lat));
              setLongitude(String(lng));
            }}
            alturaClasse="h-60"
          />
        )}

        {modoContorno && poligono.length > 0 && (
          <p role="status" className="text-meta text-texto-2">
            {poligono.length < 3
              ? `Faltam ${3 - poligono.length} ${3 - poligono.length === 1 ? "ponto" : "pontos"} para fechar o contorno.`
              : `Contorno fechado com ${poligono.length} pontos.`}
            {bordasSeCruzam(poligono) &&
              " As linhas estão se cruzando: ao publicar, os pontos serão ligados em volta do centro da área. Se preferir, arraste os pontos antes."}
          </p>
        )}

        {!modoContorno && (
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Latitude">
              <input
                type="number"
                step="any"
                disabled={somenteLeitura}
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="-28.2486"
                className={`${CLASSES_CAMPO} tabular-nums`}
              />
            </Campo>
            <Campo rotulo="Longitude">
              <input
                type="number"
                step="any"
                disabled={somenteLeitura}
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="-52.4230"
                className={`${CLASSES_CAMPO} tabular-nums`}
              />
            </Campo>
          </div>
        )}
      </div>

      <Botao type="submit" variante="primaria" disabled={somenteLeitura || enviando} className="w-full">
        {enviando ? "Publicando..." : "Publicar no mapa"}
      </Botao>
    </form>
  );
}
