import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Logout HANYA via POST. Sebelumnya ini GET, dan tombol "Keluar" adalah
// <Link href="/api/logout"> — Next.js me-prefetch link itu begitu tampil
// di layar, sehingga sesi langsung terhapus sendiri beberapa detik setelah
// login. Itulah penyebab sebenarnya "tiap balik mesti login ulang":
// bukan cookie yang tidak tersimpan, melainkan logout yang terpanggil
// otomatis oleh prefetch. GET kini ditolak (405) supaya prefetch apa pun
// tidak bisa menghapus sesi lagi.
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { ok: false, error: "Gunakan tombol Keluar (POST) untuk logout." },
    { status: 405 },
  );
}
