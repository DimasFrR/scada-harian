import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeAlarm,
  formatID,
  formatNum,
  monthNameID,
  nowWIB,
  parseIDNumber,
  type MeasurementLike,
} from "./alarms";

const okMeasurement: MeasurementLike = {
  debit_lps: 10,
  pressure_bar: 1.5,
  is_empty: false,
};

describe("computeAlarm", () => {
  it("mengembalikan ok untuk pengukuran normal", () => {
    expect(computeAlarm(okMeasurement, okMeasurement)).toEqual({
      level: "ok",
      reasons: [],
    });
  });

  it("mengembalikan critical jika kosong atau tekanan 0 bar", () => {
    expect(
      computeAlarm({ debit_lps: 0, pressure_bar: 0, is_empty: true }, null),
    ).toEqual({
      level: "critical",
      reasons: ["Tidak ada air (kosong)", "Tekanan 0 bar"],
    });
  });

  it("mengembalikan critical untuk tekanan negatif (vakum/sensor error)", () => {
    const result = computeAlarm(
      { debit_lps: 10, pressure_bar: -0.5, is_empty: false },
      okMeasurement,
    );
    expect(result.level).toBe("critical");
    expect(result.reasons).toEqual(["Tekanan tidak valid (-0,5 bar)"]);
  });

  it("mempertahankan early return saat critical (tidak menyertakan alasan warning)", () => {
    const result = computeAlarm(
      { debit_lps: 1, pressure_bar: 0.2, is_empty: true },
      okMeasurement,
    );
    expect(result).toEqual({
      level: "critical",
      reasons: ["Tidak ada air (kosong)"],
    });
  });

  it("mengabaikan nilai NaN dan ±Infinity tanpa crash atau alasan korup", () => {
    expect(
      computeAlarm(
        { debit_lps: Number.NaN, pressure_bar: Number.NaN, is_empty: false },
        okMeasurement,
      ),
    ).toEqual({ level: "ok", reasons: [] });

    expect(
      computeAlarm(
        {
          debit_lps: Number.POSITIVE_INFINITY,
          pressure_bar: Number.NEGATIVE_INFINITY,
          is_empty: false,
        },
        okMeasurement,
      ),
    ).toEqual({ level: "ok", reasons: [] });
  });

  it("tidak memicu warning saat penurunan debit tepat 30% (termasuk kasus floating-point)", () => {
    // (1 - 0.7) / 1 === 0.30000000000000004 di IEEE-754
    expect(
      computeAlarm(
        { debit_lps: 0.7, pressure_bar: 1.5, is_empty: false },
        { debit_lps: 1, pressure_bar: 1.5, is_empty: false },
      ),
    ).toEqual({ level: "ok", reasons: [] });

    // (0.3 - 0.21) / 0.3 === 0.30000000000000004 di IEEE-754
    expect(
      computeAlarm(
        { debit_lps: 0.21, pressure_bar: 1.5, is_empty: false },
        { debit_lps: 0.3, pressure_bar: 1.5, is_empty: false },
      ),
    ).toEqual({ level: "ok", reasons: [] });

    expect(
      computeAlarm(
        { debit_lps: 7, pressure_bar: 1.5, is_empty: false },
        { debit_lps: 10, pressure_bar: 1.5, is_empty: false },
      ),
    ).toEqual({ level: "ok", reasons: [] });
  });

  it("memicu warning saat penurunan debit > 30% dengan persentase akurat", () => {
    const result = computeAlarm(
      { debit_lps: 6.96, pressure_bar: 1.5, is_empty: false },
      { debit_lps: 10, pressure_bar: 1.5, is_empty: false },
    );
    expect(result.level).toBe("warning");
    expect(result.reasons).toEqual(["Debit turun 30,4% (sebelumnya 10 L/dtk)"]);
  });

  it("tidak menghitung penurunan debit > 100% jika debit negatif", () => {
    expect(
      computeAlarm(
        { debit_lps: -5, pressure_bar: 1.5, is_empty: false },
        okMeasurement,
      ),
    ).toEqual({ level: "ok", reasons: [] });
  });
});

