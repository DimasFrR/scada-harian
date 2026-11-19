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
  // alarms dipakai di layar (Dashboard), TIDAK dicetak di PDF — laporan print hanya tabel data
  alarms: PdfAlarm[];
  title: string;
  subtitle?: string;
}

// Penandatangan laporan — format surat biasa, ditandatangani manual setelah print
const SIGNER_PLACE = "Tasikmalaya";
const LEFT_HEAD = "Mengetahui/Menyetujui,";
const LEFT_ROLE = "Kepala Bagian Transmisi dan Distribusi";
const LEFT_NAME = "CECEP WENDI SETIADI, S.IP";
const LEFT_NUP = "NUP. 0 2 2 1";
const RIGHT_HEAD = "Dibuat Oleh,";
const RIGHT_ROLE = "Kepala Sub Bagian Transmisi dan Distribusi";
const RIGHT_NAME = "JONI KUSWARA, S.Sos";
const RIGHT_NUP = "NUP. 0 3 0 4";

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

/** Tombol Download PDF — laporan format surat resmi (kop + tabel data + 2 blok ttd manual). */
export default function PdfButton({ rows, title, subtitle }: Props) {
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
      const logoData = await toDataUrl("/logo.png");
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

      // --- Tabel data (tanpa Ringkasan Alarm) ---
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
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // --- Dua blok tanda tangan (kosong, ditandatangani manual setelah print) ---
      // Butuh ~60mm; pindah halaman baru kalau tidak muat
      const blockH = 60;
      if (y + blockH > 297 - M) {
        doc.addPage();
        y = 20;
      }
      const colW = 85;
      const leftCx = M + 45;
      const rightCx = W - M - 45;
      const leftHead = [LEFT_HEAD, ...doc.splitTextToSize(LEFT_ROLE, colW)];
      const rightHead = [dateLine, RIGHT_HEAD, ...doc.splitTextToSize(RIGHT_ROLE, colW)];
      const headH = Math.max(leftHead.length, rightHead.length) * 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      leftHead.forEach((ln, i) => doc.text(ln, leftCx, y + i * 5, { align: "center" }));
      rightHead.forEach((ln, i) => doc.text(ln, rightCx, y + i * 5, { align: "center" }));
      // ruang kosong ~25mm buat tanda tangan manual
      const nameY = y + headH + 2 + 25;
      doc.setFont("helvetica", "bold");
      doc.text(LEFT_NAME, leftCx, nameY, { align: "center" });
      doc.text(RIGHT_NAME, rightCx, nameY, { align: "center" });
      const lw = doc.getTextWidth(LEFT_NAME);
      const rw = doc.getTextWidth(RIGHT_NAME);
      doc.setLineWidth(0.4);
      doc.line(leftCx - lw / 2, nameY + 1, leftCx + lw / 2, nameY + 1);
      doc.line(rightCx - rw / 2, nameY + 1, rightCx + rw / 2, nameY + 1);
      doc.setFont("helvetica", "normal");
      doc.text(LEFT_NUP, leftCx, nameY + 6, { align: "center" });
      doc.text(RIGHT_NUP, rightCx, nameY + 6, { align: "center" });

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
