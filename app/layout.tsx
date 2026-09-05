import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@/components/ambient-artwork.css";

const sans = localFont({
  src: "../public/fonts/dm-sans-latin-variable.woff2",
  weight: "100 1000",
  variable: "--font-sans",
  display: "swap",
});

const display = localFont({
  src: "../public/fonts/montserrat-latin-500.woff2",
  weight: "500",
  variable: "--font-display",
  display: "swap",
});

const mono = localFont({
  src: "../public/fonts/fragment-mono-latin.woff2",
  weight: "400",
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Relay | CS2 server console",
  description: "Connect to your Counter-Strike 2 server. Run RCON commands, manage players, and change maps in one workspace.",
  applicationName: "Relay",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
