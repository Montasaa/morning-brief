import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { basePathFrom } from "./src/server/config";

// The app lives in web/, but it reads the shared Edition schema from the
// repository's schema/ folder, so the bundler root is the repository root.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig: NextConfig = {
  // Served under its own path on the existing domain (spec: Platform).
  // BASE_PATH is read at build time (and by `next dev`); default /brief.
  basePath: basePathFrom(process.env),
  // The dev indicator would sit on top of the bottom tabs; errors still show.
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
  // Migrations are read from disk at start-up, so ship them with every server route.
  outputFileTracingIncludes: { "/**": ["./migrations/*.sql"] },
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // No on-disk Turbopack cache in `next dev`: with the bundler root above web/,
  // its writes under web/.next were seen as changes, and the dev server kept
  // reloading the page (the Brief jumped back to the cover mid-e2e-test).
  experimental: { turbopackFileSystemCacheForDev: false },
  // The service worker (ticket 18) controls the whole base path ("/brief", the
  // Brief itself), which is wider than its folder ("/brief/"), so it must say so.
  // Never cached, so a new worker reaches Readers straight away.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: basePathFrom(process.env) || "/" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
