import type { MetadataRoute } from "next";

/** Permite instalar o mapa público na tela inicial do celular (PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhereToGo - Abrigos e doações",
    short_name: "WhereToGo",
    description: "Mapa em tempo real de abrigos com vagas, doações urgentes e alertas de vias e áreas de risco.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
