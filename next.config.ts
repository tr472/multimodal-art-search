import type { NextConfig } from "next";

const maxUploadSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? "12");
const safeMaxUploadSizeMb = Number.isFinite(maxUploadSizeMb) && maxUploadSizeMb > 0 ? maxUploadSizeMb : 12;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: safeMaxUploadSizeMb * 1024 * 1024
    }
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }]
  }
};

export default nextConfig;
