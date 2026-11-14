// App configuration. Everything comes from environment variables; secrets are
// never committed, defaulted or logged. See web/.env.example for the full list.

export interface Config {
  /** SQLite file. Default: data/brief.db (relative to web/). */
  databasePath: string;
  /** Bearer token the gathering side sends to the pipeline routes. Empty refuses every pipeline call. */
  ingestToken: string;
  /** URL path the app is served under, e.g. "/brief". "" serves from the domain root. */
  basePath: string;
}

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
  };
}
