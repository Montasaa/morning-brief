// Pipeline routes (ingest, gathering list) are called by the gathering side
// with `Authorization: Bearer <INGEST_TOKEN>`. Reader routes use sessions instead.
import { createHash, timingSafeEqual } from "node:crypto";
import type { Config } from "./config";

export function hasPipelineToken(req: Request, config: Config): boolean {
  if (!config.ingestToken) return false; // no token configured: refuse everything
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return false;
  // Compare fixed-length digests so the check takes the same time for any input.
  const given = createHash("sha256").update(match[1]!.trim()).digest();
  const expected = createHash("sha256").update(config.ingestToken).digest();
  return timingSafeEqual(given, expected);
}
