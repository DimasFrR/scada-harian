import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetLoginAttempts,
  clearLoginAttempts,
  isLoginBlocked,
  LOGIN_BLOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  recordLoginFailure,
} from "./login-rate-limit";

const IP = "203.0.113.7";
const T0 = 1_000_000;

beforeEach(() => {
  __resetLoginAttempts();
});

describe("isLoginBlocked", () => {
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
  });

  it("melepas blok setelah masa blokir lewat", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    expect(isLoginBlocked(IP, T0 + 60_000)).toBe(true);
    expect(
      isLoginBlocked(IP, T0 + 60_000 + LOGIN_BLOCK_MS + 1000),
    ).toBe(false);
  });

  it("kegagalan lama di luar jendela tidak dihitung", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    // Semua kegagalan sudah lewat dari jendela 5 menit.
    expect(
      isLoginBlocked(IP, T0 + LOGIN_WINDOW_MS + 60_000),
    ).toBe(false);
  });

  it("IP lain tidak ikut terblokir", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    expect(isLoginBlocked("198.51.100.9", T0 + 60_000)).toBe(false);
  });
});

describe("clearLoginAttempts", () => {
  it("login berhasil menghapus hitungan sehingga tidak terblokir", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      recordLoginFailure(IP, T0 + i * 1000);
    }
    clearLoginAttempts(IP);
    expect(isLoginBlocked(IP, T0 + 60_000)).toBe(false);
    // Hitungan mulai dari nol lagi.
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      recordLoginFailure(IP, T0 + 60_000 + i * 1000);
    }
    expect(isLoginBlocked(IP, T0 + 120_000)).toBe(false);
  });
});
