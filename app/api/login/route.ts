import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, expectedSessionToken, getAppPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const secret = getAppPassword();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Password login belum diatur di server (APP_PASSWORD kosong)." },
      { status: 503 },
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
    return NextResponse.json({ ok: false, error: "Password salah." }, { status: 401 });
  }
  const token = await expectedSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 hari
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
