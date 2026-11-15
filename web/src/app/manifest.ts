// The web app manifest (ticket 18), served at <base path>/manifest.webmanifest:
// it lets a Reader add the Brief to their home screen, opening it like an app.
// Everything is scoped to the base path, like the service worker (public/sw.js):
// "/brief", without a trailing slash, since that is the Brief's own URL.
// BASE_PATH is read at build time, as next.config.ts does.
import type { MetadataRoute } from "next";
import { basePathFrom } from "@/server/config";

export default function manifest(): MetadataRoute.Manifest {
  const base = basePathFrom(process.env);
  const scope = base || "/";
  return {
    id: scope,
    name: "Morning Brief",
    short_name: "Brief",
    description: "Your personal Morning Brief.",
    start_url: scope,
    scope,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf7",
    theme_color: "#1c1b19",
    dir: "auto",
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
