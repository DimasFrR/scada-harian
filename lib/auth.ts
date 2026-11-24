// Sesi login berbasis HMAC stateless dengan masa berlaku (exp) yang diverifikasi di server.
// Format cookie: "v2.<exp_epoch_seconds>.<hmac_sha256_hex>"
// Signature = HMAC-SHA256(APP_PASSWORD, "scada-harian-session:v2.<exp_epoch_seconds>")
//
// Berfungsi di Edge runtime (middleware) maupun Node runtime (API routes)
// karena memakai Web Crypto (globalThis.crypto.subtle).
// Password TIDAK PERNAH ditulis di kode — hanya dari env var APP_PASSWORD.

export const SESSION_COOKIE = "scada_session";
/** Sesi login berlaku 8 jam (satu hari kerja), diverifikasi di server lewat
 * claim `exp` yang ditandatangani HMAC sekaligus `maxAge` pada cookie. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const SESSION_VERSION = "v2";
const SESSION_DOMAIN = "scada-harian-session";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function constantTimeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signSessionPayload(
  secret: string,
  payload: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${SESSION_DOMAIN}:${payload}`),
  );
  return toHex(sig);
}

/** Bandingkan password input dengan secret secara constant-time tanpa
 * membocorkan panjang password (keduanya di-hash SHA-256 ke 32 byte tetap). */
export async function verifyPassword(
  input: string,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const enc = new TextEncoder();
  const [inputDigest, secretDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  return constantTimeEqualBytes(
    new Uint8Array(inputDigest),
    new Uint8Array(secretDigest),
  );
}

/** Buat token sesi stateless dengan timestamp kedaluwarsa 8 jam yang
 * ditandatangani HMAC-SHA256. */
export async function createSessionToken(
  secret: string,
  nowMs = Date.now(),
): Promise<string> {
  const expSeconds = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${SESSION_VERSION}.${expSeconds}`;
  const sigHex = await signSessionPayload(secret, payload);
  return `${payload}.${sigHex}`;
}

/** Alias kompatibilitas mundur — gunakan `createSessionToken` untuk kode baru. */
export const expectedSessionToken = createSessionToken;

/** Verifikasi format token, masa berlaku `exp` di sisi server, dan tanda tangan
 * HMAC secara constant-time. Token lama tanpa `exp` (v1) otomatis ditolak. */
export async function isValidSession(
  cookieValue: string | undefined | null,
  secret: string | undefined,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!cookieValue || !secret) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;

  const [version, expStr, sigHex] = parts;
  if (version !== SESSION_VERSION) return false;
  if (!/^\d{1,12}$/.test(expStr)) return false;
  if (!/^[0-9a-f]{64}$/.test(sigHex)) return false;

  const expSeconds = Number(expStr);
  if (!Number.isSafeInteger(expSeconds)) return false;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (nowSeconds >= expSeconds) return false;

  const expectedSig = await signSessionPayload(secret, `${version}.${expStr}`);
  return constantTimeEqualStrings(sigHex, expectedSig);
}

export function getAppPassword(): string | undefined {
  const v = process.env.APP_PASSWORD;
  return v && v.trim() !== "" ? v : undefined;
}