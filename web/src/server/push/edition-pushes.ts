// The pushes an Edition sets off (ticket 18), sent after ingest and top picking
// (the ingest routes call sendEditionPushes before they answer):
//
// - "Brief ready": one push to each Reader who opted into it, naming their own
//   top story, or else their first Item. Once per Reader and Edition, only for
//   the latest Edition, and only when their Brief has something in it.
// - Thread updates: when ingest links an Item to a Story Thread for the first
//   time (a new development), the Thread's followers who opted in get a push,
//   if they may see that Item under the Brief's rules (a Topic they follow, and
//   every Sensitive Topic it carries opted into). One push per Reader and
//   Thread, naming the newest development. Only for the latest Edition.
//
// A sensitive Item (one carrying a Sensitive Topic) is never in a push (rework
// ticket 10), whatever the Reader's blur switch says: "Brief ready" names only
// a non-sensitive Item (and no Item at all when there is none), and a
// development that is a sensitive Item sends no Thread push.
//
// Pushes go to every device the Reader subscribed whose session is still signed
// in. A device the push service calls gone is forgotten; a failing one is
// skipped. Nothing here ever fails the ingest.
import type { AppContext } from "../app";
import { composeBrief, type BriefItem } from "../brief/compose";
import type { PushMessage } from "../outside";
import { sensitiveItemSql, sensitiveItemVisibleSql } from "../topics/sensitive";
import { forgetSubscription, liveSubscriptions } from "./subscriptions";

type Lang = "en" | "ar";

export interface EditionPushCounts {
  /** Readers sent "Brief ready". */
  brief_ready: number;
  /** Readers sent a Thread update (one count per Reader and Thread). */
  thread_updates: number;
}

const LATEST_EDITION = "SELECT id FROM editions ORDER BY generated_at_ms DESC, received_at DESC LIMIT 1";

/** After an Edition is ingested and top stories are picked. Never throws. */
export async function sendEditionPushes(ctx: AppContext, editionId: string): Promise<EditionPushCounts> {
  const counts: EditionPushCounts = { brief_ready: 0, thread_updates: 0 };
  try {
    const developments = newThreadDevelopments(ctx, editionId);
    const latest = ctx.db.prepare(LATEST_EDITION).pluck().get() as string | undefined;
    if (latest !== editionId) return counts;
    counts.thread_updates = await sendThreadUpdates(ctx, developments);
    counts.brief_ready = await sendBriefReady(ctx, editionId);
  } catch (err) {
    console.error(`Push: sending failed (${err instanceof Error ? err.name : "error"}).`);
  }
  return counts;
}

// --- Brief ready ----------------------------------------------------------------

const BRIEF_READY_TITLE: Record<"morning" | "evening", Record<Lang, string>> = {
  morning: { en: "Your morning Brief is ready", ar: "موجزك الصباحي جاهز" },
  evening: { en: "Your evening Brief is ready", ar: "موجزك المسائي جاهز" },
};
/** The body when the Brief has no Item a push may name (only sensitive ones). */
const NO_STORY: Record<Lang, string> = {
  en: "Open your Brief to read it.",
  ar: "افتح موجزك لقراءته.",
};

async function sendBriefReady(ctx: AppContext, editionId: string): Promise<number> {
  const readers = ctx.db
    .prepare(
      `SELECT r.id, p.language FROM readers r JOIN interest_profiles p ON p.reader_id = r.id
        WHERE r.revoked_at_ms IS NULL AND p.push_brief_ready = 1
          AND NOT EXISTS (SELECT 1 FROM brief_ready_pushes b WHERE b.reader_id = r.id AND b.edition_id = ?)
        ORDER BY r.id`,
    )
    .all(editionId) as { id: number; language: Lang | null }[];
  const record = ctx.db.prepare(
    "INSERT OR IGNORE INTO brief_ready_pushes (reader_id, edition_id, sent_at_ms) VALUES (?, ?, ?)",
  );

  let sent = 0;
  for (const reader of readers) {
    if (liveSubscriptions(ctx, reader.id).length === 0) continue;
    const brief = composeBrief(ctx, reader);
    if (brief.edition?.id !== editionId || brief.items.length === 0) continue;
    const lang = reader.language ?? "en";
    // Top stories are never sensitive; without one, the first Item that is not.
    const named = brief.items.find((i) => i.top) ?? brief.items.find((i) => !i.sensitive);
    // Recorded first, so a second ingest of the same Edition running alongside never pushes twice.
    if (record.run(reader.id, editionId, Date.now()).changes === 0) continue;
    await pushToReader(ctx, reader.id, {
      title: BRIEF_READY_TITLE[brief.edition.kind][lang],
      body: named ? itemTitle(named, lang) : NO_STORY[lang],
      url: "/",
      tag: "brief-ready",
      ...language(lang),
    });
    sent += 1;
  }
  return sent;
}

