// Pembatas percobaan login (rate limit) untuk /api/login.
// Tanpa ini, password bisa ditebak berulang-ulang tanpa pernah diblokir
// (lubang #2 di video "5 celah login wajib tertutup").
//
// Aturan: 10 kali salah dalam 5 menit dari satu IP -> diblokir 5 menit
// (respons 429). Login yang berhasil menghapus hitungan IP itu, jadi
// petugas yang salah ketik beberapa kali tidak akan terkunci.
//
// CATATAN: penyimpanan di memori per instance server. Di Vercel, tiap
// instance hangat punya hitungannya sendiri — brute-force yang tersebar
// ke banyak instance hanya diperlambat, bukan dihentikan total. Itu
// cukup untuk aplikasi ini; versi yang lebih kuat butuh tabel percobaan
// di database (belum ada — sesi saat ini stateless HMAC, tanpa tabel sesi).

export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 menit
export const LOGIN_BLOCK_MS = 5 * 60 * 1000; // diblokir 5 menit

type AttemptRecord = {
  /** Waktu (ms) tiap percobaan gagal yang masih dalam jendela. */
  failures: number[];
  /** Sampai kapan (ms) IP ini diblokir; 0 = tidak diblokir. */
  blockedUntil: number;
};

const attempts = new Map<string, AttemptRecord>();

function record(ip: string): AttemptRecord {
  let rec = attempts.get(ip);
  if (!rec) {
    rec = { failures: [], blockedUntil: 0 };
    attempts.set(ip, rec);
  }
  return rec;
}

/** Hapus percobaan lama di luar jendela + lepas blok yang sudah lewat. */
function prune(rec: AttemptRecord, now: number): void {
  rec.failures = rec.failures.filter((t) => now - t < LOGIN_WINDOW_MS);
  if (rec.blockedUntil > 0 && now >= rec.blockedUntil) {
    rec.blockedUntil = 0;
    rec.failures = [];
  }
}

/** true kalau IP ini sedang diblokir (terlalu banyak gagal). */
export function isLoginBlocked(ip: string, now = Date.now()): boolean {
  const rec = attempts.get(ip);
  if (!rec) return false;
  prune(rec, now);
  return rec.blockedUntil > now;
}

/** Catat satu percobaan gagal. Kalau mencapai batas, IP diblokir. */
export function recordLoginFailure(ip: string, now = Date.now()): void {
  const rec = record(ip);
  prune(rec, now);
  rec.failures.push(now);
  if (rec.failures.length >= LOGIN_MAX_ATTEMPTS) {
    rec.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

/** Hapus hitungan IP ini — dipanggil saat login berhasil. */
export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip);
}

/** Ambil IP klien dari header (Vercel menaruhnya di x-forwarded-for). */
export function getClientIp(
  headers: { get(name: string): string | null },
): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Hanya untuk tes: kosongkan semua hitungan. */
export function __resetLoginAttempts(): void {
  attempts.clear();
}
