// PDF Rekap Bulanan — port dari prototype (rekapPdf.ts) ke pola jsPDF yang
// sudah dipakai PDF laporan harian. Urutan isi sama seperti prototype:
// kop surat, Ringkasan, Kehilangan Air, Neraca Air, Grafik Tren Bulanan,
// Rekap Bacaan Lapangan, blok tanda tangan, footer.
// Bulan tanpa rekap billing tetap bisa diunduh — hanya berisi catatan
// "belum masuk" + tabel bacaan lapangan, tanpa angka yang dikarang.
import { formatID, monthNameID } from "./alarms";
import type { MonthlyBilledRow, MonthlyReadingRecap } from "./db";
import {
  deriveBilled,
  fmt2,
  fmtLossValueRp,
  fmtPct2,
  shortMonthID,
  type DerivedBilled,
} from "./monthly";
import { SIGNER_LEFT, SIGNER_RIGHT, wibDateID, wibDateLine } from "./signers";

export interface MonthlyPdfInput {
  selectedMonth: string; // YYYY-MM
  billed: MonthlyBilledRow | null; // null = rekap billing bulan itu belum masuk
  billedMonths: MonthlyBilledRow[]; // semua bulan yang ada billing-nya (naik)
  recap: MonthlyReadingRecap[]; // semua bulan yang ada bacaan lapangan (turun)
}

const W = 210; // lebar A4 (mm)
const M = 14; // margin kiri/kanan
const CX = W / 2;

type Doc = import("jspdf").jsPDF;

function sectionTitle(doc: Doc, y: number, text: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(14, 116, 144);
  doc.text(text, M, y);
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

function noteLine(doc: Doc, y: number, text: string): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const lines = doc.splitTextToSize(text, W - M * 2);
  lines.forEach((ln: string, i: number) => doc.text(ln, M, y + i * 4.5));
  doc.setTextColor(0, 0, 0);
  return y + lines.length * 4.5 + 3;
}

