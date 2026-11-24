// Pembatas percobaan login (rate limit) untuk /api/login.
//
// Aturan: 10 kali salah dalam 5 menit dari satu IP -> diblokir 5 menit
// (respons 429 + header Retry-After). Login yang berhasil menghapus hitungan
// IP itu agar petugas kantor yang salah ketik tidak terkunci saat pemakaian normal.
//
// Perbaikan keamanan pada versi ini:
// 1. Pembersihan entri kedaluwarsa + batas MAX_TRACKED_IPS (mencegah memory exhaustion / OOM).
// 2. Normalisasi IPv4-mapped IPv6 (::ffff:a.b.c.d) dan subnet IPv6 /64 (mencegah bypass rotasi IPv6).
// 3. Prioritas header x-vercel-forwarded-for -> x-real-ip -> entri terakhir x-forwarded-for.
// 4. Penjaga konkurensi in-flight (`tryAcquireLoginAttempt` / `releaseLoginAttempt`)
//    untuk mencegah race condition saat burst request paralel tiba sebelum await selesai.
//
// CATATAN ARSITEKTUR: Penyimpanan ini masih di memori per instance serverless.
// Di Vercel multi-instance, proteksi penuh lintas instance membutuhkan penyimpanan
// bersama (misalnya tabel `login_attempts` di Neon Postgres yang sudah tersedia).

export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 menit
export const LOGIN_BLOCK_MS = 5 * 60 * 1000; // diblokir 5 menit
export const MAX_TRACKED_IPS = 10_000;

type AttemptRecord = {
  /** Waktu (ms) tiap percobaan gagal yang masih dalam jendela. */
  failures: number[];
  /** Sampai kapan (ms) IP ini diblokir; 0 = tidak diblokir. */
  blockedUntil: number;
  /** Jumlah request login yang sedang berjalan paralel untuk IP ini. */
  inFlight: number;
};

export type AcquireResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const attempts = new Map<string, AttemptRecord>();

/** Normalisasi IP klien:
 * - trim & lowercase
 * - hilangkan kurung siku IPv6 (`[2001:db8::1]`) & zone ID (`%eth0`)
 * - ubah IPv4-mapped IPv6 (`::ffff:203.0.113.7`) ke IPv4 (`203.0.113.7`)
 * - kelompokkan alamat IPv6 ke prefix `/64` agar rotasi alamat dalam 1 subnet
 *   IPv6 tidak bisa mem-bypass rate limit. */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (!ip) return "unknown";

  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }

  // IPv4-mapped IPv6, misal ::ffff:203.0.113.7
  const mappedPrefix = "::ffff:";
  if (ip.startsWith(mappedPrefix)) {
    const v4 = ip.slice(mappedPrefix.length);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
      return v4;
    }
  }

  // Jika bukan IPv6, kembalikan langsung (IPv4 atau "unknown")
  if (!ip.includes(":")) {
    return ip;
  }

  // Ekspansi IPv6 ke 8 hextet lalu ambil prefix /64 (4 hextet pertama)
  const doubleColonParts = ip.split("::");
  if (doubleColonParts.length > 2) {
    return ip; // format tidak valid, biarkan apa adanya
  }

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(":").filter(Boolean)
    : [];
  const right =
    doubleColonParts.length === 2 && doubleColonParts[1]
      ? doubleColonParts[1].split(":").filter(Boolean)
      : [];

  let groups: string[];
  if (doubleColonParts.length === 2) {
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return ip;
    groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  } else {
    if (left.length !== 8) return ip;
    groups = left;
  }

  const normalizedPrefix = groups
    .slice(0, 4)
    .map((g) => g.padStart(4, "0"))
    .join(":");
  return `${normalizedPrefix}::/64`;
}

function evictIfNeeded(now: number): void {
  if (attempts.size < MAX_TRACKED_IPS) return;
  // Bersihkan dulu semua entri yang sudah kedaluwarsa & tidak sedang in-flight.
  for (const [key, rec] of attempts) {
    prune(key, rec, now);
  }
  // Jika masih penuh, buang entri tertua (Map menjaga urutan penyisipan).
  while (attempts.size >= MAX_TRACKED_IPS) {
    const oldestKey = attempts.keys().next().value;
    if (oldestKey === undefined) break;
    attempts.delete(oldestKey);
  }
}

function getOrCreateRecord(ip: string, now: number): AttemptRecord {
  let rec = attempts.get(ip);
  if (!rec) {
    evictIfNeeded(now);
    rec = { failures: [], blockedUntil: 0, inFlight: 0 };
    attempts.set(ip, rec);
  }
  return rec;
}

