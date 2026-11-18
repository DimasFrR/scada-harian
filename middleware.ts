import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getAppPassword, isValidSession } from "@/lib/auth";

// Lindungi semua route kecuali /login, /api/login, dan aset statis.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/login" ||
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
