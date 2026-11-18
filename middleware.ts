import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getAppPassword, isValidSession } from "@/lib/auth";

// Lindungi semua route kecuali /login, /api/login, dan aset statis.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Sudah login tapi mampir ke /login (misalnya lewat tombol back HP —
  // halaman login ada di riwayat browser): langsung lempar ke aplikasi,
  // jangan tampilkan form login lagi. Ini yang bikin user merasa "tiap
  // balik mesti login ulang", padahal sesinya masih hidup.
  if (pathname === "/login") {
    const secret = getAppPassword();
    if (secret) {
      const ok = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, secret);
      if (ok) {
        const next = req.nextUrl.searchParams.get("next");
        const dest =
          next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        return NextResponse.redirect(new URL(dest, req.url));
      }
    }
    const res = NextResponse.next();
    // Halaman login jangan di-cache: WebView di APK sempat menyajikan
    // bundle lama berhari-hari setelah deploy (itu sebabnya tab Input
    // masih menampilkan "Memuat..." versi lama padahal server sudah baru).
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  }

  if (
    pathname === "/api/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.svg" ||
    pathname === "/logo.png" ||
    pathname === "/icon-512.png"
  ) {
    return NextResponse.next();
  }

  const secret = getAppPassword();
  // Password belum diatur di env -> arahkan ke halaman login (di sana ada pesan setup).
  if (!secret) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ok = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (!ok) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Halaman aplikasi jangan di-cache WebView (lihat alasan di atas) —
  // update berikutnya langsung terasa tanpa harus hapus cache manual.
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
