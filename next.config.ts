import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone (servidor mínimo) usado pela imagem Docker de produção.
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  cacheLife: {
    // Rotas públicas do mapa (src/modules/publico/publico.cache.ts). Toda
    // escrita na API invalida a tag na hora; o tempo abaixo só cobre mudanças
    // feitas fora da API (seed, SQL manual).
    mapaPublico: { stale: 30, revalidate: 30, expire: 300 },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Só o próprio site pede localização (mapa "perto de mim"); câmera,
          // microfone e pagamentos ficam bloqueados para qualquer script.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
          // HSTS só em produção: em `next dev` (http://localhost) seria ignorado
          // ou fixaria HTTPS em domínios de teste.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }]
            : []),
        ],
      },
      {
        // O service worker precisa ser revalidado a cada visita para que
        // correções cheguem logo aos celulares que já instalaram o app.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // Ícones estáticos do PWA cacheados por longo prazo na CDN e no navegador (3G).
        source: "/icone-:tamanho.png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Manifesto PWA cacheado na CDN com revalidação em background.
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
