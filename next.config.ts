import type { NextConfig } from "next";

const EM_DESENVOLVIMENTO = process.env.NODE_ENV !== "production";
/** Tiles do mapa (subdomínios a, b e c). */
const ORIGEM_TILES = "https://*.tile.openstreetmap.fr";
/** Login com Google (Identity Services): script, estilo, iframe do botão e chamadas. */
const ORIGEM_GOOGLE = "https://accounts.google.com/gsi/";

/**
 * Content Security Policy: lista o que a página pode carregar e para onde pode
 * enviar dados. Um script injetado não consegue buscar código em outro site,
 * mandar dados para fora nem colocar o app dentro de um iframe alheio.
 *
 * `'unsafe-inline'` em script-src é uma limitação conhecida: o Next entrega os
 * dados da página em scripts embutidos no HTML. A alternativa (um nonce por
 * requisição) obriga a renderizar tudo a cada acesso e é incompatível com a
 * pré-renderização parcial que o mapa usa (`cacheComponents`), conforme o guia
 * de CSP do próprio Next. As demais diretivas não têm essa brecha.
 *
 * Ao usar um serviço externo novo (outro mapa, fontes, métricas), acrescente a
 * origem aqui, ou o navegador bloqueia em silêncio (o erro aparece no console).
 */
const POLITICA_DE_CONTEUDO = [
  "default-src 'self'",
  // Em `next dev` o React usa eval para reconstruir pilhas de erro; em produção, não.
  `script-src 'self' 'unsafe-inline'${EM_DESENVOLVIMENTO ? " 'unsafe-eval'" : ""} ${ORIGEM_GOOGLE}client`,
  `style-src 'self' 'unsafe-inline' ${ORIGEM_GOOGLE}style`,
  // data: é o QR Code do PIX, gerado no navegador.
  `img-src 'self' data: blob: ${ORIGEM_TILES}`,
  "font-src 'self'",
  // Os tiles entram aqui também: o service worker os busca com fetch() para o modo offline.
  `connect-src 'self' ${ORIGEM_TILES} ${ORIGEM_GOOGLE}${EM_DESENVOLVIMENTO ? " ws: wss:" : ""}`,
  `frame-src ${ORIGEM_GOOGLE}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

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
          { key: "Content-Security-Policy", value: POLITICA_DE_CONTEUDO },
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
        // Logos estáticas em WebP cacheadas por longo prazo na CDN e no navegador (3G).
        source: "/logos/:arquivo*",
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
