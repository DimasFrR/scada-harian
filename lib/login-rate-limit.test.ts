import { describe, expect, it, beforeEach } from "vitest";
import {
  __getTrackedIpCount,
  __resetLoginAttempts,
  clearLoginAttempts,
  getBlockRemainingSeconds,
  getClientIp,
  isLoginBlocked,
  LOGIN_BLOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  MAX_TRACKED_IPS,
  normalizeIp,
  recordLoginFailure,
  releaseLoginAttempt,
  tryAcquireLoginAttempt,
} from "./login-rate-limit";

const IP = "203.0.113.7";
const T0 = 1_000_000;

beforeEach(() => {
  __resetLoginAttempts();
});

describe("isLoginBlocked & jendela waktu", () => {
  it("tidak memblokir IP yang belum pernah gagal", () => {
    expect(isLoginBlocked(IP, T0)).toBe(false);
  });

  it("tidak memblokir di bawah batas percobaan", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    expect(isLoginBlocked(IP, T0 + 60_000)).toBe(false);
  });

  it("memblokir setelah mencapai batas dalam jendela", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    expect(isLoginBlocked(IP, T0 + 60_000)).toBe(true);
    expect(getBlockRemainingSeconds(IP, T0 + 60_000)).toBeGreaterThan(0);
  });

  it("melepas blok setelah masa blokir lewat dan membersihkan memori", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    expect(isLoginBlocked(IP, T0 + 60_000)).toBe(true);
    expect(
      isLoginBlocked(IP, T0 + 60_000 + LOGIN_BLOCK_MS + 1000),
    ).toBe(false);
    expect(__getTrackedIpCount()).toBe(0);
  });

  it("kegagalan lama di luar jendela tidak dihitung saat gagal baru terjadi", () => {
    // 9 kali gagal di T0, lalu tunggu lewat LOGIN_WINDOW_MS, lalu gagal 1 kali lagi.
    // Tidak boleh langsung terblokir karena 9 kegagalan lama sudah kedaluwarsa.
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    const afterWindow = T0 + LOGIN_WINDOW_MS + 60_000;
    recordLoginFailure(IP, afterWindow);
    expect(isLoginBlocked(IP, afterWindow + 1000)).toBe(false);
  });

  it("IP lain tidak ikut terblokir", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    expect(isLoginBlocked("198.51.100.9", T0 + 60_000)).toBe(false);
  });
});

describe("clearLoginAttempts", () => {
  it("login berhasil menghapus hitungan sehingga petugas tidak terblokir", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    clearLoginAttempts(IP);
    expect(isLoginBlocked(IP, T0 + 60_000)).toBe(false);
    expect(__getTrackedIpCount()).toBe(0);

    // Hitungan mulai dari nol lagi.
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      recordLoginFailure(IP, T0 + 60_000 + i * 1000);
    }
    expect(isLoginBlocked(IP, T0 + 120_000)).toBe(false);
  });
});

describe("tryAcquireLoginAttempt & proteksi race condition paralel", () => {
  it("menolak burst request paralel yang melebihi LOGIN_MAX_ATTEMPTS", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      const res = tryAcquireLoginAttempt(IP, T0);
      expect(res).toEqual({ allowed: true });
    }
    // Request ke-11 paralel ditolak sebelum request 1-10 selesai.
    const blocked = tryAcquireLoginAttempt(IP, T0);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }

    // Setelah semua dilepas tanpa kegagalan, slot kembali terbuka & memori bersih.
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      releaseLoginAttempt(IP, T0);
    }
    expect(__getTrackedIpCount()).toBe(0);
    expect(tryAcquireLoginAttempt(IP, T0)).toEqual({ allowed: true });
    releaseLoginAttempt(IP, T0);
  });

  it("login berhasil saat ada request lain in-flight tetap membersihkan kegagalan tanpa bocor", () => {
    expect(tryAcquireLoginAttempt(IP, T0)).toEqual({ allowed: true });
    expect(tryAcquireLoginAttempt(IP, T0)).toEqual({ allowed: true });
    recordLoginFailure(IP, T0);
    clearLoginAttempts(IP);
    releaseLoginAttempt(IP, T0);
    releaseLoginAttempt(IP, T0);
    expect(__getTrackedIpCount()).toBe(0);
    expect(isLoginBlocked(IP, T0)).toBe(false);
  });
});

describe("normalisasi IP & anti-bypass IPv6 / IPv4-mapped", () => {
  it("mengelompokkan rotasi alamat IPv6 dalam satu subnet /64 ke bucket yang sama", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(`2001:db8:85a3:1::${i + 1}`, T0 + i * 1000);
    }
    // Alamat IPv6 lain dalam subnet /64 yang sama ikut terblokir.
    expect(isLoginBlocked("2001:db8:85a3:1::ffff", T0 + 60_000)).toBe(true);
    // Subnet /64 berbeda tidak ikut terblokir.
    expect(isLoginBlocked("2001:db8:85a3:2::1", T0 + 60_000)).toBe(false);
  });

  it("menyamakan IPv4-mapped IPv6 dengan IPv4 aslinya", () => {
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(
        i % 2 === 0 ? "203.0.113.7" : "::ffff:203.0.113.7",
        T0 + i * 1000,
      );
    }
    expect(isLoginBlocked("203.0.113.7", T0 + 60_000)).toBe(true);
  });

  it("membatasi jumlah IP di memori agar tidak OOM", () => {
    for (let i = 0; i < MAX_TRACKED_IPS + 25; i++) {
      const a = (i >> 16) & 255;
      const b = (i >> 8) & 255;
      const c = i & 255;
      recordLoginFailure(`10.${a}.${b}.${c}`, T0);
    }
    expect(__getTrackedIpCount()).toBeLessThanOrEqual(MAX_TRACKED_IPS);
  });
});

function headersStub(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

describe("getClientIp", () => {
  it("memprioritaskan x-vercel-forwarded-for jika ada", () => {
    expect(
      getClientIp(
        headersStub({
          "x-vercel-forwarded-for": "198.51.100.42",
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "1.2.3.4, 203.0.113.7",
        }),
      ),
    ).toBe("198.51.100.42");
  });

  it("memakai x-real-ip kalau x-vercel-forwarded-for tidak ada", () => {
    expect(
      getClientIp(
        headersStub({
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "1.2.3.4, 203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("mengambil entri TERAKHIR x-forwarded-for (entri pertama bisa dipalsukan)", () => {
    expect(
      getClientIp(
        headersStub({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" }),
      ),
    ).toBe("198.51.100.9");
  });

  it("mengembalikan unknown kalau tidak ada header IP", () => {
    expect(getClientIp(headersStub({}))).toBe("unknown");
  });
});