/** Bar bertumpuk Neraca Air: hijau Tertagih / merah Hilang (bagian dari distribusi). */
function drawBalanceBar(doc: Doc, y: number, billed: MonthlyBilledRow, d: DerivedBilled): number {
  const barW = W - M * 2;
  const barH = 8;
  const dist = billed.distribution_m3!;
  const billedShare = billed.m3 / dist;
  const greenW = Math.max(0, Math.min(1, billedShare)) * barW;
  doc.setFillColor(21, 128, 61);
  doc.rect(M, y, greenW, barH, "F");
  doc.setFillColor(220, 38, 38);
  doc.rect(M + greenW, y, barW - greenW, barH, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(21, 128, 61);
  doc.text(`Tertagih ${fmt2(billed.m3)} m³ (${fmtPct2(billedShare * 100)})`, M, y + barH + 5);
  doc.setTextColor(220, 38, 38);
  doc.text(
    `Hilang ${fmt2(d.lossM3!)} m³ (${fmtPct2(d.lossPct!)})`,
    W - M,
    y + barH + 5,
    { align: "right" },
  );
  doc.setTextColor(0, 0, 0);
  return y + barH + 10;
}

/** Grafik batang: Tertagih vs Hilang per bulan (m³, sumbu dalam 'rb'). */
function drawVolumeChart(doc: Doc, y: number, rows: { month: string; billed: number; loss: number }[]): number {
  const chartH = 52;
  const plotX0 = M + 22; // ruang untuk label sumbu ("779,00 rb")
  const plotX1 = W - M;
  const plotW = plotX1 - plotX0;
  const maxV = Math.max(...rows.flatMap((r) => [r.billed, r.loss]), 1);
  const top = y;
  const base = top + chartH;
  // grid + label sumbu (0 / setengah / maks, dalam 'rb')
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  [0, 0.5, 1].forEach((f) => {
    const yy = base - chartH * f;
    doc.setDrawColor(226, 232, 240);
    doc.line(plotX0, yy, plotX1, yy);
    doc.text(`${fmt2((maxV * f) / 1000)} rb`, plotX0 - 2, yy - 1.5, { align: "right" });
  });
  doc.setTextColor(0, 0, 0);
  const groupW = plotW / rows.length;
  const barW = 16;
  rows.forEach((r, i) => {
    const gx = plotX0 + groupW * i;
    const cx = gx + groupW / 2;
    const bH = (r.billed / maxV) * (chartH - 8);
    const lH = (r.loss / maxV) * (chartH - 8);
    doc.setFillColor(14, 116, 144);
    doc.rect(cx - barW - 2, base - bH, barW, bH, "F");
    doc.setFillColor(220, 38, 38);
    doc.rect(cx + 2, base - lH, barW, lH, "F");
    doc.setFontSize(8);
    doc.setTextColor(14, 116, 144);
    doc.text(`${Math.round(r.billed / 1000)} rb`, cx - barW / 2 - 2, base - bH - 2, { align: "center" });
    doc.setTextColor(220, 38, 38);
    doc.text(`${Math.round(r.loss / 1000)} rb`, cx + barW / 2 + 2, base - lH - 2, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(shortMonthID(r.month), cx, base + 5, { align: "center" });
  });
  // sumbu bawah + legenda
  doc.setDrawColor(203, 213, 225);
  doc.line(plotX0, base, plotX1, base);
  doc.setFontSize(9);
  doc.setFillColor(14, 116, 144);
  doc.rect(M, base + 10, 4, 4, "F");
  doc.text("Tertagih", M + 6, base + 13.5);
  doc.setFillColor(220, 38, 38);
  doc.rect(M + 32, base + 10, 4, 4, "F");
  doc.text("Hilang", M + 38, base + 13.5);
  return base + 18;
}

/** Grafik garis: Kehilangan % (merah) vs NRW % (oranye) per bulan. */
function drawNrwChart(doc: Doc, y: number, rows: { month: string; lossPct: number; nrwPct: number }[]): number {
  const chartH = 52;
  const plotX0 = M + 16; // ruang untuk label sumbu ("41,00%")
  const plotX1 = W - M;
  const maxV = Math.max(...rows.flatMap((r) => [r.lossPct, r.nrwPct]), 1);
  const top = y;
  const base = top + chartH;
  const yMax = Math.max(5, Math.ceil(maxV / 5) * 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  [0, 0.5, 1].forEach((f) => {
    const yy = base - chartH * f;
    doc.setDrawColor(226, 232, 240);
    doc.line(plotX0, yy, plotX1, yy);
    doc.text(`${fmt2(yMax * f)}%`, plotX0 - 2, yy - 1.5, { align: "right" });
  });
  doc.setTextColor(0, 0, 0);
  const x = (i: number) =>
    plotX0 + 8 + ((plotX1 - plotX0 - 16) * i) / Math.max(1, rows.length - 1);
  const yy = (v: number) => base - (chartH * v) / yMax;
  // Label Kehilangan di atas titik, label NRW di bawah titik — kedua garis
  // nyaris berhimpit (34,02% vs 34,14%), jadi labelnya tidak boleh menumpuk.
  const line = (
    key: "lossPct" | "nrwPct",
    color: [number, number, number],
    labelAbove: boolean,
  ) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.7);
    rows.forEach((r, i) => {
      if (i > 0) doc.line(x(i - 1), yy(rows[i - 1][key]), x(i), yy(r[key]));
    });
    doc.setFillColor(...color);
    rows.forEach((r, i) => doc.circle(x(i), yy(r[key]), 1.4, "F"));
    doc.setFontSize(8);
    doc.setTextColor(...color);
    rows.forEach((r, i) =>
      doc.text(fmtPct2(r[key]), x(i), yy(r[key]) + (labelAbove ? -3 : 6), { align: "center" }),
    );
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.2);
  };
  line("lossPct", [220, 38, 38], true);
  line("nrwPct", [180, 83, 9], false);
  doc.setDrawColor(203, 213, 225);
  doc.line(plotX0, base, plotX1, base);
  doc.setFontSize(9);
  rows.forEach((r, i) => doc.text(shortMonthID(r.month), x(i), base + 5, { align: "center" }));
  // legenda
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.7);
  doc.line(M, base + 12, M + 10, base + 12);
  doc.text("Kehilangan (dari distribusi)", M + 12, base + 13.5);
  doc.setDrawColor(180, 83, 9);
  doc.line(M + 78, base + 12, M + 88, base + 12);
  doc.text("NRW (dari produksi)", M + 90, base + 13.5);
  doc.setLineWidth(0.2);
  return base + 18;
}

