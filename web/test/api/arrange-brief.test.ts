// Arranging the Brief (rework ticket 11, spec #6): the Reader's Display decides
// where groups sit and how they look (pins, Topic order, collapse), the Cover's
// Widgets and the dock, and never what is in the Brief or how it ranks.
//
// The Brief returns `groups` in Display order: the top stories, then Pinned
// Topics (in `pinned` order), then `topic_order`, then the remaining followed
// Topics in ranked order. A followed Topic with nothing in the Edition is still
// a group, `nothing_qualified`. A Sensitive Item never comes first, however the
// Reader arranges things.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type Group = {
  kind: "top" | "topic";
  topic: string | null;
  pinned: boolean;
  collapsed: boolean;
  item_ids: string[];
  nothing_qualified: boolean;
  note: string | null;
  sensitive: boolean;
  rank: number;
};
type Brief = {
  items: { id: string; top: boolean; sensitive: boolean; topic: string }[];
  groups: Group[];
  nothing_to_show: boolean;
  cover: { widgets: { kind: string }[]; more_widgets: { kind: string }[] };
};

/** The morning Edition plus a US Markets, a game and a second AI Item, so there are enough Topic groups to arrange. */
function richEdition(): EditionDoc {
  const edition = morningEdition();
  edition.items.push(
    {
      id: "markets-fed-minutes",
      topics: ["us-markets"],
      time: "2026-11-13T23:30:00+03:00",
      title: "Fed minutes point to a pause",
      summary: "Officials saw little reason to move rates before the new year.",
      sources: [{ title: "Example Markets", url: "https://example.com/markets/fed", type: "independent" }],
    },
    {
      id: "game-tactics-release",
      topics: ["turn-based-rpg-tactics"],
      time: "2026-11-13T15:00:00+03:00",
      title: "A grid tactics sequel gets a release date",
      summary: "The sequel lands next week on PC and Switch.",
      sources: [{ title: "Example Games", url: "https://example.com/games/tactics", type: "independent" }],
    },
    {
      id: "ai-chip-export-rules",
      topics: ["ai"],
      time: "2026-11-13T12:00:00+03:00",
      title: "New export rules for AI chips",
      summary: "The rules take effect next month.",
      sources: [{ title: "Example Policy", url: "https://example.com/policy/chips", type: "independent" }],
    },
  );
  return edition;
}

const FOLLOWED = ["yemen", "ai", "liverpool", "github-trending", "us-markets", "turn-based-rpg-tactics"];

/** A Reader who finished onboarding following exactly `topics` (no Sensitive Topics). */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

async function briefOf(session: TestSession): Promise<Brief> {
  const res = await session.request("GET", "/api/brief");
  expect(res.status, res.text).toBe(200);
  return res.body as Brief;
}

async function arrange(session: TestSession, display: Record<string, unknown>) {
  const res = await session.request("PATCH", "/api/me", { body: { display } });
  expect(res.status, res.text).toBe(200);
}

const topicsOf = (brief: Brief) => brief.groups.filter((g) => g.kind === "topic").map((g) => g.topic!);
const tops = (brief: Brief) => brief.groups.filter((g) => g.kind === "top").flatMap((g) => g.item_ids);
/** Each Topic group's Items, by Topic: what Display must never change. */
const itemsByTopic = (brief: Brief) => Object.fromEntries(brief.groups.filter((g) => g.kind === "topic").map((g) => [g.topic, g.item_ids]));

/** A Reader signed in after ingest, following FOLLOWED, with the Brief they get before arranging anything. */
async function arrangedReader() {
  const app = await startTestApp();
  await app.postEdition(richEdition());
  const sara = await readerFollowing(app, "sara@example.com", FOLLOWED);
  const ranked = await briefOf(sara);
  return { app, sara, ranked, rankedTopics: topicsOf(ranked) };
}

