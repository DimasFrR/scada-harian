"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Navigasi utama — dipakai bersama oleh sidebar desktop & bottom nav HP.
// Hanya 5 halaman produksi yang nyata: Dashboard, Input Ukur, Data, Tren,
// Bulanan. Mingguan/Zona DMA hanya ada di prototipe, bukan di sini.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/input", label: "Input Ukur", icon: "✎" },
  { href: "/data", label: "Data", icon: "☰" },
  { href: "/tren", label: "Tren", icon: "↗" },
  { href: "/bulanan", label: "Bulanan", icon: "▤" },
];

// Header + bottom nav (HP) + sidebar kiri (desktop >=1024px).
// Disembunyikan di halaman login: dulu nav tetap tampil di /login, jadi
// ketuk menu saat belum login langsung dilempar balik ke /login —
// kelihatan seperti aplikasi mental/bug.
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

  const logoutLabel = confirmLogout ? "Yakin keluar?" : "Keluar";

  return (
    <>
      <header className={isLogin ? "topbar topbar-login" : "topbar"}>
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
              {logoutLabel}
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
      <div className="app-shell">
        {!isLogin && (
          <aside className="sidebar" aria-label="Navigasi utama">
            <div className="side-brand">
              <img src="/logo.png" alt="Logo Tirta Sukapura" width={44} height={44} style={{ borderRadius: "50%", flexShrink: 0 }} />
              <div>
                <div className="side-brand-name">SCADA Harian</div>
                <div className="side-brand-sub">Perumda Air Minum Tirta Sukapura</div>
              </div>
            </div>
            <nav className="side-nav">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`side-item${pathname === item.href ? " active" : ""}`}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  <span className="nav-ico" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <button
              type="button"
              className={confirmLogout ? "sidebar-logout confirm" : "sidebar-logout"}
              onClick={confirmLogout ? logout : () => setConfirmLogout(true)}
            >
              {logoutLabel}
            </button>
          </aside>
        )}
        <div className="app-main">
          <main className="container">{children}</main>
        </div>
      </div>
      {!isLogin && (
        <nav className="bottomnav" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname === item.href ? " active" : ""}`}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <span className="nav-ico" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
