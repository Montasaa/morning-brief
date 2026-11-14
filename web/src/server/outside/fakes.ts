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
  weather: OutsideServices["weather"] & { calls: Place[]; reply: WeatherToday };
  prayerTimes: OutsideServices["prayerTimes"] & { calls: { place: Place; date: string }[]; reply: Omit<PrayerTimes, "date"> };
  push: OutsideServices["push"] & {
    sent: { subscription: PushSubscription; message: PushMessage }[];
    /** Endpoints the fake reports as expired. */
    gone: Set<string>;
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
   * so browser tests can open the magic links the e2e server sent.
   */
  outboxFile?: string;
}

export function fakeOutsideServices(options: FakeOptions = {}): FakeOutsideServices {
  const claudeCalls: ClaudeRequest[] = [];
  const replies: FakeOutsideServices["claude"]["replies"] = new Map();
  const failing = new Set<string>();
  const outbox: EmailMessage[] = [];
  const weatherCalls: Place[] = [];
  const prayerCalls: { place: Place; date: string }[] = [];
  const sent: FakeOutsideServices["push"]["sent"] = [];
  const gone = new Set<string>();

  const weather: FakeOutsideServices["weather"] = {
    calls: weatherCalls,
    reply: { temperatureC: 24, highC: 29, lowC: 18, weatherCode: 0 },
    async today(place) {
      weatherCalls.push(place);
      return { ...weather.reply };
    },
  };
  const prayerTimes: FakeOutsideServices["prayerTimes"] = {
    calls: prayerCalls,
    reply: { fajr: "04:55", sunrise: "06:13", dhuhr: "11:43", asr: "14:47", maghrib: "17:13", isha: "18:43" },
    async forDay(place, date) {
      prayerCalls.push({ place, date });
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
      sent,
      gone,
      async send(subscription, message) {
        if (gone.has(subscription.endpoint)) return "gone";
        sent.push({ subscription, message });
        return "sent";
      },
    },
  };
}
