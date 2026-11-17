import { juntarClasses } from "./classes";

/** Versões claras da marca (o app só tem tema escuro). Medidas reais dos arquivos em `public/logos`. */
const LOGOS = {
  pino: { src: "/logos/pin-claro.webp", largura: 29, altura: 36 },
  logotipo: { src: "/logos/logotipo-claro.webp", largura: 142, altura: 18 },
  completa: { src: "/logos/logo-completa-clara.webp", largura: 130, altura: 44 },
} as const;

interface PropriedadesLogo {
  marca: keyof typeof LOGOS;
  /** Vazio quando a marca é decorativa (o nome já está em um título ou rótulo ao lado). */
  alt?: string;
  /** Altura e visibilidade (ex.: `h-9`); a largura acompanha a proporção do arquivo. */
  className?: string;
}

/**
 * Logo da marca. Usa `<img>` de propósito, e não `next/image`: os arquivos já são
 * WebP pequenos, no tamanho de exibição e com cache de um ano (`next.config.ts`).
 * O otimizador do Next só acrescentaria uma passagem por `/_next/image` a cada
 * partida a frio do servidor, sem reduzir nada. `width` e `height` reservam o
 * espaço e evitam salto de layout.
 */
export function Logo({ marca, alt = "", className }: PropriedadesLogo) {
  const { src, largura, altura } = LOGOS[marca];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- motivo no comentário do componente
    <img src={src} alt={alt} width={largura} height={altura} className={juntarClasses("w-auto shrink-0 object-contain", className)} />
  );
}
