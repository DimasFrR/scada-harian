"use client";

import { useState } from "react";
import { formatNum } from "@/lib/alarms";

export interface PdfRow {
  date: string;
  time: string;
  point_name: string;
  debit_lps: number | null;
  pressure_bar: number | null;
  is_empty: boolean;
}

export interface PdfAlarm {
  point_name: string;
  level: "critical" | "warning";
  reasons: string[];
}

interface Props {
  rows: PdfRow[];
  alarms: PdfAlarm[];
  title: string;
  subtitle?: string;
}

// Penandatangan laporan (format surat resmi Perumda)
const SIGNER_PLACE = "Tasikmalaya";
const SIGNER_ROLE = "Kepala Sub Bagian Transmisi dan Distribusi";
const SIGNER_NAME = "JONI KUSWARA, S.Sos";
const SIGNER_NUP = "NUP. 0 3 0 4";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

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

/** Tombol Download PDF — laporan format surat resmi (kop + ttd atasan otomatis). */
export default function PdfButton({ rows, alarms, title, subtitle }: Props) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210;
      const M = 14; // margin kiri/kanan
      const CX = W / 2;

      // Tanggal surat mengikuti tanggal berjalan (WIB)
      const nowParts = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }).formatToParts(new Date());
      const get = (t: string) => nowParts.find((p) => p.type === t)?.value ?? "";
      const dateLine = `${SIGNER_PLACE}, ${MONTHS_ID[Number(get("month")) - 1]} ${get("year")}`;

      // --- Kop surat ---
      const [logoData, ttdData] = await Promise.all([
        toDataUrl("/logo.png"),
        toDataUrl("/ttd-atasan.png"),
      ]);
      if (logoData) {
        try {
          doc.addImage(logoData, "PNG", M, 10, 20, 20);
        } catch {
          /* kop tetap jalan tanpa logo */
        }
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("PERUMDA AIR MINUM TIRTA SUKAPURA", CX, 17, { align: "center" });
      doc.setFontSize(11);
      doc.text("KABUPATEN TASIKMALAYA", CX, 24, { align: "center" });
      // garis ganda kop
      doc.setLineWidth(0.8);
      doc.line(M, 32, W - M, 32);
      doc.setLineWidth(0.3);
      doc.line(M, 33.5, W - M, 33.5);

      // --- Judul laporan ---
      let y = 41;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, CX, y, { align: "center" });
      y += 6;
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(subtitle, CX, y, { align: "center" });
        y += 6;
      }
      y += 2;

      // --- Ringkasan alarm ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Ringkasan Alarm", M, y);
      y += 4;
      if (alarms.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Tidak ada alarm aktif — semua titik normal.", M, y + 4);
        y += 10;
      } else {
        autoTable(doc, {
          startY: y,
          head: [["Titik", "Level", "Keterangan"]],
          body: alarms.map((a) => [
            a.point_name,
            a.level === "critical" ? "KRITIS" : "PERINGATAN",
            a.reasons.join("; "),
          ]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [14, 116, 144] },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // --- Tabel data ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Data Pengukuran (${rows.length} baris)`, M, y);
      autoTable(doc, {
        startY: y + 4,
        head: [["Tanggal", "Jam", "Titik Ukur", "Debit (L/dtk)", "Tekanan (bar)", "Status"]],
        body: rows.map((r) => [
          r.date,
          r.time,
          r.point_name,
          formatNum(r.debit_lps),
          formatNum(r.pressure_bar),
          r.is_empty ? "KOSONG" : "Normal",
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [14, 116, 144] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 16 },
          2: { cellWidth: 61 },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 26 },
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // --- Blok tanda tangan (kanan, format surat) ---
      // Butuh ~70mm; pindah halaman baru kalau tidak muat
      const blockH = 70;
      if (y + blockH > 297 - M) {
        doc.addPage();
        y = 20;
      }
      const bx = M + (W - 2 * M) * 0.55; // tengah blok kanan
      const bw = (W - 2 * M) * 0.45;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(dateLine, bx, y, { align: "center" });
      y += 6;
      doc.text("Diketahui Oleh,", bx, y, { align: "center" });
      y += 6;
      const roleLines = doc.splitTextToSize(SIGNER_ROLE, bw);
      doc.text(roleLines, bx, y, { align: "center" });
      y += roleLines.length * 5 + 2;
      if (ttdData) {
        try {
          const tw = 42;
          const th = (tw * 576) / 800;
          doc.addImage(ttdData, "PNG", bx - tw / 2, y, tw, th);
          y += th + 2;
        } catch {
          y += 24;
        }
      } else {
        y += 24;
      }
      doc.setFont("helvetica", "bold");
      doc.text(SIGNER_NAME, bx, y, { align: "center" });
      const nw = doc.getTextWidth(SIGNER_NAME);
      doc.setLineWidth(0.4);
      doc.line(bx - nw / 2, y + 1, bx + nw / 2, y + 1);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(SIGNER_NUP, bx, y, { align: "center" });

      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`scada-harian-${stamp}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Gagal membuat PDF. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn" onClick={download} disabled={busy || rows.length === 0}>
      {busy ? "Membuat PDF..." : "⬇ Download PDF"}
    </button>
  );
}
