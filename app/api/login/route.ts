import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getAppPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  clearLoginAttempts,
  getClientIp,
  recordLoginFailure,
  releaseLoginAttempt,
  tryAcquireLoginAttempt,
} from "@/lib/login-rate-limit";

const MAX_PASSWORD_LENGTH = 1024;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  const secret = getAppPassword();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Password login belum diatur di server (APP_PASSWORD kosong).",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  // Tolak permintaan non-JSON untuk mencegah Login CSRF lewat HTML <form> sederhana.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { ok: false, error: "Content-Type harus application/json." },
      { status: 415, headers: NO_STORE_HEADERS },
    );
  }

  // Batasi percobaan login (termasuk proteksi race condition burst paralel):
  // 10x salah dalam 5 menit dari satu IP -> 429 + Retry-After.
  const ip = getClientIp(req.headers);
  const slot = tryAcquireLoginAttempt(ip);
  if (!slot.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Terlalu banyak percobaan login yang salah. Coba lagi dalam beberapa menit.",
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(slot.retryAfterSeconds),
        },
      },
    );
  }

  try {
    let password = "";
    try {
      const body: unknown = await req.json();
      if (
        body === null ||
        typeof body !== "object" ||
        typeof (body as Record<string, unknown>).password !== "string"
      ) {
        return NextResponse.json(
          { ok: false, error: "Permintaan tidak valid." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      password = (body as { password: string }).password;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Permintaan tidak valid." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // Batasi panjang input untuk mencegah CPU DoS saat hashing payload raksasa.
    const valid =
      password.length <= MAX_PASSWORD_LENGTH &&
      (await verifyPassword(password, secret));

    if (!valid) {
      recordLoginFailure(ip);
      return NextResponse.json(
        { ok: false, error: "Password salah." },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    clearLoginAttempts(ip);
    const token = await createSessionToken(secret);
    const res = NextResponse.json(
      { ok: true },
      { headers: NO_STORE_HEADERS },
    );
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS, // 8 jam, cocok dengan exp di token HMAC
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } finally {
    releaseLoginAttempt(ip);
  }
}