"use client";
// The Saved & Search tab (ticket 15). A search box over every past Edition
// (GET /api/search?q=, as the Reader types) above the Reader's saved Items
// (GET /api/saved, rendered by the page), newest-saved first. Each row shows
// the Item's date, Topic and Story Thread, its title and summary, and its
// sources. Save toggles on every row; unsaving in the Saved list takes the row
// out. A sensitive Item keeps its title behind its warning until tapped.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ItemList, ListedItem } from "@/server/saved-search/listing";
import type { SearchResults } from "@/server/saved-search/search";
import { formatNumber, localeOf, localized, type Lang } from "./i18n";
import { useLanguage } from "./language";
import s from "./saved-search.module.css";

/** Wait this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 250;

type Names = Pick<ItemList, "topic_names" | "topic_names_ar">;

export function SavedSearch({ basePath, initialSaved }: { basePath: string; initialSaved: ItemList }) {
  const { lang, t } = useLanguage();
  const [saved, setSaved] = useState(initialSaved);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  async function runSearch(q: string) {
    const ticket = ++latest.current;
    if (!q.trim()) {
      setResults(null);
      setFailed(false);
      return;
    }
    try {
      const res = await fetch(`${basePath}/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SearchResults;
      if (ticket === latest.current) {
        setResults(body);
        setFailed(false);
      }
    } catch {
      if (ticket === latest.current) setFailed(true);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  async function setSave(item: ListedItem, on: boolean) {
    const res = on
      ? await fetch(`${basePath}/api/items/${encodeURIComponent(item.id)}/reactions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "save" }),
        }).catch(() => null)
      : await fetch(`${basePath}/api/items/${encodeURIComponent(item.id)}/reactions/save`, { method: "DELETE" }).catch(
          () => null,
        );
    if (!res?.ok) return;
    // Reload the Saved list so its order is the server's (newest-saved first).
    const list = await fetch(`${basePath}/api/saved`).catch(() => null);
    if (list?.ok) setSaved((await list.json()) as ItemList);
    setResults((r) =>
      r && {
        ...r,
        results: r.results.map((x) => (x.id === item.id ? { ...x, reactions: { ...x.reactions, save: on } } : x)),
      },
    );
  }

  function recordOpen(item: ListedItem) {
    void fetch(`${basePath}/api/items/${encodeURIComponent(item.id)}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "open" }),
      keepalive: true,
    }).catch(() => {});
  }

  const searching = results !== null || failed;
  return (
    <>
      <form role="search" className={s.search} onSubmit={onSubmit}>
        <input
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search every Edition", "ابحث في كل الطبعات")}
          aria-label={t("Search every Edition", "ابحث في كل الطبعات")}
          dir="auto"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      {searching ? (
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className={s.heading}>
            {t("Results", "النتائج")}
            {results && <span className={s.count}>{formatNumber(results.results.length, lang)}</span>}
          </h2>
          {failed ? (
            <p className={s.empty} role="alert">
              {t("Search did not work. Try again.", "تعذّر البحث. حاول مرة أخرى.")}
            </p>
          ) : results!.results.length === 0 ? (
            <p className={s.empty}>{t("No Items match.", "لا توجد أخبار مطابقة.")}</p>
          ) : (
            <ItemRows items={results!.results} names={results!} onSave={setSave} onOpen={recordOpen} />
          )}
        </section>
      ) : (
        <section aria-labelledby="saved-heading">
          <h2 id="saved-heading" className={s.heading}>
            {t("Saved", "المحفوظ")}
            <span className={s.count}>{formatNumber(saved.items.length, lang)}</span>
          </h2>
          {saved.items.length === 0 ? (
            <p className={s.empty}>
              {t("Nothing saved yet. Tap Save on any Item to keep it here.", "لا شيء محفوظ بعد. اضغط حفظ على أي خبر لتجده هنا.")}
            </p>
          ) : (
            <ItemRows items={saved.items} names={saved} onSave={setSave} onOpen={recordOpen} />
          )}
        </section>
      )}
    </>
  );
}

function ItemRows({
  items,
  names,
  onSave,
  onOpen,
}: {
  items: ListedItem[];
  names: Names;
  onSave(item: ListedItem, on: boolean): void;
  onOpen(item: ListedItem): void;
}) {
  return (
    <ol className={s.rows}>
      {items.map((item) => (
        <ItemRow key={item.id} item={item} names={names} onSave={onSave} onOpen={onOpen} />
      ))}
    </ol>
  );
}

function ItemRow({
  item,
  names,
  onSave,
  onOpen,
}: {
  item: ListedItem;
  names: Names;
  onSave(item: ListedItem, on: boolean): void;
  onOpen(item: ListedItem): void;
}) {
  const { lang, t } = useLanguage();
  const [revealed, setRevealed] = useState(false);
  const topicName = (lang === "ar" ? names.topic_names_ar[item.topic] : undefined) ?? names.topic_names[item.topic] ?? item.topic;
  const thread = item.thread ? (lang === "ar" ? item.thread.title_ar : item.thread.title) : null;
  const hidden = item.blurred && !revealed;
  const warning = localized(item, "warning", lang);
  const saved = item.reactions.save;

  return (
    <li className={s.row} data-testid="listed-item">
      <p className={s.meta}>
        <time dateTime={item.time}>{formatItemDate(item.time, lang)}</time>
        <span aria-hidden> · </span>
        <span>{topicName}</span>
        {thread && (
          <>
            <span aria-hidden> · </span>
            <span className={s.thread} dir="auto">
              {thread}
            </span>
          </>
        )}
      </p>
      {hidden ? (
        <div className={s.sensitive}>
          <p dir="auto">
            {t("Sensitive Item", "عنصر حساس")}
            {warning ? `: ${warning}` : ""}
          </p>
          <button type="button" className={s.reveal} onClick={() => setRevealed(true)}>
            {t("Tap to reveal", "اضغط للعرض")}
          </button>
        </div>
      ) : (
        <>
          <h3 className={s.title} dir="auto">
            {localized(item, "title", lang)}
          </h3>
          <p className={s.summary} dir="auto">
            {localized(item, "summary", lang)}
          </p>
          {item.sources.length > 0 && (
            <ul className={s.sources}>
              {item.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(item)} dir="auto">
                    {src.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button
        type="button"
        className={s.save}
        aria-pressed={saved}
        onClick={() => onSave(item, !saved)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M7 4h10v16l-5-4-5 4z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        {t("Save", "حفظ")}
      </button>
    </li>
  );
}

/** "14 Nov 2026" (or "١٤ نوفمبر ٢٠٢٦"), in Asia/Riyadh like the Editions. */
function formatItemDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  });
}
