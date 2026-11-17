import type { Metadata, Viewport } from "next";
import { SincronizadorTema } from "@/components/ui/tema";
import { COR_BARRA, SCRIPT_TEMA, TEMA_PADRAO } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhereToGo",
  applicationName: "WhereToGo",
  description: "Plataforma de gestão de crise: abrigos, vagas, doações e alertas em tempo real.",
  // "default": barra de status opaca, com o conteúdo abaixo dela, que acompanha o
  // tema. "black-translucent" deixava o texto da barra sempre branco (some sobre o
  // cabeçalho do tema claro) e punha o cabeçalho por baixo do relógio.
  appleWebApp: { capable: true, title: "WhereToGo", statusBarStyle: "default" },
  icons: { apple: "/icone-maskable-512.png" },
};

// Padrão "Sistema": uma cor de barra para cada modo do aparelho. Com outra escolha
// salva, o `SincronizadorTema` acerta a meta; o `color-scheme` do CSS vale sobre o da meta.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: COR_BARRA.claro },
    { media: "(prefers-color-scheme: dark)", color: COR_BARRA.escuro },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `suppressHydrationWarning`: o script do <head> troca o `data-tema` antes de o React hidratar.
    <html lang="pt-BR" data-tema={TEMA_PADRAO} className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, sem piscar (DESIGN.md §8.2). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SincronizadorTema />
        {children}
      </body>
    </html>
  );
}