// --- Thread updates ---------------------------------------------------------------

interface Development {
  item_id: string;
  thread_id: string;
}

/**
 * The Edition's Items linked to a Thread for the first time. They are marked
 * as seen straight away, so posting the Edition again announces nothing.
 */
function newThreadDevelopments(ctx: AppContext, editionId: string): Development[] {
  const { db } = ctx;
  return db.transaction(() => {
    const found = db
      .prepare(
        `SELECT i.id AS item_id, i.thread_id FROM edition_items ei JOIN items i ON i.id = ei.item_id
          WHERE ei.edition_id = ? AND i.thread_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM thread_developments d WHERE d.item_id = i.id AND d.thread_id = i.thread_id)
          ORDER BY ei.position`,
      )
      .all(editionId) as Development[];
    const mark = db.prepare("INSERT OR IGNORE INTO thread_developments (item_id, thread_id, seen_at_ms) VALUES (?, ?, ?)");
    const now = Date.now();
    for (const d of found) mark.run(d.item_id, d.thread_id, now);
    return found;
  })();
}

interface VisibleDevelopment {
  title: string;
  title_ar: string | null;
}

async function sendThreadUpdates(ctx: AppContext, developments: Development[]): Promise<number> {
  const byThread = new Map<string, string[]>();
  for (const d of developments) byThread.set(d.thread_id, [...(byThread.get(d.thread_id) ?? []), d.item_id]);

  const followers = ctx.db.prepare(
    `SELECT r.id, p.language FROM thread_follows f
       JOIN readers r ON r.id = f.reader_id AND r.revoked_at_ms IS NULL
       JOIN interest_profiles p ON p.reader_id = r.id AND p.push_thread_updates = 1
      WHERE f.thread_id = ? ORDER BY r.id`,
  );
  const thread = ctx.db.prepare("SELECT title, title_ar FROM threads WHERE id = ?");

  let sent = 0;
  for (const [threadId, itemIds] of byThread) {
    const { title, title_ar } = thread.get(threadId) as { title: string; title_ar: string | null };
    for (const reader of followers.all(threadId) as { id: number; language: Lang | null }[]) {
      const visible = visibleItems(ctx, reader.id, itemIds);
      if (visible.length === 0 || liveSubscriptions(ctx, reader.id).length === 0) continue;
      const lang = reader.language ?? "en";
      const newest = visible[0]!;
      const more = visible.length - 1;
      let body = itemTitle(newest, lang);
      if (more > 0) body += lang === "ar" ? ` (+${more.toLocaleString("ar-SA")} أخرى)` : ` (+${more} more)`;
      await pushToReader(ctx, reader.id, {
        title: (lang === "ar" && title_ar) || title,
        body,
        url: `/threads/${encodeURIComponent(threadId)}`,
        tag: `thread-${threadId}`,
        ...language(lang),
      });
      sent += 1;
    }
  }
  return sent;
}

/**
 * Of `itemIds`, the ones the Reader may see (as their Brief and Threads would show them) and a push may name
 * (never a sensitive Item), newest first.
 */
function visibleItems(ctx: AppContext, readerId: number, itemIds: string[]): VisibleDevelopment[] {
  return ctx.db
    .prepare(
      `SELECT i.title, i.title_ar FROM items i
        WHERE i.id IN (SELECT value FROM json_each(?)) AND NOT ${sensitiveItemSql("i.id")}
          AND EXISTS (SELECT 1 FROM item_topics t JOIN topic_follows f ON f.topic_id = t.topic_id AND f.reader_id = ?
                       WHERE t.item_id = i.id)
          AND ${sensitiveItemVisibleSql("i.id")}
        ORDER BY i.time_ms DESC, i.id`,
    )
    .all(JSON.stringify(itemIds), readerId, readerId) as VisibleDevelopment[];
}

// --- sending ------------------------------------------------------------------

function itemTitle(item: Pick<BriefItem, "title" | "title_ar">, lang: Lang): string {
  return (lang === "ar" && item.title_ar) || item.title;
}

function language(lang: Lang): Pick<PushMessage, "lang" | "dir"> {
  return { lang, dir: lang === "ar" ? "rtl" : "ltr" };
}

/** Send to each of the Reader's signed-in devices. */
async function pushToReader(ctx: AppContext, readerId: number, message: PushMessage): Promise<void> {
  await Promise.all(
    liveSubscriptions(ctx, readerId).map(async (subscription) => {
      try {
        if ((await ctx.services.push.send(subscription, message)) === "gone") forgetSubscription(ctx, subscription.endpoint);
      } catch (err) {
        // A Reader's devices and what is pushed to them are private: log only that one failed.
        console.warn(`Push: one device could not be reached (${err instanceof Error ? err.name : "error"}).`);
      }
    }),
  );
}
