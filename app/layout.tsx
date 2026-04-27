import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Automador de Ads",
  description: "Pega copy, devolve Canva pronto.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