/** Bangun PDF rekap bulanan; mengembalikan Blob PDF siap diunduh. */
export async function buildMonthlyRecapPdf(
  input: MonthlyPdfInput,
  logoDataUrl: string | null,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const label = monthNameID(input.selectedMonth);
  const { billed } = input;
  const d = billed ? deriveBilled(billed) : null;

  // --- Kop surat ---
  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logoDataUrl, fmt, M, 10, 20, 20);
    } catch {
      /* kop tetap jalan tanpa logo */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("PERUMDA AIR MINUM TIRTA SUKAPURA", CX, 17, { align: "center" });
  doc.setFontSize(11);
  doc.text("KABUPATEN TASIKMALAYA", CX, 24, { align: "center" });
  doc.setLineWidth(0.8);
  doc.line(M, 32, W - M, 32);
  doc.setLineWidth(0.3);
  doc.line(M, 33.5, W - M, 33.5);

  // --- Judul ---
  let y = 41;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("REKAP BULANAN", CX, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Panel Monitoring SCADA — Rekap Bulanan", CX, y, { align: "center" });
  y += 6;
  doc.text(`Periode: ${label}`, CX, y, { align: "center" });
  y += 10;

  const lastY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  if (billed && d) {
    // --- Ringkasan ---
    y = sectionTitle(doc, y, "Ringkasan");
    autoTable(doc, {
      startY: y,
      body: [
        ["Pelanggan tertagih", `${formatID(billed.sl)} SL`],
        ["Volume tertagih", `${fmt2(billed.m3)} m³`],
        ["Total tagihan", `Rp ${formatID(billed.total_rp)}`],
        ["Produksi IPA", billed.production_m3 !== null ? `${fmt2(billed.production_m3)} m³` : "—"],
        ["Distribusi", billed.distribution_m3 !== null ? `${fmt2(billed.distribution_m3)} m³` : "—"],
        [
          "Kehilangan transmisi",
          d.transmissionLoss !== null ? `${fmt2(d.transmissionLoss)} m³` : "—",
        ],
      ],
      styles: { fontSize: 10 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { halign: "right" } },
      theme: "plain",
    });
    y = lastY() + 8;

    // --- Kehilangan Air ---
    if (d.lossM3 !== null) {
      y = sectionTitle(doc, y, "Kehilangan Air");
      autoTable(doc, {
        startY: y,
        body: [
          ["Kehilangan air", `${fmt2(d.lossM3)} m³`],
          ["Kehilangan", d.lossPct !== null ? `${fmtPct2(d.lossPct)} dari distribusi` : "—"],
          ["NRW", d.nrwPct !== null ? `${fmtPct2(d.nrwPct)} dari produksi` : "—"],
          [
            "Nilai kehilangan",
            d.lossValueRp !== null ? fmtLossValueRp(d.lossValueRp) : "—",
          ],
        ],
        styles: { fontSize: 10 },
        columnStyles: { 0: { cellWidth: 70 }, 1: { halign: "right" } },
        theme: "plain",
      });
      y = lastY() + 4;
      y = noteLine(
        doc,
        y,
        "Nilai kehilangan adalah estimasi dari tarif rata-rata tertagih, bukan angka tagihan.",
      );
    } else {
      y = noteLine(
        doc,
        y,
        "Produksi / distribusi bulan ini belum masuk, jadi kehilangan air belum bisa dihitung.",
      );
    }

    // --- Neraca Air ---
    if (billed.distribution_m3 !== null && d.lossM3 !== null) {
      y = sectionTitle(doc, y, "Neraca Air");
      y = drawBalanceBar(doc, y, billed, d);
    }

    // --- Grafik Tren Bulanan ---
    const chartRows = input.billedMonths
      .map((b) => ({ b, d: deriveBilled(b) }))
      .filter((r) => r.d.lossM3 !== null && r.d.lossPct !== null && r.d.nrwPct !== null)
      .map((r) => ({
        month: r.b.month,
        billed: r.b.m3,
        loss: r.d.lossM3!,
        lossPct: r.d.lossPct!,
        nrwPct: r.d.nrwPct!,
      }));
    y = sectionTitle(doc, y, "Grafik Tren Bulanan");
    if (chartRows.length >= 2) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Volume tertagih vs kehilangan air (m³ per bulan)", M, y);
      y = drawVolumeChart(doc, y + 4, chartRows) + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Kehilangan air & NRW (% per bulan)", M, y);
      y = drawNrwChart(doc, y + 4, chartRows) + 4;
    } else {
      y = noteLine(
        doc,
        y,
        "Baru satu bulan yang rekap billing-nya lengkap, jadi grafik masih satu titik — trennya terbentuk otomatis begitu rekap bulan berikutnya masuk.",
      );
    }
  } else {
    // --- Bulan tanpa rekap billing: jujur, tanpa angka karangan ---
    y = sectionTitle(doc, y, `Rekap Billing ${label} Belum Masuk`);
    y = noteLine(
      doc,
      y,
      `Rekap billing bulan ${label} belum masuk. Dokumen ini hanya menampilkan rekap bacaan lapangan — angka tertagih, produksi, dan kehilangan air akan muncul setelah rekap Lap DRD bulan tersebut selesai.`,
    );
  }

  // --- Rekap Bacaan Lapangan (semua bulan, bulan terpilih ditebalkan) ---
  y = sectionTitle(doc, y, "Rekap Bacaan Lapangan");
  if (input.recap.length === 0) {
    y = noteLine(doc, y, "Belum ada data bacaan lapangan.");
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Bulan", "Ronde laporan", "Baris bacaan", "Titik terukur", "Bacaan kosong"]],
      body: input.recap.map((r) => [
        monthNameID(r.month),
        String(r.rounds),
        String(r.rows),
        String(r.points_measured),
        String(r.empty_rows),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [14, 116, 144] },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          const row = input.recap[data.row.index];
          if (row.month === input.selectedMonth) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [236, 254, 255];
          }
          if (data.column.index === 4 && row.empty_rows > 0) {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });
    y = lastY() + 4;
    y = noteLine(
      doc,
      y,
      "Dihitung dari seluruh pengukuran tersimpan (ronde keliling Senin & Jumat). \"Bacaan kosong\" = titik yang pada ronde itu dilaporkan tanpa air / tanpa tekanan.",
    );
  }

  // --- Dua blok tanda tangan (kosong, ditandatangani manual setelah print) ---
  const blockH = 60;
  if (y + blockH > 297 - M) {
    doc.addPage();
    y = 20;
  }
  const colW = 85;
  const leftCx = M + 45;
  const rightCx = W - M - 45;
  const dateLine = wibDateLine();
  // Baris pertama kiri dikosongkan supaya "Mengetahui/Menyetujui," sejajar
  // dengan "Diketahui Oleh," dan jabatan kiri sejajar dengan jabatan kanan.
  const leftHead = ["", SIGNER_LEFT.head, ...doc.splitTextToSize(SIGNER_LEFT.role, colW)];
  const rightHead = [dateLine, SIGNER_RIGHT.head, ...doc.splitTextToSize(SIGNER_RIGHT.role, colW)];
  const headH = Math.max(leftHead.length, rightHead.length) * 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  leftHead.forEach((ln, i) => doc.text(ln, leftCx, y + i * 5, { align: "center" }));
  rightHead.forEach((ln, i) => doc.text(ln, rightCx, y + i * 5, { align: "center" }));
  const nameY = y + headH + 2 + 25;
  doc.setFont("helvetica", "bold");
  doc.text(SIGNER_LEFT.name, leftCx, nameY, { align: "center" });
  doc.text(SIGNER_RIGHT.name, rightCx, nameY, { align: "center" });
  const lw = doc.getTextWidth(SIGNER_LEFT.name);
  const rw = doc.getTextWidth(SIGNER_RIGHT.name);
  doc.setLineWidth(0.4);
  doc.line(leftCx - lw / 2, nameY + 1, leftCx + lw / 2, nameY + 1);
  doc.line(rightCx - rw / 2, nameY + 1, rightCx + rw / 2, nameY + 1);
  doc.setFont("helvetica", "normal");
  doc.text(SIGNER_LEFT.nup, leftCx, nameY + 6, { align: "center" });
  doc.text(SIGNER_RIGHT.nup, rightCx, nameY + 6, { align: "center" });

  // --- Footer di halaman terakhir ---
  const pages = doc.getNumberOfPages();
  doc.setPage(pages);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Dokumen dibuat otomatis dari Panel Monitoring SCADA Tirta Sukapura, ${wibDateID()}.`,
    CX,
    287,
    { align: "center" },
  );

  return doc.output("blob");
}
