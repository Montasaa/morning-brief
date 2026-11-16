// App configuration. Everything comes from environment variables; secrets are
// never committed, defaulted or logged. See web/.env.example for the full list.

export interface Config {
  /** SQLite file. Default: data/brief.db (relative to web/). */
  databasePath: string;
  /** Bearer token the gathering side sends to the pipeline routes. Empty refuses every pipeline call. */
  ingestToken: string;
  /** URL path the app is served under, e.g. "/brief". "" serves from the domain root. */
  basePath: string;
  /** OWNER_EMAIL: the Owner, created at setup (first start) if no Owner exists yet. "" creates none. */
  ownerEmail: string;
  /**
   * PUBLIC_ORIGIN: the site's public origin, e.g. https://example.com, which decides
   * on Secure cookies. "" falls back to the request's origin (local runs only).
   */
  publicOrigin: string;
  /**
   * The scrypt cost (N) new password hashes use. Not read from the environment:
   * always PASSWORD_COST in production. The test app lowers it so the suite stays
   * fast. Each hash records its own N, so checking a password never depends on it.
   */
  passwordCost: number;
}

/** scrypt N for password hashes: 2^15 (with r=8, p=1: 32 MiB and about 80 ms a hash). */
export const PASSWORD_COST = 2 ** 15;

type Env = Record<string, string | undefined>;

/**
 * BASE_PATH, normalised the way Next.js wants it: a leading slash, no trailing
 * slash, and "" for the root. Unset means the default "/brief".
 */
export function basePathFrom(env: Env): string {
  const raw = (env.BASE_PATH ?? "/brief").trim();
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

export function configFromEnv(env: Env = process.env): Config {
  return {
    databasePath: env.DATABASE_PATH || "data/brief.db",
    ingestToken: env.INGEST_TOKEN ?? "",
    basePath: basePathFrom(env),
    ownerEmail: (env.OWNER_EMAIL ?? "").trim().toLowerCase(),
    publicOrigin: (env.PUBLIC_ORIGIN ?? "").trim().replace(/\/+$/, ""),
    passwordCost: PASSWORD_COST,
  };
}
