// The Interest Profile: what a Reader has said they care about (the Topics they
// follow) plus their language and city, and whether they have finished
// onboarding. GET/PATCH /api/me. Sensitive Topic opt-ins (ticket 08) are the
// Sensitive Topics among `topics`, opted into only through
// POST /api/topics/{id}/follow. Notification preferences (ticket 18) are the
// two kinds of push, each off until the Reader turns it on. The Display
// (rework ticket 07, src/server/display/) is how their Brief looks and is
// arranged; `display` changes only the keys it sends.
//
// Onboarding is finished by a PATCH with `onboarded: true`, which needs at
// least one followed Topic. Until then the Reader's Brief is empty and the
// Brief page sends them to /onboarding.
import type { AppContext } from "../app";
import { checkDisplayPatch, getDisplay, writeDisplay, type CheckedDisplayPatch } from "../display/display";
import type { Display } from "../display/shape";
import { followedTopicIds, setFollowedTopics, unknownTopicIds } from "../topics/catalog";
import { isSensitiveTopic, lastAgeConfirmation } from "../topics/sensitive";
import type { Reader } from "./readers";

export type ProfileLanguage = "en" | "ar";

export interface InterestProfile {
  reader: Reader;
  onboarded: boolean;
  /** Null until the Reader picks one (the app then follows the device's choice). */
  language: ProfileLanguage | null;
  /** The city for weather and prayer times, as the Reader wrote it. Null until set. */
  city: string | null;
  /** The Topics they follow, in Catalog order. Sensitive ones among them are their opt-ins. */
  topics: string[];
  /** When they last confirmed they are 18 or over, opting into Adult Trending (ISO 8601). Null if never. */
  age_confirmed_at: string | null;
  /** Which pushes they opted into (ticket 18). Each also needs a subscribed device. */
  notifications: NotificationPreferences;
  /** How their Brief looks and is arranged (rework ticket 07); defaults for whatever they never set. */
  display: Display;
}

export interface NotificationPreferences {
  /** "Your Brief is ready" after each Edition, naming their top story. */
  brief_ready: boolean;
  /** A new development on a Story Thread they follow. */
  thread_updates: boolean;
}

const NOTIFICATION_KINDS = ["brief_ready", "thread_updates"] as const;
const NOTIFICATION_COLUMNS = { brief_ready: "push_brief_ready", thread_updates: "push_thread_updates" } as const;

export const CITY_MAX_LENGTH = 80;

interface ProfileRow {
  language: ProfileLanguage | null;
  city: string | null;
  onboarded_at_ms: number | null;
  push_brief_ready: number;
  push_thread_updates: number;
}

export function getProfile(ctx: AppContext, reader: Reader): InterestProfile {
  const row = ctx.db
    .prepare(
      "SELECT language, city, onboarded_at_ms, push_brief_ready, push_thread_updates FROM interest_profiles WHERE reader_id = ?",
    )
    .get(reader.id) as ProfileRow | undefined;
  return {
    reader: { id: reader.id, email: reader.email, role: reader.role },
    onboarded: row?.onboarded_at_ms != null,
    language: row?.language ?? null,
    city: row?.city ?? null,
    topics: followedTopicIds(ctx, reader.id),
    age_confirmed_at: lastAgeConfirmation(ctx, reader.id),
    notifications: { brief_ready: row?.push_brief_ready === 1, thread_updates: row?.push_thread_updates === 1 },
    display: getDisplay(ctx, reader.id),
  };
}

/** Whether the Reader has finished onboarding. */
export function isOnboarded(ctx: AppContext, readerId: number): boolean {
  return ctx.db
    .prepare("SELECT 1 FROM interest_profiles WHERE reader_id = ? AND onboarded_at_ms IS NOT NULL")
    .pluck()
    .get(readerId) !== undefined;
}

export type ProfileUpdate = { ok: true; profile: InterestProfile } | { ok: false; error: string; reasons: string[] };

const FIELDS = new Set(["topics", "language", "city", "onboarded", "notifications", "display"]);

/**
 * PATCH /api/me. Each field is optional: `topics` replaces the followed Topics
 * (Catalog ids), `language` is "en" or "ar", `city` a name (null clears it),
 * `onboarded: true` finishes onboarding, and `notifications` turns either kind
 * of push on or off ({brief_ready?, thread_updates?}), and `display` changes
 * the keys of the Display it sends (src/server/display/). All or nothing: any
 * bad field and nothing changes.
 */
