"use client";

import { useEffect, useState } from "react";
import { BotaoCopiar } from "./botao-copiar";

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

  if (falhou) return <p className="text-xs text-rose-300">Não foi possível gerar o QR. Use o código copia e cola abaixo.</p>;
  if (imagem?.brCode !== brCode) return <div className="mx-auto h-52 w-52 animate-pulse rounded-xl bg-slate-800" />;
  // eslint-disable-next-line @next/next/no-img-element -- data URL gerada localmente
  return <img src={imagem.dataUrl} alt="QR Code PIX oficial do abrigo" width={208} height={208} className="mx-auto rounded-xl bg-white" />;
}

export function CartaoPix({ pix, carregando }: PropriedadesCartaoPix) {
  const [mostrarQr, setMostrarQr] = useState(false);

  return (
    <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Doação em dinheiro (PIX)</h3>
        {pix && (
          <button
            type="button"
            onClick={() => setMostrarQr((v) => !v)}
            className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-bold text-amber-300 hover:bg-slate-800 sm:min-h-9"
          >
            {mostrarQr ? "Ocultar QR" : "📱 Ver QR Code"}
          </button>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400">Carregando dados de doação...</p>
      ) : pix ? (
        <>
          <p className="text-xs text-slate-400">Chave oficial cadastrada pela coordenação do abrigo:</p>
          <p className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 break-all">{pix.chave}</p>
          {pix.titular && (
            <p className="text-xs text-slate-400">
              Titular: <strong className="text-slate-200">{pix.titular}</strong>
            </p>
          )}

          {mostrarQr && (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
              <QrCodePix brCode={pix.brCode} />
              <p className="text-xs text-slate-400">Escaneie no app do seu banco ou copie o código abaixo.</p>
              <BotaoCopiar
                texto={pix.brCode}
                rotulo="📲 Copiar PIX copia e cola"
                rotuloCopiado="✅ Código copiado!"
                className="border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              />
            </div>
          )}

          <BotaoCopiar
            texto={pix.chave}
            rotulo="📋 Copiar chave PIX"
            rotuloCopiado="✅ Chave copiada!"
            className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          />
        </>
      ) : (
        <p className="text-sm text-slate-400">Este abrigo recebe apenas doações de suprimentos no momento.</p>
      )}
    </section>
  );
}