describe("groups", () => {
  it("come as the top stories, then each followed Topic in ranked order, each with its arranging fields", async () => {
    const { ranked, rankedTopics } = await arrangedReader();

    expect(ranked.groups[0]).toEqual({
      kind: "top",
      topic: null,
      pinned: false,
      collapsed: false,
      item_ids: ["me-yemen-port-talks", "ai-open-model-release"],
      nothing_qualified: false,
      note: null,
      sensitive: false,
      rank: 0,
    });
    // Ranked: groups by their best Item (here, the newest), Items by score inside each.
    expect(rankedTopics).toEqual(["liverpool", "us-markets", "github-trending", "turn-based-rpg-tactics", "ai"]);
    expect(ranked.groups.find((g) => g.topic === "ai")).toEqual({
      kind: "topic",
      topic: "ai",
      pinned: false,
      collapsed: false,
      item_ids: ["ai-chip-export-rules"],
      nothing_qualified: false,
      note: null,
      sensitive: false,
      rank: 5,
    });
    // The Items come in group order.
    expect(ranked.items.map((i) => i.id)).toEqual(ranked.groups.flatMap((g) => g.item_ids));
  });

  it("put Pinned Topics first after the top stories, in pinned order", async () => {
    const { sara, rankedTopics } = await arrangedReader();

    await arrange(sara, { pinned: ["github-trending", "liverpool"] });
    const brief = await briefOf(sara);

    expect(brief.groups[0]!.kind).toBe("top");
    expect(topicsOf(brief)).toEqual(["github-trending", "liverpool", ...rankedTopics.filter((t) => t !== "github-trending" && t !== "liverpool")]);
    expect(brief.groups.filter((g) => g.pinned).map((g) => g.topic)).toEqual(["github-trending", "liverpool"]);
  });

  it("then follow topic_order, then the remaining Topics in ranked order", async () => {
    const { sara, rankedTopics } = await arrangedReader();

    await arrange(sara, { pinned: ["us-markets"], topic_order: ["ai", "us-markets", "turn-based-rpg-tactics"] });
    const brief = await briefOf(sara);

    const rest = rankedTopics.filter((t) => !["us-markets", "ai", "turn-based-rpg-tactics"].includes(t));
    expect(topicsOf(brief)).toEqual(["us-markets", "ai", "turn-based-rpg-tactics", ...rest]);
    expect(brief.items.map((i) => i.id)).toEqual(brief.groups.flatMap((g) => g.item_ids));
  });

  it("mark Collapsed Topics, which keep their place and their Items", async () => {
    const { sara, ranked } = await arrangedReader();

    await arrange(sara, { collapsed: ["liverpool", "ai"] });
    const brief = await briefOf(sara);

    expect(topicsOf(brief)).toEqual(topicsOf(ranked));
    expect(brief.groups.filter((g) => g.collapsed).map((g) => g.topic)).toEqual(["liverpool", "ai"]);
    expect(itemsByTopic(brief)).toEqual(itemsByTopic(ranked));
  });

  it("leave out Topics in the arranging lists that the Reader does not follow", async () => {
    const { sara, rankedTopics } = await arrangedReader();

    await arrange(sara, { pinned: ["saudi", "ai"], topic_order: ["iran"] });
    const brief = await briefOf(sara);

    expect(topicsOf(brief)).toEqual(["ai", ...rankedTopics.filter((t) => t !== "ai")]);
    expect(brief.groups.some((g) => g.topic === "saudi" || g.topic === "iran")).toBe(false);
  });
});

describe("Display never changes ranking", () => {
  it("keeps the same top stories and the same Items, in the same order, inside every group", async () => {
    const { sara, ranked, rankedTopics } = await arrangedReader();
    const changes: Record<string, unknown>[] = [
      { pinned: ["ai", "turn-based-rpg-tactics"] },
      { topic_order: [...rankedTopics].reverse() },
      { collapsed: rankedTopics },
      { widgets: ["countdown"], dock: ["share", "hide"] },
      { theme: "light", accent: "lime", text_size: "xl", density: "compact", layouts: { phone: "list" } },
      { pinned: null, topic_order: null, collapsed: null },
    ];

    for (const change of changes) {
      await arrange(sara, change);
      const brief = await briefOf(sara);
      expect(tops(brief), JSON.stringify(change)).toEqual(tops(ranked));
      expect(itemsByTopic(brief), JSON.stringify(change)).toEqual(itemsByTopic(ranked));
      expect(brief.items.map((i) => i.id).sort()).toEqual(ranked.items.map((i) => i.id).sort());
    }
  });

  it("for a Reader whose top stories Claude picked, too", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.replies.set("top-picks", {
      text: JSON.stringify({ top_stories: [{ item: "gh-terminal-agent", why: "You star Rust tools." }] }),
    });
    await app.postEdition(richEdition());
    const before = await briefOf(owner);

    await arrange(owner, { pinned: topicsOf(before).slice(-2), collapsed: topicsOf(before).slice(0, 1) });
    const after = await briefOf(owner);

    expect(tops(before)).toEqual(["gh-terminal-agent"]);
    expect(tops(after)).toEqual(tops(before));
    expect(itemsByTopic(after)).toEqual(itemsByTopic(before));
    expect(topicsOf(after)).not.toEqual(topicsOf(before));
  });
});

