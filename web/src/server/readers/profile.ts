// The Interest Profile: what a Reader has said they care about (the Topics they
// follow) plus their language and city, and whether they have finished
// onboarding. GET/PATCH /api/me. Sensitive Topic opt-ins (ticket 08) are the
// Sensitive Topics among `topics`, opted into only through
// POST /api/topics/{id}/follow; ticket 18 adds notification preferences here.
//
// Onboarding is finished by a PATCH with `onboarded: true`, which needs at
// least one followed Topic. Until then the Reader's Brief is empty and the
// Brief page sends them to /onboarding.
import type { AppContext } from "../app";
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
}

export const CITY_MAX_LENGTH = 80;

interface ProfileRow {
  language: ProfileLanguage | null;
  city: string | null;
  onboarded_at_ms: number | null;
}

export function getProfile(ctx: AppContext, reader: Reader): InterestProfile {
  const row = ctx.db
    .prepare("SELECT language, city, onboarded_at_ms FROM interest_profiles WHERE reader_id = ?")
    .get(reader.id) as ProfileRow | undefined;
  return {
    reader: { id: reader.id, email: reader.email, role: reader.role },
    onboarded: row?.onboarded_at_ms != null,
    language: row?.language ?? null,
    city: row?.city ?? null,
    topics: followedTopicIds(ctx, reader.id),
    age_confirmed_at: lastAgeConfirmation(ctx, reader.id),
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

const FIELDS = new Set(["topics", "language", "city", "onboarded"]);

/**
 * PATCH /api/me. Each field is optional: `topics` replaces the followed Topics
 * (Catalog ids), `language` is "en" or "ar", `city` a name (null clears it),
 * and `onboarded: true` finishes onboarding. All or nothing: any bad field and
 * nothing changes.
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
      for (const id of unknownTopicIds(ctx, topics)) reasons.push(`"${id}" is not a Topic in the Catalog.`);
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
    if (finish) {
      db.prepare(
        "UPDATE interest_profiles SET onboarded_at_ms = COALESCE(onboarded_at_ms, ?) WHERE reader_id = ?",
      ).run(Date.now(), reader.id);
    }
  })();
  return { ok: true, profile: getProfile(ctx, reader) };
}
