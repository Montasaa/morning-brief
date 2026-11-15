// A short-lived cache for live Widget data, kept in the database (widget_cache)
// so every route bundle and restart shares it. Only successes are cached: a
// failing service is asked again on the next request.
import type { AppContext } from "../app";

export const MINUTE_MS = 60_000;

export async function cached<T>(ctx: AppContext, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = ctx.db
    .prepare("SELECT value FROM widget_cache WHERE key = ? AND expires_at_ms > ?")
    .pluck()
    .get(key, now) as string | undefined;
  if (hit !== undefined) return JSON.parse(hit) as T;

  const value = await load();
  ctx.db
    .prepare(
      `INSERT INTO widget_cache (key, value, expires_at_ms) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at_ms = excluded.expires_at_ms`,
    )
    .run(key, JSON.stringify(value ?? null), Date.now() + ttlMs);
  return value;
}
