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

/** Tombol Download PDF — generate PDF laporan di browser (jsPDF + autotable). */
export default function PdfButton({ rows, alarms, title, subtitle }: Props) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

      doc.setFontSize(16);
      doc.text("SCADA Harian — Perumda Air Minum Tirta Sukapura", 14, 14);
      doc.setFontSize(11);
      doc.text(title, 14, 21);
      if (subtitle) doc.text(subtitle, 14, 27);
      doc.setFontSize(9);
      doc.text(`Dicetak: ${now} WIB`, 14, subtitle ? 33 : 27);

      let y = subtitle ? 38 : 32;

      // Ringkasan alarm
      doc.setFontSize(11);
      doc.text("Ringkasan Alarm", 14, y);
      y += 4;
      if (alarms.length === 0) {
        doc.setFontSize(10);
        doc.text("Tidak ada alarm aktif — semua titik normal.", 14, y + 4);
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

      // Tabel data
      doc.setFontSize(11);
      doc.text(`Data Pengukuran (${rows.length} baris)`, 14, y);
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
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      });

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
