import type { Metadata, Viewport } from "next";
import AppChrome from "@/components/AppChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCADA Harian — Tirta Sukapura",
  description:
    "Dashboard monitoring debit & tekanan harian Perumda Air Minum Tirta Sukapura",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14365e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
