import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhereToGo",
  applicationName: "WhereToGo",
  description: "Plataforma de gestão de crise: abrigos, vagas, doações e alertas em tempo real.",
  appleWebApp: { capable: true, title: "WhereToGo", statusBarStyle: "black-translucent" },
  icons: { apple: "/icone-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