describe("nothing qualified", () => {
  it("a followed Topic with nothing in the Edition comes back as an empty group, after the ranked ones", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition()); // nothing for US Markets or Saudi
    const sara = await readerFollowing(app, "sara@example.com", ["ai", "liverpool", "us-markets", "iran"]);

    const brief = await briefOf(sara);

    // The empty ones in Catalog order.
    expect(topicsOf(brief)).toEqual(["liverpool", "iran", "us-markets"]);
    expect(brief.groups.find((g) => g.topic === "us-markets")).toEqual({
      kind: "topic",
      topic: "us-markets",
      pinned: false,
      collapsed: false,
      item_ids: [],
      nothing_qualified: true,
      note: null,
      sensitive: false,
      rank: 3,
    });
    expect(brief.groups.find((g) => g.topic === "liverpool")!.nothing_qualified).toBe(false);
  });

  it("is not said of a Topic whose Items are already in the Brief under another Topic or among the top stories", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    // Saudi's one Item is shown under Yemen; AI's is a top story.
    const sara = await readerFollowing(app, "sara@example.com", ["yemen", "saudi", "ai"]);

    const brief = await briefOf(sara);

    expect(brief.groups.some((g) => g.nothing_qualified)).toBe(false);
  });

  it("can be pinned, ordered and collapsed like any other group", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["liverpool", "github-trending", "us-markets"]);

    await arrange(sara, { pinned: ["us-markets"], collapsed: ["us-markets"] });
    const brief = await briefOf(sara);

    // No top stories here (the Edition's are Yemen and AI), so the pinned group comes first.
    expect(brief.groups[0]).toMatchObject({ topic: "us-markets", pinned: true, collapsed: true, nothing_qualified: true, item_ids: [] });
    expect(brief.items[0]!.id).toBe("lfc-midfielder-fitness");
  });
});

describe("a Sensitive Item never comes first, however the Brief is arranged", () => {
  /** The morning Edition with two newer Sensitive Items and no top stories, so nothing leads but the arrangement. */
  function sensitiveEdition(): EditionDoc {
    const edition = morningEdition();
    delete edition.top_stories;
    edition.items.push({
      id: "yemen-strike-aftermath",
      topics: ["yemen", "graphic"],
      status: "new",
      time: "2026-11-14T06:00:00+03:00",
      title: "Strike aftermath in Taiz",
      summary: "Hospitals report casualties after an overnight strike.",
      sources: [{ title: "Example Wire", url: "https://example.com/wire/taiz", type: "wire" }],
      warning: "Casualties",
    });
    Object.assign(edition.items.find((i) => i.id === "graphic-flood-aftermath")!, { status: "new", time: "2026-11-14T05:59:00+03:00" });
    return edition;
  }

  async function sensitiveReader(topics: string[]) {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", topics); // signed in after ingest: no top stories
    expect((await sara.request("POST", "/api/topics/graphic/follow")).status).toBe(200);
    return sara;
  }

  it("not when a Sensitive Topic is pinned and ordered first", async () => {
    const sara = await sensitiveReader(["ai", "liverpool", "yemen"]);

    await arrange(sara, { pinned: ["graphic", "yemen"], topic_order: ["graphic"] });
    const brief = await briefOf(sara);

    expect(tops(brief)).toEqual([]);
    expect(brief.items[0]!.sensitive).toBe(false);
    expect(brief.nothing_to_show).toBe(false);
    // The pins still lead, behind the one group it took to open on a non-Sensitive Item.
    expect(topicsOf(brief).slice(0, 3)).toEqual([brief.items[0]!.topic, "graphic", "yemen"]);
  });

  it("not when every group is led by a Sensitive Item but a lower one is not", async () => {
    // Yemen's best Item is the Taiz strike (Graphic); its port talks Item is not sensitive.
    const sara = await sensitiveReader(["yemen"]);

    for (const display of [{}, { pinned: ["graphic"] }, { topic_order: ["yemen", "graphic"] }]) {
      await arrange(sara, display);
      const brief = await briefOf(sara);
      expect(brief.items[0], JSON.stringify(display)).toMatchObject({ id: "me-yemen-port-talks", sensitive: false });
      expect(brief.nothing_to_show).toBe(false);
    }
  });

  it("a Brief of only Sensitive Items opens on the nothing-to-show note in any arrangement", async () => {
    const sara = await sensitiveReader(["ai"]);
    await sara.request("POST", "/api/topics/ai/unfollow");

    await arrange(sara, { pinned: ["graphic"], collapsed: ["graphic"] });
    const brief = await briefOf(sara);

    expect(brief.nothing_to_show).toBe(true);
    expect(brief.items.every((i) => i.sensitive)).toBe(true);
  });
});