/** Hapus percobaan lama di luar jendela, lepas blok yang sudah lewat,
 * dan buang entri kosong dari Map agar memori tidak bocor. */
function prune(ip: string, rec: AttemptRecord, now: number): void {
  rec.failures = rec.failures.filter((t) => now - t < LOGIN_WINDOW_MS);
  if (rec.blockedUntil > 0 && now >= rec.blockedUntil) {
    rec.blockedUntil = 0;
    rec.failures = [];
  }
  if (
    rec.failures.length === 0 &&
    rec.blockedUntil === 0 &&
    rec.inFlight === 0
  ) {
    attempts.delete(ip);
  }
}

/** Sisa waktu blokir (detik, dibulatkan ke atas); 0 jika tidak diblokir. */
export function getBlockRemainingSeconds(
  ip: string,
  now = Date.now(),
): number {
  const key = normalizeIp(ip);
  const rec = attempts.get(key);
  if (!rec) return 0;
  prune(key, rec, now);
  if (rec.blockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((rec.blockedUntil - now) / 1000));
}

/** true kalau IP ini sedang diblokir (terlalu banyak gagal). */
export function isLoginBlocked(ip: string, now = Date.now()): boolean {
  return getBlockRemainingSeconds(ip, now) > 0;
}

/** Reservasi slot percobaan login secara sinkron sebelum operasi async
 * (req.json / verifyPassword) agar burst request paralel tidak bisa
 * melewati batas LOGIN_MAX_ATTEMPTS. Wajib dipasangkan dengan
 * `releaseLoginAttempt(ip)` di blok `finally`. */
export function tryAcquireLoginAttempt(
  ip: string,
  now = Date.now(),
): AcquireResult {
  const key = normalizeIp(ip);
  const rec = getOrCreateRecord(key, now);
  prune(key, rec, now);

  if (rec.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((rec.blockedUntil - now) / 1000),
      ),
    };
  }

  if (rec.failures.length + rec.inFlight >= LOGIN_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(LOGIN_BLOCK_MS / 1000),
    };
  }

  // Pastikan record masih ada di Map (prune mungkin menghapusnya jika kosong)
  if (!attempts.has(key)) {
    attempts.set(key, rec);
  }
  rec.inFlight += 1;
  return { allowed: true };
}

/** Lepas slot percobaan login yang sedang berjalan (panggil di `finally`). */
export function releaseLoginAttempt(ip: string, now = Date.now()): void {
  const key = normalizeIp(ip);
  const rec = attempts.get(key);
  if (!rec) return;
  rec.inFlight = Math.max(0, rec.inFlight - 1);
  prune(key, rec, now);
}

/** Catat satu percobaan gagal. Kalau mencapai batas, IP diblokir. */
export function recordLoginFailure(ip: string, now = Date.now()): void {
  const key = normalizeIp(ip);
  const rec = getOrCreateRecord(key, now);
  prune(key, rec, now);

  if (!attempts.has(key)) {
    attempts.set(key, rec);
  }

  // Jika sudah diblokir, jangan terus menumpuk array failures.
  if (rec.blockedUntil > now) return;

  rec.failures.push(now);
  if (rec.failures.length >= LOGIN_MAX_ATTEMPTS) {
    rec.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

/** Hapus hitungan gagal IP ini — dipanggil saat login berhasil. */
export function clearLoginAttempts(ip: string): void {
  const key = normalizeIp(ip);
  const rec = attempts.get(key);
  if (!rec) return;
  if (rec.inFlight > 0) {
    rec.failures = [];
    rec.blockedUntil = 0;
  } else {
    attempts.delete(key);
  }
}

/** Ambil IP klien dari header (sudah dinormalisasi).
 * Urutan prioritas:
 * 1. `x-vercel-forwarded-for` (diset langsung oleh Vercel Edge, tidak bisa dipalsukan klien)
 * 2. `x-real-ip` (diset oleh Vercel / reverse proxy tepercaya)
 * 3. Entri TERAKHIR `x-forwarded-for` (proxy menambahkan IP asli di belakang) */
export function getClientIp(
  headers: { get(name: string): string | null },
): string {
  const vercelForwarded = headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const parts = vercelForwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return normalizeIp(last);
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return normalizeIp(realIp);

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return normalizeIp(last);
  }

  return "unknown";
}

/** Hanya untuk tes: jumlah IP yang saat ini tersimpan di memori. */
export function __getTrackedIpCount(): number {
  return attempts.size;
}

/** Hanya untuk tes: kosongkan semua hitungan. */
export function __resetLoginAttempts(): void {
  attempts.clear();
}