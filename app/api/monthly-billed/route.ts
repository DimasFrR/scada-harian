import { NextRequest, NextResponse } from "next/server";
import {
  DbNotConfigured,
  deleteMonthlyBilled,
  getMonthlyBilledList,
  upsertMonthlyBilled,
} from "@/lib/db";

function dbError(e: unknown) {
  if (e instanceof DbNotConfigured) {
    return NextResponse.json(
      { ok: false, error: "Database belum dikonfigurasi (DATABASE_URL kosong)." },
      { status: 503 },
    );
  }
  console.error(e);
  return NextResponse.json({ ok: false, error: "Kesalahan server." }, { status: 500 });
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Angka Indonesia: titik = pemisah ribuan, koma = desimal.
  const s = String(v).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const rows = await getMonthlyBilledList();
    return NextResponse.json({ ok: true, months: rows });
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const month = String(body.month ?? "");
    const sl = parseNum(body.sl);
    const m3 = parseNum(body.m3);
    const harga_air = parseNum(body.harga_air);
    const materai = parseNum(body.materai) ?? 0;
    const branches =
      body.branches === null || body.branches === undefined || body.branches === ""
        ? null
        : parseNum(body.branches);
    const note =
      body.note === null || body.note === undefined ? null : String(body.note).trim() || null;
    if (!/^\d{4}-\d{2}$/.test(month) || sl === null || m3 === null || harga_air === null) {
      return NextResponse.json(
        { ok: false, error: "Data tidak lengkap: isi bulan, SL, m³, dan Harga Air." },
        { status: 400 },
      );
    }
    if (sl < 0 || m3 < 0 || harga_air < 0 || materai < 0) {
      return NextResponse.json(
        { ok: false, error: "Angka tidak boleh negatif." },
        { status: 400 },
      );
    }
    await upsertMonthlyBilled({
      month,
      sl: Math.round(sl),
      m3,
      harga_air: Math.round(harga_air),
      materai: Math.round(materai),
      branches: branches === null ? null : Math.round(branches),
      note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: "Bulan tidak valid." }, { status: 400 });
    }
    await deleteMonthlyBilled(month);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}
