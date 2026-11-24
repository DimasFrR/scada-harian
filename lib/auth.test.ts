import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  isValidSession,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
} from "./auth";

const SECRET = "rahasia-scada-tirta-sukapura-2026";
const T0 = 1_700_000_000_000; // epoch ms

describe("verifyPassword", () => {
  it("menerima password yang cocok persis", async () => {
    expect(await verifyPassword(SECRET, SECRET)).toBe(true);
  });

  it("menolak password salah dengan panjang sama maupun berbeda", async () => {
    expect(await verifyPassword("salah", SECRET)).toBe(false);
    expect(await verifyPassword(SECRET.slice(0, -1) + "X", SECRET)).toBe(false);
    expect(await verifyPassword("", SECRET)).toBe(false);
  });

  it("menolak jika secret kosong", async () => {
    expect(await verifyPassword("", "")).toBe(false);
  });
});

describe("createSessionToken & isValidSession (kedaluwarsa 8 jam di server)", () => {
  it("menerima token yang masih dalam masa berlaku 8 jam", async () => {
    const token = await createSessionToken(SECRET, T0);
    // 1 detik sebelum kedaluwarsa masih valid.
    const justBeforeExpiry = T0 + (SESSION_MAX_AGE_SECONDS - 1) * 1000;
    expect(await isValidSession(token, SECRET, justBeforeExpiry)).toBe(true);
  });

  it("menolak token curian yang sudah melewati 8 jam meski password belum diganti", async () => {
    const token = await createSessionToken(SECRET, T0);
    const atExpiry = T0 + SESSION_MAX_AGE_SECONDS * 1000;
    const afterExpiry = T0 + (SESSION_MAX_AGE_SECONDS + 3600) * 1000;

    expect(await isValidSession(token, SECRET, atExpiry)).toBe(false);
    expect(await isValidSession(token, SECRET, afterExpiry)).toBe(false);
  });

  it("menolak token jika timestamp exp dimanipulasi agar lebih panjang", async () => {
    const token = await createSessionToken(SECRET, T0);
    const [version, expStr, sigHex] = token.split(".");
    const tampered = `${version}.${Number(expStr) + 86400}.${sigHex}`;
    expect(await isValidSession(tampered, SECRET, T0)).toBe(false);
  });

  it("menolak token jika APP_PASSWORD diganti", async () => {
    const token = await createSessionToken(SECRET, T0);
    expect(await isValidSession(token, "password-baru-2026", T0)).toBe(false);
  });

  it("menolak token v1 statis (64 hex tanpa exp) dan format rusak", async () => {
    const fakeV1 = "a".repeat(64);
    expect(await isValidSession(fakeV1, SECRET, T0)).toBe(false);
    expect(await isValidSession("v2.abc." + "a".repeat(64), SECRET, T0)).toBe(
      false,
    );
    expect(await isValidSession(undefined, SECRET, T0)).toBe(false);
    expect(await isValidSession(null, SECRET, T0)).toBe(false);
  });
});