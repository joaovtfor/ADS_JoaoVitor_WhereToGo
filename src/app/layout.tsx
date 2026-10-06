import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhereToGo",
  description: "Plataforma de gestão de crise: abrigos, vagas, doações e alertas em tempo real.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
