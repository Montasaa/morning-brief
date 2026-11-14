// Catalog & Topics. Ticket 02 seeds the 14 starting Topics (migration
// t02_topics.sql) and lists them; later tickets add following, Reader-created
// Topics, sharing and Gathering Rules here.
import type { AppContext } from "../app";

export interface CatalogTopic {
  id: string;
  name: string;
  name_ar: string;
  /** A Sensitive Topic: each Reader must opt in before seeing it. */
  sensitive: boolean;
}

export function listCatalog(ctx: AppContext): CatalogTopic[] {
  const rows = ctx.db
    .prepare("SELECT id, name, name_ar, sensitive FROM topics ORDER BY position, id")
    .all() as (Omit<CatalogTopic, "sensitive"> & { sensitive: number })[];
  return rows.map((r) => ({ ...r, sensitive: r.sensitive === 1 }));
}
