// Fakes for every outside service. API-seam tests get them from
// startTestApp(); the e2e server uses them when OUTSIDE_SERVICES=fake.
// They never touch the network and record what the app asked of them.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ClaudeReply,
  ClaudeRequest,
  EmailMessage,
  OutsideServices,
  Place,
  PrayerTimes,
  PushMessage,
  PushSubscription,
  RedditPost,
  WeatherToday,
} from "./index";

export interface FakeOutsideServices extends OutsideServices {
  claude: OutsideServices["claude"] & {
    /** Every request Claude received, in order. */
    calls: ClaudeRequest[];
    /** Canned replies by purpose; a function can look at the request. Unset purposes get a default reply. */
    replies: Map<string, ClaudeReply | ((req: ClaudeRequest) => ClaudeReply)>;
    /** Purposes for which the fake throws, to test fallbacks. */
    failing: Set<string>;
  };
  email: OutsideServices["email"] & { outbox: EmailMessage[] };
  weather: OutsideServices["weather"] & {
    calls: Place[];
    reply: WeatherToday;
    /** Cities findPlace was asked about, in order. */
    placeCalls: string[];
    /** The places findPlace knows, by lower-cased city name. Starts with a few real cities. */
    places: Map<string, Place>;
    /** When true, today() throws (an Open-Meteo outage). */
    failing: boolean;
  };
  prayerTimes: OutsideServices["prayerTimes"] & {
    calls: { place: Place; date: string }[];
    reply: Omit<PrayerTimes, "date">;
    /** When true, forDay() throws (an Aladhan outage). */
    failing: boolean;
  };
  push: OutsideServices["push"] & {
    sent: { subscription: PushSubscription; message: PushMessage }[];
    /** Endpoints the fake reports as expired. */
    gone: Set<string>;
    /** Endpoints the fake fails for (a push service error). */
    failing: Set<string>;
  };
  reddit: OutsideServices["reddit"] & {
    /** The posts each feed URL serves; a feed not listed here is empty. */
    feeds: Map<string, RedditPost[]>;
    /** Every feed URL asked for, in order. */
    calls: string[];
    /** Feed URLs the fake refuses (a Reddit 429 or outage). */
    failing: Set<string>;
  };
}

/**
 * What the fake Claude answers for a purpose no test has set a reply for, when
 * the default text would not do (the e2e server has no way to set replies).
 */
const DEFAULT_CLAUDE_REPLIES: Record<string, ClaudeReply | ((req: ClaudeRequest) => ClaudeReply)> = {
  // Ticket 12: the app keeps only Catalog Topics the Reader may follow.
  "topic-suggestions": {
    text: JSON.stringify({
      suggestions: [
        { topic: "liverpool", reason: "You follow the football.", reason_ar: "أنت تتابع كرة القدم." },
        { topic: "ai", reason: "You work with technology.", reason_ar: "أنت تعمل في التقنية." },
      ],
    }),
  },
  // Ticket 13: picks the Edition's own top stories the prompt lists, else the Reader's first Item.
  "top-picks": (req) => {
    const prompt = req.messages.map((m) => m.content).join("\n");
    const editors = /^The Edition's own top stories, for everyone: (.+)$/m.exec(prompt)?.[1]?.split(", ") ?? [];
    const first = /^- id: (\S+)$/m.exec(prompt)?.[1];
    const ids = editors.length ? editors : first ? [first] : [];
    return {
      text: JSON.stringify({
        top_stories: ids.map((item) => ({
          item,
          why: "One of today's biggest stories in your Topics.",
          why_ar: "من أهم أخبار اليوم في مواضيعك.",
        })),
      }),
    };
  },
};

export interface FakeOptions {
  /**
   * Also append every email as one JSON line to this file (FAKE_OUTBOX_FILE),
   * so you can read what a local demo sent.
   */
  outboxFile?: string;
}

