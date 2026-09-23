import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IDXMACA — IDX Multi Agent Consulting Assistant",
  description: "Asisten analis pasar modal IDX: rencana agen, data terverifikasi, memo dengan sitasi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}