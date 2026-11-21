// Penandatangan laporan — format surat resmi, ditandatangani manual setelah print.
// Format disepakati 20 Nov 2026 (diperbaiki dari prototype), diubah 21 Nov 2026:
// kiri "Mengetahui," (Kabag), kanan "Diketahui Oleh," (Kasubag);
// kedua blok sejajar (judul, nama, NUP pada ketinggian yang sama).
// Dipakai bersama oleh PDF laporan harian (PdfButton) dan PDF rekap bulanan
// (monthlyPdf) supaya formatnya tidak melenceng satu sama lain.

export const SIGNER_PLACE = "Tasikmalaya";

export const SIGNER_LEFT = {
  head: "Mengetahui,",
  role: "Kepala Bagian Transmisi dan Distribusi",
  name: "CECEP WENDI SETIADI, S.IP",
  nup: "NUP 0221",
};

export const SIGNER_RIGHT = {
  head: "Diketahui Oleh,",
  role: "Kepala Sub Bagian Pengendalian Kehilangan Air",
  name: "JONI KUSWARA, S.Sos",
  nup: "NUP 0304",
};

export const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "20 November 2026" — tanggal berjalan dalam WIB. */
export function wibDateID(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${MONTHS_ID[Number(get("month")) - 1]} ${get("year")}`;
}

/** "Tasikmalaya, 20 November 2026" — baris tanggal surat. */
export function wibDateLine(date = new Date()): string {
  return `${SIGNER_PLACE}, ${wibDateID(date)}`;
}
