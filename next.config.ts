import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./nwsl-model/data/processed/web/*.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/players/**",
      },
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/teams/**",
      },
    ],
  },
};

export default nextConfig;
