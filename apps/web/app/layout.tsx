import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paham Emiten",
  description: "Kondisi perusahaan di Bursa Efek Indonesia dalam bahasa sederhana: 30 cek fundamental, pemilik, dan peta uang — semua angka dari data Sectors.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}