/** The cities the fake geocoder knows from the start. */
const FAKE_PLACES: Place[] = [
  { city: "Riyadh", country: "Saudi Arabia", latitude: 24.6877, longitude: 46.7219, timezone: "Asia/Riyadh" },
  { city: "Jeddah", country: "Saudi Arabia", latitude: 21.5169, longitude: 39.2192, timezone: "Asia/Riyadh" },
  { city: "London", country: "United Kingdom", latitude: 51.5085, longitude: -0.1257, timezone: "Europe/London" },
  { city: "Liverpool", country: "United Kingdom", latitude: 53.4106, longitude: -2.9779, timezone: "Europe/London" },
  { city: "Sanaa", country: "Yemen", latitude: 15.3547, longitude: 44.2067, timezone: "Asia/Aden" },
  { city: "New York", country: "United States", latitude: 40.7143, longitude: -74.006, timezone: "America/New_York" },
];

/** The fake push service's VAPID public key (no private key exists for it). */
export const FAKE_VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

export function fakeOutsideServices(options: FakeOptions = {}): FakeOutsideServices {
  const claudeCalls: ClaudeRequest[] = [];
  const replies: FakeOutsideServices["claude"]["replies"] = new Map();
  const failing = new Set<string>();
  const outbox: EmailMessage[] = [];
  const weatherCalls: Place[] = [];
  const prayerCalls: { place: Place; date: string }[] = [];
  const sent: FakeOutsideServices["push"]["sent"] = [];
  const gone = new Set<string>();
  const failingPush = new Set<string>();
  const feeds = new Map<string, RedditPost[]>();
  const feedCalls: string[] = [];
  const failingFeeds = new Set<string>();

  const placeCalls: string[] = [];
  const places = new Map<string, Place>(
    FAKE_PLACES.map((p) => [p.city.toLowerCase(), p]),
  );

  const weather: FakeOutsideServices["weather"] = {
    calls: weatherCalls,
    reply: { temperatureC: 24, highC: 29, lowC: 18, weatherCode: 0 },
    placeCalls,
    places,
    failing: false,
    async today(place) {
      weatherCalls.push(place);
      if (weather.failing) throw new Error("Fake Open-Meteo failure");
      return { ...weather.reply };
    },
    async findPlace(city) {
      placeCalls.push(city);
      const found = places.get(city.trim().toLowerCase());
      return found ? { ...found } : null;
    },
  };
  const prayerTimes: FakeOutsideServices["prayerTimes"] = {
    calls: prayerCalls,
    reply: { fajr: "04:55", sunrise: "06:13", dhuhr: "11:43", asr: "14:47", maghrib: "17:13", isha: "18:43" },
    failing: false,
    async forDay(place, date) {
      prayerCalls.push({ place, date });
      if (prayerTimes.failing) throw new Error("Fake Aladhan failure");
      return { date, ...prayerTimes.reply };
    },
  };

  return {
    claude: {
      calls: claudeCalls,
      replies,
      failing,
      async complete(req) {
        claudeCalls.push(req);
        if (failing.has(req.purpose)) throw new Error(`Fake Claude failure for "${req.purpose}"`);
        const canned = replies.get(req.purpose) ?? DEFAULT_CLAUDE_REPLIES[req.purpose];
        if (typeof canned === "function") return canned(req);
        return canned ?? { text: `Fake Claude reply (${req.purpose})` };
      },
    },
    email: {
      outbox,
      async send(message) {
        outbox.push(message);
        if (options.outboxFile) {
          // turbopackIgnore: a local test file chosen at run time, not something to bundle.
          const file = path.resolve(/*turbopackIgnore: true*/ options.outboxFile);
          mkdirSync(path.dirname(/*turbopackIgnore: true*/ file), { recursive: true });
          appendFileSync(/*turbopackIgnore: true*/ file, JSON.stringify(message) + "\n");
        }
      },
    },
    weather,
    prayerTimes,
    push: {
      // A real P-256 public key, so a browser could subscribe with it; nothing ever reaches a push service.
      publicKey: FAKE_VAPID_PUBLIC_KEY,
      sent,
      gone,
      failing: failingPush,
      async send(subscription, message) {
        if (failingPush.has(subscription.endpoint)) throw new Error("Fake push service failure");
        if (gone.has(subscription.endpoint)) return "gone";
        sent.push({ subscription, message });
        return "sent";
      },
    },
    reddit: {
      feeds,
      calls: feedCalls,
      failing: failingFeeds,
      async feed(url) {
        feedCalls.push(url);
        if (failingFeeds.has(url)) throw new Error("Fake Reddit refused the feed (429)");
        return (feeds.get(url) ?? []).map((post) => ({ ...post }));
      },
    },
  };
}
