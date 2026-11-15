// The Saved & Search tab (ticket 15): search every past Edition, and the
// Reader's saved Items, newest-saved first.
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { savedItems } from "@/server/saved-search/saved";
import { T } from "../_components/language";
import { SavedSearch } from "../_components/saved-search";
import s from "../_components/saved-search.module.css";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  return (
    <main className={s.screen}>
      <h1>
        <T en="Saved & Search" ar="المحفوظ والبحث" />
      </h1>
      <SavedSearch basePath={ctx.config.basePath} initialSaved={savedItems(ctx, reader.id)} />
    </main>
  );
}
