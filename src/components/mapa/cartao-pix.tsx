"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { BotaoCopiar } from "./botao-copiar";
import { LinhaFicha } from "./linha-ficha";

interface PropriedadesCartaoPix {
  pix: { chave: string; titular: string | null; brCode: string } | null;
  carregando: boolean;
}

/**
 * QR Code desenhado no próprio navegador a partir do BR Code oficial do
 * servidor. Antes a imagem vinha de um serviço externo: se ele fosse
 * comprometido, poderia devolver o QR de outra chave e desviar doações.
 * A biblioteca só é baixada quando a pessoa abre o QR (fora do carregamento inicial).
 */
function QrCodePix({ brCode }: { brCode: string }) {
  const [imagem, setImagem] = useState<{ brCode: string; dataUrl: string } | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    import("qrcode")
      .then((qr) => qr.toDataURL(brCode, { errorCorrectionLevel: "M", margin: 2, width: 208 }))
      .then((dataUrl) => {
        if (!cancelado) setImagem({ brCode, dataUrl });
      })
      .catch(() => {
        if (!cancelado) setFalhou(true);
      });
    return () => {
      cancelado = true;
    };
  }, [brCode]);

  if (falhou) return <p className="text-meta text-critico-claro">Não foi possível gerar o QR Code. Use o código copia e cola abaixo.</p>;
  if (imagem?.brCode !== brCode) return <div className="size-52 animate-pulse rounded-controle bg-superficie-2" />;
  // eslint-disable-next-line @next/next/no-img-element -- data URL gerada localmente
  return <img src={imagem.dataUrl} alt="QR Code PIX oficial do abrigo" width={208} height={208} className="rounded-controle bg-white" />;
}

/** Doação em dinheiro: chave oficial do abrigo, com QR Code sob demanda. */
export function CartaoPix({ pix, carregando }: PropriedadesCartaoPix) {
  const [mostrarQr, setMostrarQr] = useState(false);

  return (
    <LinhaFicha icone={QrCode} rotulo="Doar por PIX">
      {carregando ? (
        <span className="text-texto-2">Carregando dados de doação...</span>
      ) : pix ? (
        <div className="space-y-2">
          <p className="font-mono text-meta break-all text-texto">{pix.chave}</p>
          <p className="text-meta text-texto-3">
            Chave oficial cadastrada pela coordenação do abrigo.
            {pix.titular && (
              <>
                {" "}
                Titular: <span className="text-texto-2">{pix.titular}</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <BotaoCopiar texto={pix.chave} rotulo="Copiar chave" rotuloCopiado="Chave copiada" />
            <Botao tamanho="sm" variante="fantasma" aria-expanded={mostrarQr} onClick={() => setMostrarQr((v) => !v)}>
              {mostrarQr ? "Ocultar QR Code" : "Ver QR Code"}
            </Botao>
          </div>

          {mostrarQr && (
            <div className="space-y-2 pt-2">
              <QrCodePix brCode={pix.brCode} />
              <p className="text-meta text-texto-3">Escaneie no app do seu banco ou copie o código.</p>
              <BotaoCopiar texto={pix.brCode} rotulo="Copiar código copia e cola" rotuloCopiado="Código copiado" />
            </div>
          )}
        </div>
      ) : (
        <span className="text-texto-2">Este abrigo recebe apenas doações de suprimentos no momento.</span>
      )}
    </LinhaFicha>
  );
}
