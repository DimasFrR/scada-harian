import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint tidak digagalkan saat build (tidak ada konfigurasi ESLint di repo ini)
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
