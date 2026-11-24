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
