"use client";

import { useState } from "react";
import { monthNameID } from "@/lib/alarms";
import { buildMonthlyRecapPdf, type MonthlyPdfInput } from "@/lib/monthlyPdf";

async function toDataUrl(path: string): Promise<string | null> {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

/** Logo diperkecil ke maks 512px dan diubah ke JPEG (latar putih) — PNG
 *  1024px mentah bikin PDF membengkak sampai ~4 MB (jsPDF menyimpan piksel
 *  mentah). Logo aslinya RGBA (transparan), jadi kanvas diisi putih dulu. */
async function toSmallLogoDataUrl(path: string): Promise<string | null> {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    const bitmap = await createImageBitmap(await r.blob());
    const size = 512;
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

interface Props {
  input: MonthlyPdfInput;
  disabled?: boolean;
}

/** Tombol "Unduh Rekap PDF" — rekap bulanan format surat resmi (kop +
 *  ringkasan + grafik + tabel bacaan + 2 blok tanda tangan). Nama file:
 *  Rekap-Bulanan-Oktober-2026.pdf. */
export default function MonthlyPdfButton({ input, disabled }: Props) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      // Logo JPEG kecil dulu; kalau gagal (mis. browser lama), pakai PNG mentah.
      const logo = (await toSmallLogoDataUrl("/logo.png")) ?? (await toDataUrl("/logo.png"));
      const blob = await buildMonthlyRecapPdf(input, logo);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rekap-Bulanan-${monthNameID(input.selectedMonth).replace(/ /g, "-")}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error(e);
      alert("Gagal membuat PDF. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn" onClick={download} disabled={busy || disabled}>
      {busy ? "Membuat PDF..." : "⬇ Unduh Rekap PDF"}
    </button>
  );
}
