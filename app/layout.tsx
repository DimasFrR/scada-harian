import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCADA Harian — Tirta Sukapura",
  description:
    "Dashboard monitoring debit & tekanan harian Perumda Air Minum Tirta Sukapura",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e7490",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div>
              <div className="brand">SCADA Harian</div>
              <div className="brand-sub">Perumda Air Minum Tirta Sukapura</div>
            </div>
            <Link href="/api/logout" className="logout-btn">
              Keluar
            </Link>
          </div>
        </header>
        <main className="container">{children}</main>
        <nav className="bottomnav">
          <Link href="/" className="nav-item">
            <span className="nav-ico">▦</span>
            <span>Dashboard</span>
          </Link>
          <Link href="/input" className="nav-item">
            <span className="nav-ico">✎</span>
            <span>Input Ukur</span>
          </Link>
          <Link href="/data" className="nav-item">
            <span className="nav-ico">☰</span>
            <span>Data</span>
          </Link>
          <Link href="/tren" className="nav-item">
            <span className="nav-ico">↗</span>
            <span>Tren</span>
          </Link>
        </nav>
      </body>
    </html>
  );
}
