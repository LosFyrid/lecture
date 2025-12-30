import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config) => {
    // pdfjs-dist has an optional Node dependency on "canvas".
    // For browser builds (and our client-only PDF viewer), we don't want to bundle it.
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      canvas: false,
    };
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      canvas: false,
    };
    return config;
  },
  async rewrites() {
    // Local dev convenience: run `api/` on :8080 and set
    // LECTURE_API_BASE_URL=http://localhost:8080 to proxy /assets and /api.
    const apiBase = process.env.LECTURE_API_BASE_URL;
    if (!apiBase) return [];
    return [
      { source: "/assets/:path*", destination: `${apiBase}/assets/:path*` },
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;
