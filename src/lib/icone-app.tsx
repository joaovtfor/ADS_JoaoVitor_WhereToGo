import { ImageResponse } from "next/og";

/**
 * Ícone do app (PWA / tela inicial): "W" branco no azul da marca, sobre fundo preto.
 * Gerado no build, sem arquivos binários no repositório. A margem interna
 * deixa o ícone seguro para o recorte "maskable" do Android.
 */
export function gerarIconeApp(tamanho: number): ImageResponse {
  const lado = Math.round(tamanho * 0.62);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#000000" }}>
        <div
          style={{
            display: "flex",
            width: lado,
            height: lado,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: Math.round(lado * 0.22),
            background: "#2563eb",
            color: "#ffffff",
            fontSize: Math.round(lado * 0.62),
            fontWeight: 900,
          }}
        >
          W
        </div>
      </div>
    ),
    { width: tamanho, height: tamanho },
  );
}
