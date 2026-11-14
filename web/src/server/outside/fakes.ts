// Fakes for every outside service. API-seam tests get them from
// startTestApp(); the e2e server uses them when OUTSIDE_SERVICES=fake.
// They never touch the network and record what the app asked of them.
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

export function fakeOutsideServices(): FakeOutsideServices {
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
        const canned = replies.get(req.purpose);
        if (typeof canned === "function") return canned(req);
        return canned ?? { text: `Fake Claude reply (${req.purpose})` };
      },
    },
    email: {
      outbox,
      async send(message) {
        outbox.push(message);
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
