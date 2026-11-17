/*
 * Verificação de contraste WCAG (DESIGN.md §8.5, fase D) para rodar no navegador.
 *
 * Como usar: abra a tela no navegador, escolha o tema (menu "Aparência" ou
 * `localStorage.setItem("wtg:tema", "claro")` + recarregar), cole este arquivo
 * inteiro no console e pressione Enter. Repita com painéis e abas abertos: só
 * entra o que está visível.
 *
 * Para cada elemento com texto visível, mede a razão de contraste entre a cor
 * do texto e o fundo efetivo, compondo os fundos translúcidos dos ancestrais
 * (ex.: `bg-critico/12` sobre a superfície). Mínimo: 4,5:1, ou 3:1 para texto
 * grande (24 px, ou 18,66 px em negrito). Ficam de fora o mapa (Leaflet),
 * elementos `aria-hidden` e controles desabilitados (a WCAG os dispensa).
 *
 * Resultado: { tema, pagina, textos, abaixoDoMinimo, problemas[] }.
 */
(() => {
  const tela = document.createElement("canvas");
  tela.width = tela.height = 1;
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  const cache = new Map();

  /** Qualquer cor CSS (rgb, oklab, color-mix...) em [r, g, b, alfa], pelo próprio navegador. */
  function rgba(cor) {
    if (cache.has(cor)) return cache.get(cor);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const valor = [r, g, b, a / 255];
    cache.set(cor, valor);
    return valor;
  }

  const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const sobre = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];

  /** Fundo efetivo: compõe os fundos translúcidos até achar um opaco. */
  function fundo(elemento) {
    const camadas = [];
    for (let no = elemento; no; no = no.parentElement) {
      const cor = rgba(getComputedStyle(no).backgroundColor);
      if (cor[3] > 0) camadas.push(cor);
      if (cor[3] >= 0.99) break;
    }
    let base = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    for (let i = camadas.length - 1; i >= 0; i--) base = sobre(camadas[i], base);
    return base;
  }

  const problemas = [];
  let textos = 0;
  for (const elemento of document.querySelectorAll("body *")) {
    if (elemento.closest(".leaflet-container, nextjs-portal, [aria-hidden=true]")) continue;
    if (![...elemento.childNodes].some((no) => no.nodeType === Node.TEXT_NODE && no.textContent.trim())) continue;
    const caixa = elemento.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) continue;
    const estilo = getComputedStyle(elemento);
    if (estilo.visibility === "hidden" || Number(estilo.opacity) === 0) continue;
    if (elemento.closest("button:disabled, [aria-disabled=true], input:disabled, select:disabled")) continue;

    textos++;
    const corFundo = fundo(elemento);
    const corTexto = sobre(rgba(estilo.color), corFundo);
    const [clara, escura] = [luminancia(corTexto), luminancia(corFundo)].sort((x, y) => y - x);
    const razao = (clara + 0.05) / (escura + 0.05);
    const px = parseFloat(estilo.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(estilo.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    if (razao < minimo) {
      problemas.push({
        texto: elemento.textContent.trim().slice(0, 40),
        razao: Math.round(razao * 100) / 100,
        minimo,
        cor: estilo.color,
        classe: String(elemento.className).slice(0, 80),
      });
    }
  }

  return {
    tema: document.documentElement.dataset.tema,
    pagina: location.pathname,
    textos,
    abaixoDoMinimo: problemas.length,
    problemas,
  };
})();