describe("formatNum & formatID", () => {
  it("memformat angka normal ke format Indonesia", () => {
    expect(formatNum(0.45)).toBe("0,45");
    expect(formatNum(-0)).toBe("0");
    expect(formatID(683735)).toBe("683.735");
    expect(formatID(6.9573778e9)).toBe("6.957.377.800");
  });

  it("mengembalikan '—' untuk nilai non-finit, null, dan undefined", () => {
    const invalidValues = [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const val of invalidValues) {
      expect(formatNum(val)).toBe("—");
      expect(formatID(val)).toBe("—");
    }
  });
});

describe("parseIDNumber", () => {
  it("mem-parse format desimal koma, titik, spasi, dan pemisah ribuan Indonesia", () => {
    expect(parseIDNumber("6,55")).toBe(6.55);
    expect(parseIDNumber("6.55")).toBe(6.55);
    expect(parseIDNumber(" 6,55 ")).toBe(6.55);
    expect(parseIDNumber("1.250,50")).toBe(1250.5);
    expect(parseIDNumber("-1.250,50")).toBe(-1250.5);
    expect(parseIDNumber("1.000.000")).toBe(1000000);
    expect(parseIDNumber("-0")).toBe(0);
  });

  it("menolak literal hex, biner, oktal, notasi ilmiah, dan format tidak valid", () => {
    expect(parseIDNumber("0x10")).toBeNull();
    expect(parseIDNumber("0b101")).toBeNull();
    expect(parseIDNumber("0o10")).toBeNull();
    expect(parseIDNumber("1e5")).toBeNull();
    expect(parseIDNumber("1e308")).toBeNull();
    expect(parseIDNumber("1,234,56")).toBeNull();
    expect(parseIDNumber("12.34,56")).toBeNull();
    expect(parseIDNumber("")).toBeNull();
    expect(parseIDNumber("-")).toBeNull();
    expect(parseIDNumber(".")).toBeNull();
    expect(parseIDNumber(null)).toBeNull();
    expect(parseIDNumber(undefined)).toBeNull();
  });
});

describe("monthNameID", () => {
  it("mengonversi YYYY-MM valid menjadi nama bulan Indonesia", () => {
    expect(monthNameID("2026-01")).toBe("Januari 2026");
    expect(monthNameID("2026-10")).toBe("Oktober 2026");
    expect(monthNameID(" 2026-12 ")).toBe("Desember 2026");
  });

  it("tidak menghasilkan 'undefined' untuk bulan pecahan dan menolak input tidak valid", () => {
    expect(monthNameID("2026-1.5")).toBe("2026-1.5");
    expect(monthNameID("2026-00")).toBe("2026-00");
    expect(monthNameID("2026-13")).toBe("2026-13");
    expect(monthNameID("2026-10-15")).toBe("2026-10-15");
    expect(monthNameID("<script>alert(1)</script>-05")).toBe(
      "<script>alert(1)</script>-05",
    );
  });
});

describe("nowWIB", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("memformat tengah malam WIB sebagai 00:xx, bukan 24:xx", () => {
    // 2026-11-20 17:00 UTC === 2026-11-21 00:00 WIB
    expect(nowWIB(new Date("2026-11-20T17:00:00.000Z"))).toEqual({
      date: "2026-11-21",
      time: "00:00",
    });

    // 2026-11-20 17:45 UTC === 2026-11-21 00:45 WIB
    expect(nowWIB(new Date("2026-11-20T17:45:00.000Z"))).toEqual({
      date: "2026-11-21",
      time: "00:45",
    });
  });

  it("memformat waktu siang/malam dan mendukung pemanggilan tanpa argumen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T16:59:00.000Z")); // 23:59 WIB
    expect(nowWIB()).toEqual({
      date: "2026-11-21",
      time: "23:59",
    });
  });
});
