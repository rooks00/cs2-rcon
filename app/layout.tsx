import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay — CS2 server control",
  description: "A local-first control surface for Counter-Strike 2 RCON servers.",
  applicationName: "Relay",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0d0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
