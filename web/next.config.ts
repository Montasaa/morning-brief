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
  serverExternalPackages: ["better-sqlite3"],
  // Migrations are read from disk at start-up, so ship them with every server route.
  outputFileTracingIncludes: { "/**": ["./migrations/*.sql"] },
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
