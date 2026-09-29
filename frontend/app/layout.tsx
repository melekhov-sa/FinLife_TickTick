import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

// Шрифты подключены локально: файлы в public/fonts, @font-face в app/fonts.css,
// семейства — через CSS-переменные в globals.css. next/font/google убран
// намеренно: его загрузчик плавающе падает в сборке Turbopack
// («next/font/google queries have exactly one entry») и требует сети при сборке.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#7C3AED",
};

export const metadata: Metadata = {
  title: "FinLife",
  description: "Personal finance & productivity",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Эксперимент: убран легаси apple-mobile-web-app-capable — iOS 26 должна
  // ставить PWA по манифесту (display: standalone). Легаси-режим — главный
  // подозреваемый в укороченном вьюпорте (812 vs 874).
  appleWebApp: {
    title: "FinLife",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
