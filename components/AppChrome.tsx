"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Header + bottom nav. Disembunyikan di halaman login: dulu nav tetap
// tampil di /login, jadi ketuk menu saat belum login langsung dilempar
// balik ke /login — kelihatan seperti aplikasi mental/bug.
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo.png" alt="Logo Tirta Sukapura" width={44} height={44} style={{ borderRadius: "50%", flexShrink: 0 }} />
            <div>
              <div className="brand">SCADA Harian</div>
              <div className="brand-sub">Perumda Air Minum Tirta Sukapura</div>
            </div>
          </div>
          {!isLogin && (
            <Link href="/api/logout" className="logout-btn">
              Keluar
            </Link>
          )}
        </div>
      </header>
      <main className="container">{children}</main>
      {!isLogin && (
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
          <Link href="/bulanan" className="nav-item">
            <span className="nav-ico">▤</span>
            <span>Bulanan</span>
          </Link>
        </nav>
      )}
    </>
  );
}
