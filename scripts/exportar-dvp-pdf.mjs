/**
 * Exportador fiel do DVP_WhereToGo.md para DVP_WhereToGo.pdf no modelo oficial UPF.
 *
 * Uso:
 *   node scripts/exportar-dvp-pdf.mjs
 *
 * Sem dependências externas: usa Node.js puro + Google Chrome (ou Edge) headless
 * e mede os números de página reais diretamente das âncoras (/Dests) do PDF
 * gerado na primeira passagem para preencher o Sumário na segunda passagem.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = process.cwd();
const CAMINHO_MD = path.join(RAIZ, "DVP_WhereToGo.md");
const CAMINHO_PDF = path.join(RAIZ, "DVP_WhereToGo.pdf");

const NAVEGADORES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function encontrarNavegador() {
  for (const candidato of NAVEGADORES) {
    if (fs.existsSync(candidato)) return candidato;
  }
  throw new Error(
    "Nenhum navegador Chromium (Chrome ou Edge) encontrado para gerar o PDF.",
  );
}

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatarInline(texto) {
  const tokens = [];
  let processado = escaparHtml(texto);

  processado = processado.replace(/`([^`]+)`/g, (_, codigo) => {
    const idx = tokens.length;
    tokens.push(`<code>${codigo}</code>`);
    return `\u0000TOK${idx}\u0000`;
  });

  processado = processado.replace(
    /\*\*([^*]+)\*\*/g,
    (_, conteudo) => `<strong>${conteudo}</strong>`,
  );
  processado = processado.replace(
    /(^|[\s(])\*([^*]+)\*(?=[\s).,;:!?]|$)/g,
    (_, antes, conteudo) => `${antes}<em>${conteudo}</em>`,
  );

  processado = processado.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  processado = processado.replace(/\u0000TOK(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
  return processado;
}

function dividirLinhaTabela(linha) {
  const limpa = linha.trim().replace(/^\|/, "").replace(/\|$/, "");
  return limpa.split("|").map((c) => c.trim());
}

function ehSeparadorTabela(linha) {
  const celulas = dividirLinhaTabela(linha);
  return celulas.length > 0 && celulas.every((c) => /^:?-+:?$/.test(c));
}

function slugSecao(titulo) {
  return (
    "sec-" +
    titulo
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

function separarNumeroETitulo(texto) {
  const m = texto.match(/^(\d+(?:\.\d+)*\.)\s+(.+)$/);
  if (!m) return { numero: "", titulo: texto };
  return { numero: m[1], titulo: m[2] };
}

/** Extrai capa, metadados de cabeçalho/rodapé, seções e blocos do Markdown. */
function analisarMarkdown(conteudoMd) {
  const linhas = conteudoMd.replace(/\r\n/g, "\n").split("\n");

  const capa = {
    instituicao: "Universidade de Passo Fundo – UPF",
    tipo: "DOCUMENTO DE VISÃO DO PRODUTO - DVP",
    projeto: "WhereToGo",
    autor: "João Vitor de For dos Santos",
    ano: "2026",
  };
  const meta = {
    instituicao: "UNIVERSIDADE DE PASSO FUNDO – UPF",
    data: "23/11/2026",
    projetoLinha: "Projeto WhereToGo Documento de Visão do Produto - DVP",
    versao: "Versão: 2.0",
    rodape: "ADS/CCC/ECP – PROF. JEANGREI VEIGA /ALEXANDRE ZANATTA",
  };

  let idx = 0;
  // Bloco da capa (<div align="center"> ... </div>)
  while (idx < linhas.length && !linhas[idx].trim().startsWith("---")) {
    const l = linhas[idx].trim();
    const h3 = l.match(/<h3>(.*?)<\/h3>/i);
    if (h3) capa.instituicao = h3[1].trim();
    const h1 = l.match(/<h1>(.*?)<\/h1>/i);
    if (h1) capa.tipo = h1[1].trim();
    const h2 = l.match(/<h2>(.*?)<\/h2>/i);
    if (h2) capa.projeto = h2[1].trim();
    const pb = l.match(/<p><b>(.*?)<\/b><\/p>/i);
    if (pb) capa.autor = pb[1].trim();
    const py = l.match(/<p>(\d{4})<\/p>/i);
    if (py) capa.ano = py[1].trim();
    idx++;
  }
  if (idx < linhas.length && linhas[idx].trim() === "---") idx++;

  // Metadados entre o 1º e o 2º ---
  const linhasMeta = [];
  while (idx < linhas.length && linhas[idx].trim() !== "---") {
    if (linhas[idx].trim()) linhasMeta.push(linhas[idx].trim());
    idx++;
  }
  if (idx < linhas.length && linhas[idx].trim() === "---") idx++;

  if (linhasMeta[0]) {
    const partes = linhasMeta[0].split("|").map((s) => s.replace(/\*\*/g, "").trim());
    if (partes[0]) meta.instituicao = partes[0];
    if (partes[1]) meta.data = partes[1];
  }
  if (linhasMeta[1]) {
    const partes = linhasMeta[1].split("|").map((s) => s.replace(/\*\*/g, "").trim());
    if (partes[0]) meta.projetoLinha = partes[0];
    if (partes[1]) meta.versao = partes[1];
  }
  if (linhasMeta[2]) {
    meta.rodape = linhasMeta[2].replace(/^\*|\*$/g, "").trim();
  }

  // Analisa o restante em blocos estruturados
  let tabelaHistorico = null;
  const itensSumario = [];
  const blocosCorpo = [];
  let secaoAtual = "";
  let modoSumario = false;
  let ignorarAteHr = false;

  while (idx < linhas.length) {
    const linha = linhas[idx];
    const trim = linha.trim();

    if (!trim) {
      idx++;
      continue;
    }

    if (trim === "---") {
      if (modoSumario) modoSumario = false;
      ignorarAteHr = false;
      idx++;
      continue;
    }

    // Cabeçalhos Markdown
    const mHead = trim.match(/^(#{1,4})\s+(.+)$/);
    if (mHead) {
      const nivel = mHead[1].length;
      const texto = mHead[2].trim();

      if (/^Histórico de alterações/i.test(texto)) {
        secaoAtual = "historico";
        modoSumario = false;
        idx++;
        // Lê a tabela logo abaixo
        while (idx < linhas.length && !linhas[idx].trim()) idx++;
        if (idx < linhas.length && linhas[idx].trim().startsWith("|")) {
          const tblLinhas = [];
          while (idx < linhas.length && linhas[idx].trim().startsWith("|")) {
            tblLinhas.push(linhas[idx]);
            idx++;
          }
          tabelaHistorico = analisarTabela(tblLinhas);
        }
        continue;
      }

      if (/^Sumário$/i.test(texto)) {
        secaoAtual = "sumario";
        modoSumario = true;
        idx++;
        continue;
      }

      modoSumario = false;
      secaoAtual = texto;
      const id = slugSecao(texto);
      blocosCorpo.push({ tipo: "heading", nivel, texto, id });
      idx++;
      continue;
    }

    if (modoSumario) {
      const indentMatch = linha.match(/^(\s*)/);
      const espacos = indentMatch ? indentMatch[1].length : 0;
      const nivelToc =
        espacos === 0 ? 1 : espacos <= 3 ? 2 : espacos <= 6 ? 3 : 4;
      itensSumario.push({
        nivel: nivelToc,
        texto: trim,
        id: slugSecao(trim),
      });
      idx++;
      continue;
    }

    if (ignorarAteHr) {
      idx++;
      continue;
    }

    // Imagem (SVG)
    const mImg = trim.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (mImg) {
      blocosCorpo.push({
        tipo: "imagem",
        alt: mImg[1],
        src: mImg[2],
        secao: secaoAtual,
      });
      idx++;
      continue;
    }

    // Tabela Markdown
    if (trim.startsWith("|")) {
      const tblLinhas = [];
      while (idx < linhas.length && linhas[idx].trim().startsWith("|")) {
        tblLinhas.push(linhas[idx]);
        idx++;
      }
      blocosCorpo.push({
        tipo: "tabela",
        secao: secaoAtual,
        ...analisarTabela(tblLinhas),
      });
      continue;
    }

    // Lista com marcadores
    if (/^\*\s+/.test(trim)) {
      const itens = [];
      while (idx < linhas.length && /^\*\s+/.test(linhas[idx].trim())) {
        itens.push(linhas[idx].trim().replace(/^\*\s+/, ""));
        idx++;
      }
      blocosCorpo.push({
        tipo: "lista",
        secao: secaoAtual,
        itens,
      });
      continue;
    }

    // Parágrafo
    const paragrafo = [trim];
    idx++;
    while (
      idx < linhas.length &&
      linhas[idx].trim() &&
      !linhas[idx].trim().startsWith("#") &&
      !linhas[idx].trim().startsWith("|") &&
      !linhas[idx].trim().startsWith("---") &&
      !/^\*\s+/.test(linhas[idx].trim()) &&
      !/^!\[/.test(linhas[idx].trim())
    ) {
      paragrafo.push(linhas[idx].trim());
      idx++;
    }
    blocosCorpo.push({
      tipo: "paragrafo",
      secao: secaoAtual,
      texto: paragrafo.join(" "),
    });
  }

  return { capa, meta, tabelaHistorico, itensSumario, blocosCorpo };
}

function analisarTabela(linhas) {
  const cabecalho = dividirLinhaTabela(linhas[0]);
  let inicioLinhas = 1;
  if (linhas[1] && ehSeparadorTabela(linhas[1])) {
    inicioLinhas = 2;
  }
  const corpo = [];
  for (let i = inicioLinhas; i < linhas.length; i++) {
    corpo.push(dividirLinhaTabela(linhas[i]));
  }
  return { cabecalho, corpo };
}

function ehBlocoRf(bloco) {
  if (bloco?.tipo !== "lista") return false;
  return bloco.itens.some((it) => /^\*\*Importância:\*\*/i.test(it));
}

function formatarCaixasRf(texto) {
  const normalizado = texto
    .replace(/\[\s*x\s*\]/gi, "[ x ]")
    .replace(/\[\s*\]/g, "[   ]")
    .replace(/\s+\[/g, "\u00A0\u00A0\u00A0[");
  return escaparHtml(normalizado).replace(/ /g, "&nbsp;");
}

function renderizarCardRf(bloco) {
  const campos = {};
  for (const item of bloco.itens) {
    const m = item.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (m) {
      campos[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }
  const imp = campos["importância"] ?? "";
  const pri = campos["priorização"] ?? "";
  const dep =
    campos["dependência com outro(s) requisito(s)"] ??
    campos["dependência"] ??
    "Nenhuma";
  const prob = campos["problema / necessidades identificadas"] ?? "";

  return `
    <table class="tbl-rf">
      <tr>
        <td class="rf-lbl">Importância:</td>
        <td class="rf-val">${formatarCaixasRf(imp)}</td>
      </tr>
      <tr>
        <td class="rf-lbl">Priorização:</td>
        <td class="rf-val">${formatarCaixasRf(pri)}</td>
      </tr>
      <tr>
        <td class="rf-lbl">Dependência com outro(s) requisito(s):</td>
        <td class="rf-val"><em>${formatarInline(dep)}</em></td>
      </tr>
      <tr>
        <td colspan="2" class="rf-prob">
          <strong>Problema /Necessidades Identificadas:</strong><br>
          <em>${formatarInline(prob)}</em>
        </td>
      </tr>
    </table>
  `;
}

function renderizarTabelaUc(tabela) {
  const mapa = {};
  for (const linha of tabela.corpo) {
    const chave = linha[0].replace(/\*\*/g, "").replace(/:$/, "").trim();
    mapa[chave] = linha[1] ?? "";
  }
  const objetivo = mapa["Objetivo"] ?? "";
  const historia = (mapa["História"] ?? "").replace(/\*\*/g, "");
  const descricao = mapa["Descrição"] ?? "";
  const regras = mapa["Regras de Negócio"] ?? "";
  const criterios = mapa["Critérios de Aceite"] ?? "";

  return `
    <table class="tbl-uc-outer">
      <tr>
        <td class="uc-obj-lbl">Objetivo:</td>
        <td class="uc-obj-val">${formatarInline(objetivo)}</td>
      </tr>
      <tr>
        <td colspan="2" class="uc-banner">HISTÓRIAS DE USUÁRIOS</td>
      </tr>
      <tr>
        <td colspan="2" class="uc-inner-cell">
          <table class="tbl-uc-inner">
            <tr>
              <td class="uc-sub-lbl">História:</td>
              <td class="uc-hist-val"><strong>${formatarInline(historia)}</strong></td>
            </tr>
            <tr>
              <td class="uc-sub-lbl">Descrição:</td>
              <td class="uc-sub-val">${formatarInline(descricao)}</td>
            </tr>
            <tr>
              <td class="uc-sub-lbl">Regras de Negócio:</td>
              <td class="uc-sub-val">${formatarInline(regras)}</td>
            </tr>
            <tr>
              <td class="uc-sub-lbl">Critérios de Aceite:</td>
              <td class="uc-sub-val">${formatarInline(criterios)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderizarTabelaTipoB(tabela, bannerTitulo, colWidths = []) {
  const cols = tabela.cabecalho.length;
  const colgroup =
    colWidths.length === cols
      ? `<colgroup>${colWidths.map((w) => `<col style="width:${w}">`).join("")}</colgroup>`
      : "";
  const ths = tabela.cabecalho
    .map((h) => `<th>${escaparHtml(h.replace(/\s*\(Nome\)/i, ""))}</th>`)
    .join("");
  const trs = tabela.corpo
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${formatarInline(c)}</td>`).join("")}</tr>`,
    )
    .join("\n");

  return `
    <table class="tbl-padrao">
      ${colgroup}
      <thead>
        <tr><th colspan="${cols}" class="tbl-banner">${escaparHtml(bannerTitulo)}</th></tr>
        <tr class="tbl-subhdr">${ths}</tr>
      </thead>
      <tbody>
        ${trs}
      </tbody>
    </table>
  `;
}

function renderizarTabelaRnf(tabela) {
  const trs = tabela.corpo
    .map(
      (row) =>
        `<tr><td class="rnf-id">${formatarInline(row[0] ?? "")}</td><td>${formatarInline(row[1] ?? "")}</td></tr>`,
    )
    .join("\n");

  return `
    <table class="tbl-rnf">
      <colgroup><col style="width:20%"><col style="width:80%"></colgroup>
      <thead>
        <tr>
          <th>${escaparHtml(tabela.cabecalho[0] ?? "Identificação")}</th>
          <th>${escaparHtml(tabela.cabecalho[1] ?? "Descrição")}</th>
        </tr>
      </thead>
      <tbody>
        ${trs}
      </tbody>
    </table>
  `;
}

function renderizarTabelaHistorico(tabela) {
  const ths = tabela.cabecalho
    .map((h) => `<th>${escaparHtml(h)}</th>`)
    .join("");
  const trs = tabela.corpo
    .map((row) => {
      const [v, alt, resp, dt] = row;
      return `<tr>
        <td class="hist-ver">${escaparHtml(v ?? "")}</td>
        <td>${formatarInline(alt ?? "")}</td>
        <td class="hist-resp">${escaparHtml(resp ?? "")}</td>
        <td class="hist-data">${escaparHtml(dt ?? "")}</td>
      </tr>`;
    })
    .join("\n");

  return `
    <table class="tbl-historico">
      <colgroup>
        <col style="width:9%">
        <col style="width:58%">
        <col style="width:23%">
        <col style="width:10%">
      </colgroup>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  `;
}

function gerarHtml(dados, mapaPaginas = new Map()) {
  const { capa, meta, tabelaHistorico, itensSumario, blocosCorpo } = dados;

  // Renderiza capa
  const htmlCapa = `
    <section class="capa">
      <div class="capa-topo">
        <div class="capa-inst">${escaparHtml(capa.instituicao)}</div>
        <div class="capa-barra"></div>
      </div>
      <div class="capa-centro">
        <div class="capa-titulo">${escaparHtml(capa.tipo)}</div>
        <div class="capa-produto">${escaparHtml(capa.projeto)}</div>
      </div>
      <div class="capa-rodape">
        <div class="capa-autor">${escaparHtml(capa.autor)}</div>
        <div class="capa-ano">${escaparHtml(capa.ano)}</div>
      </div>
    </section>
  `;

  // Renderiza histórico
  const htmlHistorico = `
    <section class="secao-historico">
      <h2 class="titulo-historico">Histórico de alterações do documento</h2>
      ${tabelaHistorico ? renderizarTabelaHistorico(tabelaHistorico) : ""}
    </section>
  `;

  // Renderiza Sumário
  const linhasSumario = itensSumario
    .map((item) => {
      const { numero, titulo } = separarNumeroETitulo(item.texto);
      const pag = mapaPaginas.get(item.id) ?? "0";
      const ehRf = item.nivel === 4 && /^1\.3\.1\.\d+\./.test(numero);
      const clsNivel = `toc-n${item.nivel}${ehRf ? " toc-rf" : ""}`;
      return `
        <a class="toc-item ${clsNivel}" href="#${item.id}">
          <span class="toc-num">${escaparHtml(numero)}</span>
          <span class="toc-txt">${escaparHtml(titulo)}</span>
          <span class="toc-dots"></span>
          <span class="toc-pg">${pag}</span>
        </a>
      `;
    })
    .join("\n");

  const htmlSumario = `
    <section class="secao-sumario">
      <h2 class="titulo-sumario">Sumário</h2>
      <div class="toc-lista">
        ${linhasSumario}
      </div>
    </section>
  `;

  // Renderiza o corpo
  const partesCorpo = [];
  for (let i = 0; i < blocosCorpo.length; i++) {
    const b = blocosCorpo[i];

    if (b.tipo === "heading") {
      const { numero, titulo } = separarNumeroETitulo(b.texto);
      if (b.nivel === 1) {
        const comLinha = !/^1\./.test(numero);
        const quebraAntes = /^2\.|^3\./.test(numero) ? " quebra-antes" : "";
        partesCorpo.push(
          `<h1 id="${b.id}" class="h1-upf${comLinha ? " h1-com-linha" : ""}${quebraAntes}"><span class="h-num-1">${escaparHtml(numero)}</span><span>${escaparHtml(titulo)}</span></h1>`,
        );
      } else if (b.nivel === 2) {
        partesCorpo.push(
          `<h2 id="${b.id}" class="h2-upf"><span class="h-num-2">${escaparHtml(numero)}</span><span>${escaparHtml(titulo)}</span></h2>`,
        );
      } else if (b.nivel === 3) {
        const ehUml = /^1\.4\.1\./.test(numero);
        partesCorpo.push(
          `<h3 id="${b.id}" class="h3-upf${ehUml ? " quebra-se-preciso" : ""}"><span class="h-num-3">${escaparHtml(numero)}</span><span>${escaparHtml(titulo)}</span></h3>`,
        );
      } else {
        const ehRf = /^1\.3\.1\./.test(numero);
        partesCorpo.push(
          `<h4 id="${b.id}" class="h4-upf ${ehRf ? "h4-rf" : "h4-uc"}"><span class="h-num-4">${escaparHtml(numero)}</span><span>${escaparHtml(titulo)}</span></h4>`,
        );
      }
      continue;
    }

    if (b.tipo === "lista") {
      if (ehBlocoRf(b)) {
        partesCorpo.push(renderizarCardRf(b));
        continue;
      }
      const ehArquitetura = /2\.1\./.test(b.secao);
      const clsLista = ehArquitetura ? "lista-upf lista-italica" : "lista-upf";
      const lis = b.itens
        .map((it) => `<li>${formatarInline(it)}</li>`)
        .join("\n");
      partesCorpo.push(`<ul class="${clsLista}">${lis}</ul>`);
      continue;
    }

    if (b.tipo === "paragrafo") {
      const ehDomOuArq = /1\.2\.1\.|2\.1\./.test(b.secao);
      const ehNotaCrono = /^\*\([^)]+\)\*$/.test(b.texto);
      const ehRotuloLista = /^\*\*(Atores|Casos de Uso[^*]*):\*\*$/i.test(b.texto.trim());
      if (ehRotuloLista) {
        partesCorpo.push(`<p class="p-label-lista">${formatarInline(b.texto)}</p>`);
      } else if (/1\.4\.1\./.test(b.secao)) {
        partesCorpo.push(`<p class="p-normal">${formatarInline(b.texto)}</p>`);
      } else if (ehDomOuArq) {
        partesCorpo.push(`<p class="p-just-italico">${formatarInline(b.texto)}</p>`);
      } else if (ehNotaCrono) {
        partesCorpo.push(
          `<p class="p-normal">Adicionar na tabela abaixo, os itens que serão entregues durante a etapa de codificação e testes do produto. ${escaparHtml(b.texto.replace(/^\*\(|\)\*$/g, ""))}.</p>`,
        );
      } else {
        partesCorpo.push(`<p class="p-normal">${formatarInline(b.texto)}</p>`);
      }
      continue;
    }

    if (b.tipo === "imagem") {
      const caminhoSvg = path.resolve(RAIZ, b.src);
      let conteudo = "";
      if (fs.existsSync(caminhoSvg) && caminhoSvg.endsWith(".svg")) {
        conteudo = fs.readFileSync(caminhoSvg, "utf8");
      } else {
        conteudo = `<img src="${pathToFileURL(caminhoSvg).href}" alt="${escaparHtml(b.alt)}">`;
      }
      const ehUml = /uml/i.test(b.src);
      partesCorpo.push(
        `<div class="diagrama-wrap ${ehUml ? "diagrama-uml" : "diagrama-der"}">${conteudo}</div>`,
      );
      continue;
    }

    if (b.tipo === "tabela") {
      const hdr = b.cabecalho.join("|");
      if (/Tópico\|Detalhe/i.test(hdr)) {
        partesCorpo.push(renderizarTabelaUc(b));
      } else if (/STAKEHOLDER/i.test(hdr)) {
        partesCorpo.push(
          renderizarTabelaTipoB(b, "STAKEHOLDER", ["21%", "62%", "17%"]),
        );
      } else if (/Identificação\|Descrição/i.test(hdr)) {
        partesCorpo.push(renderizarTabelaRnf(b));
      } else if (/Descrição\|Versão\|Objetivo/i.test(hdr)) {
        partesCorpo.push(
          `<p class="p-normal">A tabela abaixo relaciona as tecnologias, bibliotecas e plataformas efetivamente utilizadas no desenvolvimento e implantação do projeto.</p>` +
            renderizarTabelaTipoB(b, "Ferramentas e Tecnologias Utilizadas", [
              "26%",
              "14%",
              "60%",
            ]),
        );
      } else if (/DATA\|ENTREGA/i.test(hdr)) {
        partesCorpo.push(
          renderizarTabelaTipoB(b, "Cronograma de Codificação do Projeto", [
            "24%",
            "76%",
          ]),
        );
      } else {
        partesCorpo.push(renderizarTabelaTipoB(b, b.secao));
      }
    }
  }

  // Escapa strings para CSS content
  const cssStr = (s) =>
    String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>DVP - WhereToGo</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 24.5mm 21mm 17.5mm 21mm;
      @top-left {
        content: "${cssStr(meta.instituicao)}\\A${cssStr(meta.projetoLinha)}";
        white-space: pre;
        font-family: Calibri, Arial, Helvetica, sans-serif;
        font-size: 9pt;
        color: #595959;
        border: 0.75pt solid #404040;
        border-right: none;
        padding: 1.5pt 6pt;
        vertical-align: middle;
        text-align: left;
        line-height: 1.5;
        background: linear-gradient(to bottom, transparent 49%, #404040 49%, #404040 calc(49% + 0.75pt), transparent calc(49% + 0.75pt));
        margin-bottom: 4.5mm;
        height: 10.5mm;
        width: 78%;
      }
      @top-right {
        content: "${cssStr(meta.data)}\\A${cssStr(meta.versao)}";
        white-space: pre;
        font-family: Calibri, Arial, Helvetica, sans-serif;
        font-size: 9pt;
        color: #595959;
        border: 0.75pt solid #404040;
        padding: 1.5pt 6pt;
        vertical-align: middle;
        text-align: right;
        line-height: 1.5;
        background: linear-gradient(to bottom, transparent 49%, #404040 49%, #404040 calc(49% + 0.75pt), transparent calc(49% + 0.75pt));
        margin-bottom: 4.5mm;
        height: 10.5mm;
        width: 22%;
      }
      @bottom-left {
        content: "${cssStr(meta.rodape)}";
        font-family: Calibri, Arial, Helvetica, sans-serif;
        font-size: 8pt;
        color: #666666;
        border: 0.75pt solid #404040;
        border-right: none;
        padding: 1.5pt 6pt;
        vertical-align: middle;
        text-align: left;
        height: 6mm;
        margin-top: 3.5mm;
        width: 78%;
      }
      @bottom-right {
        content: counter(page);
        font-family: Calibri, Arial, Helvetica, sans-serif;
        font-size: 9.5pt;
        color: #000000;
        border: 0.75pt solid #404040;
        padding: 1.5pt 6pt;
        vertical-align: middle;
        text-align: right;
        height: 6mm;
        margin-top: 3.5mm;
        width: 22%;
      }
    }

    @page :first {
      margin: 22mm 21mm 20mm 21mm;
      counter-increment: page 0;
      @top-left { content: none; border: none; background: none; }
      @top-right { content: none; border: none; background: none; }
      @bottom-left { content: none; border: none; background: none; }
      @bottom-right { content: none; border: none; background: none; }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #000000;
      font-size: 9.5pt;
      line-height: 1.35;
    }

    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 8.3pt;
      background: #F4F4F4;
      padding: 0.5pt 2.5pt;
      border-radius: 2pt;
    }

    /* ================= CAPA ================= */
    .capa {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 252mm;
      break-after: page;
    }
    .capa-inst {
      font-size: 11.5pt;
      color: #000000;
      margin-bottom: 5mm;
    }
    .capa-barra {
      width: 100%;
      height: 3.5pt;
      background-color: #8C8C8C;
    }
    .capa-centro {
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 44mm;
      margin-top: 6mm;
    }
    .capa-titulo {
      font-size: 19pt;
      font-weight: 400;
      letter-spacing: 0.2pt;
      color: #000000;
    }
    .capa-produto {
      font-size: 25pt;
      font-weight: 700;
      color: #000000;
    }
    .capa-rodape {
      text-align: center;
      margin-bottom: 10mm;
      font-size: 11pt;
      line-height: 1.5;
    }

    /* ================= HISTÓRICO ================= */
    .secao-historico {
      break-after: page;
    }
    .titulo-historico {
      font-size: 14.5pt;
      font-weight: 700;
      color: #943634;
      margin: 0 0 12pt 0;
    }
    .tbl-historico {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.8pt;
    }
    .tbl-historico th {
      background: #FFFFFF;
      border: 0.75pt solid #000000;
      padding: 3.5pt 5pt;
      font-weight: 700;
      font-style: italic;
      text-align: center;
    }
    .tbl-historico td {
      border: 0.75pt solid #000000;
      padding: 3.5pt 5pt;
      vertical-align: top;
    }
    .hist-ver, .hist-resp, .hist-data {
      text-align: center;
    }

    /* ================= SUMÁRIO ================= */
    .secao-sumario {
      break-after: page;
    }
    .titulo-sumario {
      font-size: 14.5pt;
      font-weight: 700;
      color: #595959;
      margin: 0 0 10pt 0;
    }
    .toc-lista {
      display: flex;
      flex-direction: column;
      gap: 2.2pt;
    }
    .toc-item {
      display: flex;
      align-items: baseline;
      text-decoration: none;
      color: #000000;
      font-size: 9pt;
      line-height: 1.28;
    }
    .toc-n1 { padding-left: 0; font-weight: 400; margin-top: 2pt; }
    .toc-n2 { padding-left: 14pt; }
    .toc-n3 { padding-left: 26pt; }
    .toc-n4 { padding-left: 36pt; font-size: 8.1pt; }
    .toc-rf { font-style: italic; }
    .toc-num {
      flex-shrink: 0;
      min-width: 24pt;
      margin-right: 4pt;
    }
    .toc-n4 .toc-num { min-width: 28pt; }
    .toc-txt { flex-shrink: 1; }
    .toc-dots {
      flex: 1 1 auto;
      border-bottom: 1pt dotted #000000;
      margin: 0 4pt 2.2pt 4pt;
      min-width: 10pt;
    }
    .toc-pg {
      flex-shrink: 0;
      min-width: 14pt;
      text-align: right;
    }

    /* ================= TÍTULOS DAS SEÇÕES ================= */
    .h1-upf {
      font-size: 13.5pt;
      font-weight: 700;
      color: #943634;
      margin: 6pt 0 9pt 0;
      break-after: avoid;
      display: flex;
      align-items: baseline;
    }
    .h1-com-linha {
      border-bottom: 0.75pt solid #000000;
      padding-bottom: 2pt;
      margin-top: 10pt;
    }
    .quebra-antes { break-before: page; }
    .h-num-1 { min-width: 24pt; display: inline-block; }

    .h2-upf {
      font-size: 12pt;
      font-weight: 700;
      color: #943634;
      margin: 11pt 0 7pt 12pt;
      border-bottom: 0.75pt solid #000000;
      padding-bottom: 1.5pt;
      break-after: avoid;
      display: flex;
      align-items: baseline;
    }
    .h-num-2 { min-width: 34pt; display: inline-block; }

    .h3-upf {
      font-size: 11pt;
      font-weight: 400;
      color: #943634;
      margin: 9pt 0 6pt 24pt;
      border-bottom: 0.75pt solid #000000;
      padding-bottom: 1.5pt;
      break-after: avoid;
      display: flex;
      align-items: baseline;
    }
    .h-num-3 { min-width: 38pt; display: inline-block; }

    .h4-upf {
      font-size: 10.5pt;
      font-weight: 400;
      color: #943634;
      margin: 9pt 0 5pt 34pt;
      border-bottom: 0.75pt solid #000000;
      padding-bottom: 1.5pt;
      break-after: avoid;
      display: flex;
      align-items: baseline;
    }
    .h4-rf { font-style: italic; }
    .h4-uc { font-style: normal; }
    .h-num-4 { min-width: 44pt; display: inline-block; flex-shrink: 0; }

    /* ================= PARÁGRAFOS E LISTAS ================= */
    .p-normal {
      font-size: 9.2pt;
      margin: 4pt 0 7pt 0;
      text-align: left;
    }
    .p-label-lista {
      font-size: 9.2pt;
      margin: 7pt 0 3pt 0;
      break-after: avoid;
    }
    .p-just-italico {
      font-size: 9.2pt;
      font-style: italic;
      text-align: justify;
      margin: 4pt 0 7pt 0;
      line-height: 1.38;
    }
    .lista-upf {
      font-size: 9pt;
      margin: 4pt 0 8pt 16pt;
      padding-left: 12pt;
    }
    .lista-upf li {
      margin-bottom: 3.5pt;
      text-align: justify;
    }
    .lista-italica li { font-style: italic; }

    /* ================= TABELA RF (TIPO C) ================= */
    .tbl-rf {
      width: 100%;
      border-collapse: collapse;
      margin: 4pt 0 10pt 0;
      font-size: 8.8pt;
      break-inside: avoid;
    }
    .tbl-rf td {
      border: 0.75pt solid #000000;
      padding: 3.5pt 6pt;
      vertical-align: top;
      background: #FFFFFF;
    }
    .rf-lbl { width: 46%; font-weight: 700; }
    .rf-val { width: 54%; }
    .rf-prob { line-height: 1.35; }

    /* ================= TABELA RNF (TIPO D) ================= */
    .tbl-rnf {
      width: 100%;
      border-collapse: collapse;
      margin: 5pt 0 10pt 0;
      font-size: 8.6pt;
    }
    .tbl-rnf th {
      background: #FAC090;
      border: 0.75pt solid #000000;
      padding: 4pt 6pt;
      font-weight: 700;
      text-align: center;
    }
    .tbl-rnf td {
      border: 0.75pt solid #000000;
      padding: 4pt 6pt;
      vertical-align: top;
      background: #FFFFFF;
    }
    .tbl-rnf tr { break-inside: avoid; }
    .rnf-id { font-weight: 400; }

    /* ================= TABELAS TIPO B (STAKEHOLDERS / TECH / CRONO) ================= */
    .tbl-padrao {
      width: 100%;
      border-collapse: collapse;
      margin: 5pt 0 10pt 0;
      font-size: 8.5pt;
    }
    .tbl-padrao thead { display: table-header-group; }
    .tbl-padrao tr { break-inside: avoid; }
    .tbl-padrao .tbl-banner {
      background: #FAC090;
      border: 0.75pt solid #000000;
      padding: 3.5pt 6pt;
      font-weight: 700;
      text-align: left;
    }
    .tbl-padrao .tbl-subhdr th {
      background: #FDE9D9;
      border: 0.75pt solid #000000;
      padding: 3.5pt 6pt;
      font-weight: 400;
      text-align: center;
    }
    .tbl-padrao td {
      border: 0.75pt solid #000000;
      padding: 3.5pt 6pt;
      vertical-align: top;
      background: #FFFFFF;
    }

    /* ================= TABELA UC (TIPO E) ================= */
    .tbl-uc-outer {
      width: 100%;
      border-collapse: collapse;
      margin: 5pt 0 11pt 0;
      font-size: 8.5pt;
      break-inside: avoid;
    }
    .tbl-uc-outer > tbody > tr > td {
      border: 0.75pt solid #000000;
    }
    .uc-obj-lbl {
      width: 21%;
      background: #FAC090;
      font-weight: 700;
      padding: 4pt 6pt;
      vertical-align: top;
    }
    .uc-obj-val {
      width: 79%;
      background: #FFFFFF;
      padding: 4pt 6pt;
      vertical-align: top;
    }
    .uc-banner {
      background: #FAC090;
      font-weight: 700;
      text-align: center;
      padding: 3pt 6pt;
    }
    .uc-inner-cell {
      padding: 4.5pt;
      background: #FFFFFF;
    }
    .tbl-uc-inner {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.4pt;
    }
    .tbl-uc-inner td {
      border: 0.75pt solid #000000;
      padding: 3.5pt 6pt;
      vertical-align: top;
    }
    .uc-sub-lbl {
      width: 21%;
      background: #FDE9D9;
      font-weight: 700;
    }
    .uc-hist-val {
      width: 79%;
      background: #EDEDED;
    }
    .uc-sub-val {
      width: 79%;
      background: #FFFFFF;
      line-height: 1.32;
    }

    /* ================= DIAGRAMAS SVG ================= */
    .diagrama-wrap {
      margin: 6pt auto 8pt auto;
      text-align: center;
      break-inside: avoid;
    }
    .diagrama-uml svg {
      width: 100%;
      max-height: 205mm;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .diagrama-der svg {
      width: 100%;
      max-height: 175mm;
      height: auto;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  ${htmlCapa}
  ${htmlHistorico}
  ${htmlSumario}
  <main class="corpo-principal">
    ${partesCorpo.join("\n")}
  </main>
</body>
</html>`;
}

function imprimirPdf(navegador, htmlPath, pdfPath, perfilDir) {
  const res = spawnSync(
    navegador,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--user-data-dir=${perfilDir}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (res.status !== 0 || !fs.existsSync(pdfPath)) {
    throw new Error(
      `Falha ao gerar PDF (${res.status}): ${res.stderr || res.error?.message}`,
    );
  }
}

/**
 * Extrai do PDF os números de página do documento (1 = página após a capa)
 * correspondentes a cada âncora id (`sec-...`) listada em /Dests.
 */
function extrairMapaPaginasDoPdf(pdfPath) {
  const bruto = fs.readFileSync(pdfPath, "latin1");

  // Localiza /Pages raiz e constrói a lista ordenada de objetos /Page
  const mapaObjetos = new Map();
  const rxObj = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
  let m;
  while ((m = rxObj.exec(bruto)) !== null) {
    mapaObjetos.set(`${m[1]} 0 R`, m[2]);
  }

  let raizPagesRef = null;
  for (const [, corpo] of mapaObjetos) {
    if (/\/Type\s*\/Catalog\b/.test(corpo)) {
      const mp = corpo.match(/\/Pages\s+(\d+\s+0\s+R)/);
      if (mp) raizPagesRef = mp[1];
      break;
    }
  }
  if (!raizPagesRef) return new Map();

  const paginasOrdenadas = [];
  function percorrerPages(ref) {
    const corpo = mapaObjetos.get(ref);
    if (!corpo) return;
    if (/\/Type\s*\/Page\b/.test(corpo) && !/\/Type\s*\/Pages\b/.test(corpo)) {
      paginasOrdenadas.push(ref);
      return;
    }
    const mk = corpo.match(/\/Kids\s*\[([^\]]+)\]/);
    if (!mk) return;
    const refs = mk[1].match(/\d+\s+0\s+R/g) ?? [];
    for (const r of refs) percorrerPages(r);
  }
  percorrerPages(raizPagesRef);

  // Indice 0 é a capa; documento começa em 1 na página índice 1
  const refParaNumeroDoc = new Map();
  paginasOrdenadas.forEach((ref, idxPdf) => {
    refParaNumeroDoc.set(ref, Math.max(1, idxPdf));
  });

  // Lê /Dests (dicionário direto ou árvore /Names)
  const resultado = new Map();
  for (const [, corpo] of mapaObjetos) {
    if (/\/Type\s*\/Catalog\b/.test(corpo)) {
      const md = corpo.match(/\/Dests\s+(\d+\s+0\s+R)/);
      if (md && mapaObjetos.has(md[1])) {
        analisarDests(mapaObjetos.get(md[1]), refParaNumeroDoc, resultado);
      }
      const mn = corpo.match(/\/Names\s*<<[\s\S]*?\/Dests\s+(\d+\s+0\s+R)/);
      if (mn && mapaObjetos.has(mn[1])) {
        percorrerNameTree(mn[1], mapaObjetos, refParaNumeroDoc, resultado);
      }
      break;
    }
  }
  return resultado;
}

function analisarDests(texto, refParaNumeroDoc, saida) {
  const rx = /\/(sec-[a-z0-9-]+)\s*\[\s*(\d+\s+0\s+R)/g;
  let m;
  while ((m = rx.exec(texto)) !== null) {
    const pg = refParaNumeroDoc.get(m[2]);
    if (pg !== undefined) saida.set(m[1], pg);
  }
}

function percorrerNameTree(ref, mapaObjetos, refParaNumeroDoc, saida) {
  const corpo = mapaObjetos.get(ref);
  if (!corpo) return;
  const mn = corpo.match(/\/Names\s*\[([\s\S]*?)\]/);
  if (mn) {
    const rx = /\((sec-[^)]+)\)\s*\[\s*(\d+\s+0\s+R)/g;
    let m;
    while ((m = rx.exec(mn[1])) !== null) {
      const pg = refParaNumeroDoc.get(m[2]);
      if (pg !== undefined) saida.set(m[1], pg);
    }
  }
  const mk = corpo.match(/\/Kids\s*\[([^\]]+)\]/);
  if (mk) {
    const refs = mk[1].match(/\d+\s+0\s+R/g) ?? [];
    for (const r of refs) percorrerNameTree(r, mapaObjetos, refParaNumeroDoc, saida);
  }
}

function main() {
  if (!fs.existsSync(CAMINHO_MD)) {
    throw new Error(`Arquivo não encontrado: ${CAMINHO_MD}`);
  }
  const navegador = encontrarNavegador();
  const md = fs.readFileSync(CAMINHO_MD, "utf8");
  const dados = analisarMarkdown(md);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wtg-dvp-"));
  const perfilDir = path.join(tmpDir, "chrome-profile");
  const htmlTemp = path.join(tmpDir, "dvp-pass1.html");
  const pdfTemp = path.join(tmpDir, "dvp-pass1.pdf");
  const htmlFinal = path.join(tmpDir, "dvp-final.html");

  try {
    // Passagem 1: layout real para medir em qual página cada seção cai
    fs.writeFileSync(htmlTemp, gerarHtml(dados), "utf8");
    imprimirPdf(navegador, htmlTemp, pdfTemp, perfilDir);
    const mapaPaginas = extrairMapaPaginasDoPdf(pdfTemp);

    // Passagem 2: injeta os números exatos no Sumário e gera DVP_WhereToGo.pdf
    fs.writeFileSync(htmlFinal, gerarHtml(dados, mapaPaginas), "utf8");
    imprimirPdf(navegador, htmlFinal, CAMINHO_PDF, perfilDir);

    const tamanhoKb = Math.round(fs.statSync(CAMINHO_PDF).size / 1024);
    console.log(
      `PDF gerado com sucesso: ${CAMINHO_PDF} (${tamanhoKb} KB, ${mapaPaginas.size} seções indexadas no Sumário)`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