export function updateProfile(ctx: AppContext, reader: Reader, patch: unknown): ProfileUpdate {
  const reasons: string[] = [];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { ok: false, error: "Send a JSON object.", reasons: ["The body must be a JSON object."] };
  }
  const body = patch as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!FIELDS.has(key)) reasons.push(`Unknown field "${key}".`);

  let topics: string[] | undefined;
  if ("topics" in body) {
    if (!Array.isArray(body.topics) || !body.topics.every((t) => typeof t === "string")) {
      reasons.push("topics must be a list of Topic ids.");
    } else {
      topics = [...new Set(body.topics as string[])];
      for (const id of unknownTopicIds(ctx, topics, reader.id)) reasons.push(`"${id}" is not a Topic in the Catalog.`);
      // Opting into a Sensitive Topic is its own step on the Me tab (POST /api/topics/{id}/follow);
      // `topics` may keep or drop the ones already opted into, but never add one.
      const already = new Set(followedTopicIds(ctx, reader.id));
      for (const id of topics) {
        if (!already.has(id) && isSensitiveTopic(ctx, id)) {
          reasons.push(`"${id}" is a Sensitive Topic: opt into it from the Me tab.`);
        }
      }
    }
  }

  let language: ProfileLanguage | undefined;
  if ("language" in body) {
    if (body.language === "en" || body.language === "ar") language = body.language;
    else reasons.push('language must be "en" or "ar".');
  }

  let city: string | null | undefined;
  if ("city" in body) {
    if (body.city === null) city = null;
    else if (typeof body.city !== "string") reasons.push("city must be text, or null to clear it.");
    else {
      city = body.city.trim().replace(/\s+/g, " ");
      if (!city) reasons.push("city is empty; send null to clear it.");
      else if (city.length > CITY_MAX_LENGTH) reasons.push(`city must be at most ${CITY_MAX_LENGTH} characters.`);
    }
  }

  const notifications: Partial<NotificationPreferences> = {};
  if ("notifications" in body) {
    const n = body.notifications;
    if (typeof n !== "object" || n === null || Array.isArray(n)) {
      reasons.push('notifications must be an object such as {"brief_ready": true}.');
    } else {
      for (const [key, value] of Object.entries(n)) {
        if (!(NOTIFICATION_KINDS as readonly string[]).includes(key)) reasons.push(`Unknown notification "${key}".`);
        else if (typeof value !== "boolean") reasons.push(`notifications.${key} must be true or false.`);
        else notifications[key as keyof NotificationPreferences] = value;
      }
    }
  }

  let display: CheckedDisplayPatch | undefined;
  if ("display" in body) {
    // `unblurred` is checked against what the Reader will follow once this request is applied.
    const checked = checkDisplayPatch(ctx, reader.id, body.display, topics ?? followedTopicIds(ctx, reader.id));
    if (checked.ok) display = checked.patch;
    else reasons.push(...checked.reasons);
  }

  let finish = false;
  if ("onboarded" in body) {
    if (body.onboarded === true) finish = true;
    else reasons.push("onboarded can only be set to true.");
  }

  if (finish && reasons.length === 0) {
    const following = topics ?? followedTopicIds(ctx, reader.id);
    if (following.length === 0) {
      return { ok: false, error: "Pick at least one Topic to follow.", reasons: ["Follow at least one Topic to finish onboarding."] };
    }
  }
  if (reasons.length) return { ok: false, error: reasons[0]!, reasons };

  const { db } = ctx;
  db.transaction(() => {
    db.prepare("INSERT INTO interest_profiles (reader_id) VALUES (?) ON CONFLICT DO NOTHING").run(reader.id);
    if (language !== undefined) db.prepare("UPDATE interest_profiles SET language = ? WHERE reader_id = ?").run(language, reader.id);
    if (city !== undefined) db.prepare("UPDATE interest_profiles SET city = ? WHERE reader_id = ?").run(city, reader.id);
    if (topics !== undefined) setFollowedTopics(ctx, reader.id, topics);
    for (const kind of NOTIFICATION_KINDS) {
      const on = notifications[kind];
      if (on === undefined) continue;
      db.prepare(`UPDATE interest_profiles SET ${NOTIFICATION_COLUMNS[kind]} = ? WHERE reader_id = ?`).run(on ? 1 : 0, reader.id);
    }
    if (display) writeDisplay(ctx, reader.id, display);
    if (finish) {
      db.prepare(
        "UPDATE interest_profiles SET onboarded_at_ms = COALESCE(onboarded_at_ms, ?) WHERE reader_id = ?",
      ).run(Date.now(), reader.id);
    }
  })();
  return { ok: true, profile: getProfile(ctx, reader) };
}