describe("Cover Widgets", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T07:00:00+03:00") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function widgetReader() {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await app.addReader("sara@example.com", { onboarded: false });
    const res = await sara.request("PATCH", "/api/me", { body: { topics: ["liverpool", "us-markets"], city: "Riyadh", onboarded: true } });
    expect(res.status, res.text).toBe(200);
    return sara;
  }
  const kinds = (widgets: { kind: string }[]) => widgets.map((w) => w.kind);

  it("by default shows every Widget the Reader is eligible for", async () => {
    const sara = await widgetReader();

    const { cover } = await briefOf(sara);

    expect(kinds(cover.widgets)).toEqual(["weather", "prayer_times", "next_match", "countdown"]);
    expect(cover.more_widgets).toEqual([]);
  });

  it("follow the Reader's order, and a removed Widget waits in more_widgets to be added back", async () => {
    const sara = await widgetReader();

    await arrange(sara, { widgets: ["countdown", "weather", "next_match"] });
    const arranged = (await briefOf(sara)).cover;

    expect(kinds(arranged.widgets)).toEqual(["countdown", "weather", "next_match"]);
    expect(kinds(arranged.more_widgets)).toEqual(["prayer_times"]);

    await arrange(sara, { widgets: ["countdown", "weather", "next_match", "prayer_times"] });
    expect(kinds((await briefOf(sara)).cover.widgets)).toEqual(["countdown", "weather", "next_match", "prayer_times"]);
  });
});

describe("validating the arranging keys", () => {
  async function expectRefused(display: unknown, reason: RegExp) {
    const { sara, ranked } = await arrangedReader();
    const res = await sara.request("PATCH", "/api/me", { body: { display } });
    expect(res.status, res.text).toBe(422);
    expect(res.body.reasons.join("\n")).toMatch(reason);
    // Nothing stored: the Brief is arranged as before.
    expect(topicsOf(await briefOf(sara))).toEqual(topicsOf(ranked));
  }

  it("refuses a pin on a Topic not in the Catalog, and stores nothing else from that request", () =>
    expectRefused({ pinned: ["ai", "no-such-topic"], topic_order: ["us-markets"] }, /display\.pinned: "no-such-topic" is not a Topic in the Catalog/));
  it("refuses a topic_order that is not a list of ids", () => expectRefused({ topic_order: "ai" }, /display\.topic_order/));
  it("refuses collapsing a Topic not in the Catalog", () => expectRefused({ collapsed: [42] }, /display\.collapsed/));
  it("refuses an unknown Widget", () => expectRefused({ widgets: ["weather", "stocks"] }, /display\.widgets: "stocks" is not a Widget/));
  it("refuses a dock of more than 5 buttons", () =>
    expectRefused({ dock: ["like", "save", "ask", "hide", "share", "like"] }, /display\.dock must have 1 to 5 buttons/));
  it("refuses an unknown dock button", () => expectRefused({ dock: ["like", "react"] }, /display\.dock: "react" is not a dock button/));

  it("de-duplicates the arranging lists, keeping the first", async () => {
    const { sara } = await arrangedReader();

    await arrange(sara, { pinned: ["ai", "liverpool", "ai"], dock: ["share", "like", "share"] });

    const display = (await sara.request("GET", "/api/me")).body.display;
    expect(display.pinned).toEqual(["ai", "liverpool"]);
    expect(display.dock).toEqual(["share", "like"]);
  });
});
