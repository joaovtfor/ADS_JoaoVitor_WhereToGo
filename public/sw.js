/*
 * Service worker do WhereToGo (registrado só no build de produção).
 *
 * Objetivo: o mapa público abrir mesmo sem rede (ou com 3G instável), com o
 * último estado conhecido. Os dados dos abrigos ficam no navegador pela
 * própria página (localStorage); aqui ficam a "casca" do app e o mapa:
 *   - página "/":           rede primeiro; sem rede, a última versão salva
 *   - /_next/static/*:      cache primeiro (arquivos com hash, nunca mudam)
 *   - /logos/*:             cache primeiro; as do mapa, nos dois temas, já na instalação
 *   - tiles do mapa (HOT):  cache primeiro, só os últimos tiles vistos
 * O painel (/admin, /login) e a API passam direto: dados internos nunca são
 * guardados aqui.
 *
 * As logos não têm hash no nome: ao trocar um arquivo de `public/logos`, mude a
 * VERSAO para o navegador buscar a nova.
 */
const VERSAO = "wtg-v1";
const CACHE_PAGINA = `${VERSAO}-pagina`;
const CACHE_ESTATICOS = `${VERSAO}-estaticos`;
const CACHE_MARCA = `${VERSAO}-marca`;
const CACHE_TILES = `${VERSAO}-tiles`;
const LIMITE_ESTATICOS = 200;
const LIMITE_MARCA = 12;
const LIMITE_TILES = 400;

/**
 * Logos do cabeçalho do mapa, nas versões dos dois temas. A página só baixa a
 * do tema atual (`loading="lazy"`); sem estas cópias, trocar de tema sem rede
 * deixaria a logo quebrada.
 */
const LOGOS_DO_MAPA = ["/logos/pin-claro.webp", "/logos/pin-escuro.webp", "/logos/logotipo-claro.webp", "/logos/logotipo-escuro.webp"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    Promise.all([
      caches
        .open(CACHE_PAGINA)
        .then((cache) => cache.add("/"))
        .catch(() => undefined),
      caches
        .open(CACHE_MARCA)
        .then((cache) => cache.addAll(LOGOS_DO_MAPA))
        .catch(() => undefined),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((nome) => !nome.startsWith(`${VERSAO}-`)).map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim()),
  );
});

/** Mantém só as `limite` entradas mais recentes (arquivos de deploys antigos, tiles antigos). */
async function limitarCache(nome, limite) {
  const cache = await caches.open(nome);
  const chaves = await cache.keys();
  await Promise.all(chaves.slice(0, Math.max(0, chaves.length - limite)).map((chave) => cache.delete(chave)));
}

async function redePrimeiro(requisicao) {
  const cache = await caches.open(CACHE_PAGINA);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) await cache.put("/", resposta.clone());
    return resposta;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

async function cachePrimeiro(requisicao, nomeCache, limite) {
  const cache = await caches.open(nomeCache);
  const salva = await cache.match(requisicao);
  if (salva) return salva;
  const resposta = await fetch(requisicao);
  // Só guarda respostas legíveis (mesma origem ou CORS): respostas "opacas"
  // ocupariam megabytes cada na cota do navegador.
  if (resposta.ok && resposta.type !== "opaque") {
    await cache.put(requisicao, resposta.clone());
    void limitarCache(nomeCache, limite);
  }
  return resposta;
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate" && url.pathname === "/") {
      evento.respondWith(redePrimeiro(request));
    } else if (url.pathname.startsWith("/_next/static/")) {
      evento.respondWith(cachePrimeiro(request, CACHE_ESTATICOS, LIMITE_ESTATICOS));
    } else if (url.pathname.startsWith("/logos/")) {
      evento.respondWith(cachePrimeiro(request, CACHE_MARCA, LIMITE_MARCA));
    }
    return;
  }

  if (url.hostname.endsWith("tile.openstreetmap.fr")) {
    evento.respondWith(cachePrimeiro(request, CACHE_TILES, LIMITE_TILES));
  }
});
