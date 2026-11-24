// Sesi login berbasis HMAC stateless (tanpa tabel sesi).
// Cookie = HMAC-SHA256(APP_PASSWORD, "scada-harian-session-v1") dalam hex.
// Berfungsi di Edge runtime (middleware) maupun Node runtime (API routes)
// karena memakai Web Crypto (globalThis.crypto.subtle).
// Password TIDAK PERNAH ditulis di kode — hanya dari env var APP_PASSWORD.

export const SESSION_COOKIE = "scada_session";
/** Sesi login berlaku 8 jam (satu hari kerja) lalu browser menghapus
 * cookie-nya sendiri — user otomatis logout. Sebelumnya 7 hari, terlalu
 * lama untuk aplikasi yang dipakai bergantian di lapangan/kantor. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_MESSAGE = "scada-harian-session-v1";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedSessionToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(SESSION_MESSAGE),
  );
  return toHex(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function isValidSession(
  cookieValue: string | undefined | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!cookieValue || !secret) return false;
  const expected = await expectedSessionToken(secret);
  return constantTimeEqual(cookieValue, expected);
}

export function getAppPassword(): string | undefined {
  const v = process.env.APP_PASSWORD;
  return v && v.trim() !== "" ? v : undefined;
}
