import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dudchdacsrgdnenkqmyo.supabase.co",
      },
    ],
  },
};

export default nextConfig;
