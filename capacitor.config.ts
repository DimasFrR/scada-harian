import type { CapacitorConfig } from "@capacitor/cli";

// PENTING: ganti server.url dengan URL produksi Vercel setelah project dibuat.
// Placeholder di bawah ini adalah tebakan nama project; perbaiki saat deploy.
const PRODUCTION_URL = "https://scada-harian.vercel.app";

const config: CapacitorConfig = {
  appId: "id.tirtasukapura.scada",
  appName: "SCADA Harian",
  // webDir hanya dipakai sebagai fallback saat build; aplikasi memuat situs live.
  webDir: "public",
  server: {
    url: PRODUCTION_URL,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
