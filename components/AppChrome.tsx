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
        <svg viewBox="0 0 1440 160" preserveAspectRatio="xMidYMax slice">
          <path d="M0 108 Q 360 58 720 98 T 1440 88 V160 H0 Z" opacity="0.45" />
          <path d="M0 132 Q 400 92 800 126 T 1440 122 V160 H0 Z" />
          {/* Menara air */}
          <ellipse cx="245" cy="32" rx="78" ry="10" />
          <rect x="168" y="32" width="154" height="54" rx="10" />
          <path d="M182 86 V144 M222 86 V144 M262 86 V144 M302 86 V144 M186 104 L302 128 M302 104 L186 128" stroke="currentColor" strokeWidth="6" fill="none" />
          {/* Rumah pompa */}
          <path d="M796 110 L854 82 L912 110 Z" />
          <rect x="806" y="108" width="96" height="38" rx="2" />
          {/* Reservoir */}
          <rect x="1170" y="58" width="20" height="6" rx="2" />
          <rect x="1174" y="62" width="12" height="18" />
          <path d="M1058 92 Q 1180 52 1302 92 Z" />
          <rect x="1058" y="92" width="244" height="52" rx="8" />
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
