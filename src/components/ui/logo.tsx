import { juntarClasses } from "./classes";

interface ArquivoLogo {
  src: string;
  largura: number;
  altura: number;
}

/**
 * Cada marca em duas versões: a clara (texto branco) vai no tema escuro e a
 * escura (texto preto) no tema claro. Medidas reais dos arquivos em `public/logos`,
 * reduzidas ao tamanho de exibição.
 */
const LOGOS: Record<"pino" | "logotipo" | "completa", { temaEscuro: ArquivoLogo; temaClaro: ArquivoLogo }> = {
  pino: {
    temaEscuro: { src: "/logos/pin-claro.webp", largura: 29, altura: 36 },
    temaClaro: { src: "/logos/pin-escuro.webp", largura: 29, altura: 36 },
  },
  logotipo: {
    temaEscuro: { src: "/logos/logotipo-claro.webp", largura: 142, altura: 18 },
    temaClaro: { src: "/logos/logotipo-escuro.webp", largura: 145, altura: 18 },
  },
  completa: {
    temaEscuro: { src: "/logos/logo-completa-clara.webp", largura: 130, altura: 44 },
    temaClaro: { src: "/logos/logo-completa-escura.webp", largura: 130, altura: 44 },
  },
};

interface PropriedadesLogo {
  marca: keyof typeof LOGOS;
  /** Vazio quando a marca é decorativa (o nome já está em um título ou rótulo ao lado). */
  alt?: string;
  /** Altura e visibilidade (ex.: `h-9`); a largura acompanha a proporção do arquivo. */
  className?: string;
}

/**
 * Logo da marca. Usa `<img>` de propósito, e não `next/image`: os arquivos já são
 * WebP pequenos, com cache de um ano (`next.config.ts`). O otimizador do Next só
 * acrescentaria uma passagem por `/_next/image` a cada partida a frio do
 * servidor, sem reduzir nada. `width` e `height` reservam o espaço e evitam
 * salto de layout.
 *
 * As duas versões vão no HTML e o CSS (`wtg-so-escuro` / `wtg-so-claro`, em
 * `globals.css`) mostra só a do tema atual, já na primeira pintura e sem
 * esperar o JavaScript. Com `loading="lazy"`, a versão escondida nem é baixada.
 */
export function Logo({ marca, alt = "", className }: PropriedadesLogo) {
  const { temaEscuro, temaClaro } = LOGOS[marca];
  const classes = juntarClasses("w-auto shrink-0 object-contain", className);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- motivo no comentário do componente */}
      <img
        src={temaEscuro.src}
        alt={alt}
        width={temaEscuro.largura}
        height={temaEscuro.altura}
        loading="lazy"
        className={juntarClasses(classes, "wtg-so-escuro")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- motivo no comentário do componente */}
      <img
        src={temaClaro.src}
        alt={alt}
        width={temaClaro.largura}
        height={temaClaro.altura}
        loading="lazy"
        className={juntarClasses(classes, "wtg-so-claro")}
      />
    </>
  );
}
