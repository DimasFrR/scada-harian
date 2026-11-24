"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Header + bottom nav. Disembunyikan di halaman login: dulu nav tetap
// tampil di /login, jadi ketuk menu saat belum login langsung dilempar
// balik ke /login — kelihatan seperti aplikasi mental/bug.
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  // Konfirmasi keluar dua tahap: tombol "Keluar" kecil di pojok kanan atas
  // dulu langsung mengeluarkan sesi dalam satu sentuhan — merepotkan bila
  // tersentuh tidak sengaja di lapangan.
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function logout() {
    // POST, bukan <Link>: <Link> ke /api/logout dulu me-prefetch GET dan
    // menghapus sesi sendiri (lihat app/api/logout/route.ts).
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // Tetap arahkan ke login walau request gagal — sesi server sudah
      // tidak bisa dipakai lagi bila cookie ikut terhapus.
    }
    window.location.href = "/login";
  }

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
            <button
              type="button"
              className={confirmLogout ? "logout-btn confirm" : "logout-btn"}
              onClick={confirmLogout ? logout : () => setConfirmLogout(true)}
            >
              {confirmLogout ? "Yakin keluar?" : "Keluar"}
            </button>
          )}
        </div>
      </header>
      {/* Latar dekoratif: siluet reservoir + menara air di dasar halaman.
          Dekoratif saja (aria-hidden), sangat samar agar tidak mengganggu
          keterbacaan di bawah matahari. */}
      <div className="bg-decor" aria-hidden="true">
        <svg viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice">
          <path d="M0 240 Q 360 160 720 220 T 1440 200 V360 H0 Z" opacity="0.45" />
          <path d="M0 290 Q 400 220 800 280 T 1440 270 V360 H0 Z" />
          {/* Menara air */}
          <ellipse cx="560" cy="70" rx="85" ry="12" />
          <rect x="475" y="70" width="170" height="120" rx="12" />
          <path d="M490 190 V320 M530 190 V320 M570 190 V320 M610 190 V320 M494 215 L606 275 M606 215 L494 275" stroke="currentColor" strokeWidth="8" fill="none" />
          {/* Rumah pompa */}
          <path d="M675 242 L730 205 L785 242 Z" />
          <rect x="685" y="240" width="90" height="80" rx="2" />
          {/* Reservoir */}
          <rect x="952" y="130" width="22" height="8" rx="2" />
          <rect x="957" y="136" width="12" height="22" />
          <path d="M820 200 Q 960 150 1100 200 Z" />
          <rect x="820" y="200" width="280" height="120" rx="10" />
        </svg>
      </div>
      <main className="container">{children}</main>
      {!isLogin && (
        <nav className="bottomnav" aria-label="Navigasi utama">
          <Link href="/" className={`nav-item${pathname === "/" ? " active" : ""}`} aria-current={pathname === "/" ? "page" : undefined}>
            <span className="nav-ico" aria-hidden="true">▦</span>
            <span>Dashboard</span>
          </Link>
          <Link href="/input" className={`nav-item${pathname === "/input" ? " active" : ""}`} aria-current={pathname === "/input" ? "page" : undefined}>
            <span className="nav-ico" aria-hidden="true">✎</span>
            <span>Input Ukur</span>
          </Link>
          <Link href="/data" className={`nav-item${pathname === "/data" ? " active" : ""}`} aria-current={pathname === "/data" ? "page" : undefined}>
            <span className="nav-ico" aria-hidden="true">☰</span>
            <span>Data</span>
          </Link>
          <Link href="/tren" className={`nav-item${pathname === "/tren" ? " active" : ""}`} aria-current={pathname === "/tren" ? "page" : undefined}>
            <span className="nav-ico" aria-hidden="true">↗</span>
            <span>Tren</span>
          </Link>
          <Link href="/bulanan" className={`nav-item${pathname === "/bulanan" ? " active" : ""}`} aria-current={pathname === "/bulanan" ? "page" : undefined}>
            <span className="nav-ico" aria-hidden="true">▤</span>
            <span>Bulanan</span>
          </Link>
        </nav>
      )}
    </>
  );
}
