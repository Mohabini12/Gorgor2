import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GORGOR — Tactical Mapping & Field Comms",
  description:
    "Professional Android-optimized military mapping application with MapLibre, live GPS, MGRS/DMS coordinate search, offline MBTiles manager, and squad communications in Somali and English.",
  manifest: "/manifest.json",
  applicationName: "GORGOR",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GORGOR",
  },
  icons: {
    icon: "/api/branding/icon.svg",
    apple: "/api/branding/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#071120",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="bg-[#071120] text-white antialiased selection:bg-[#2D8CFF]/35 selection:text-white">
        {children}
      </body>
    </html>
  );
}
