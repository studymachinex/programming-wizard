import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  poweredByHeader: false,
  // No loopback a CPU de gzip custa mais caro que o tráfego (~78 ms/página grande).
  // Para servir na rede local: PW_COMPRESS=1 npm run start.
  compress: process.env.PW_COMPRESS === "1",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
