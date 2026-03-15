import type { NextConfig } from "next";

// Server-side only — proxied by Next.js rewrites, never sent to the browser.
// In production this is set via BACKEND_URL env var (container name DNS).
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * Proxy API calls and session-sensitive routes to the FastAPI backend.
   * This keeps everything same-origin from the browser's perspective,
   * so session cookies work without CORS complexity.
   */
  async rewrites() {
    return [
      // v2 JSON API
      { source: "/api/v2/:path*", destination: `${BACKEND}/api/v2/:path*` },
      // v1 JSON API (wallets, categories, transactions, push, notifications badge)
      { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      // Session auth endpoints
      { source: "/login", destination: `${BACKEND}/login` },
      { source: "/logout", destination: `${BACKEND}/logout` },
      // Legacy SSR pages — open in same tab, user sees old UI until migrated
      {
        source: "/legacy/:path*",
        destination: `${BACKEND}/:path*`,
      },
    ];
  },
};

export default nextConfig;
