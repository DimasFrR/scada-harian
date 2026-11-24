import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  expectedSessionToken,
  getAppPassword,
} from "@/lib/auth";
import {
  clearLoginAttempts,
  getClientIp,
  isLoginBlocked,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

export async function POST(req: NextRequest) {
  const secret = getAppPassword();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Password login belum diatur di server (APP_PASSWORD kosong)." },
      { status: 503 },
    );
  }
  // Batasi percobaan login: 10x salah dalam 5 menit dari satu IP -> 429.
  // Tanpa ini password bisa ditebak berulang-ulang tanpa pernah diblokir.
  const ip = getClientIp(req.headers);
  if (isLoginBlocked(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan login yang salah. Coba lagi dalam beberapa menit." },
      { status: 429 },
    );
  }
  let password = "";
  try {
    const body = await req.json();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 });
  }
  if (password !== secret) {
    recordLoginFailure(ip);
    return NextResponse.json({ ok: false, error: "Password salah." }, { status: 401 });
  }
  clearLoginAttempts(ip);
  const token = await expectedSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS, // 8 jam, lalu logout sendiri
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
