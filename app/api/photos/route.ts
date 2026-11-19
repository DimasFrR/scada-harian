import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Upload foto bukti pengukuran (1 foto per pengukuran).
// Klien mengompres dulu (maks 1280px, JPEG q70) sebelum mengunggah.
// Kalau BLOB_READ_WRITE_TOKEN belum diatur, fitur foto nonaktif: endpoint
// menjawab 503 dengan pesan yang jelas — aplikasi TIDAK crash dan simpan
// pengukuran tetap jalan tanpa foto.

function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function GET() {
  return NextResponse.json({ ok: true, enabled: isBlobConfigured() });
}

export async function POST(req: NextRequest) {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Fitur foto belum diaktifkan (BLOB_READ_WRITE_TOKEN belum diatur)." },
      { status: 503 },
    );
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Tidak ada file foto." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "File harus berupa gambar." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Foto terlalu besar (maks 5 MB setelah kompresi)." }, { status: 400 });
    }
    const ext = file.type === "image/png" ? "png" : "jpg";
    const key = `pengukuran/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(key, file, { access: "public", contentType: file.type });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (e) {
    console.error("[foto] Gagal upload:", e);
    return NextResponse.json({ ok: false, error: "Gagal mengunggah foto." }, { status: 500 });
  }
}
