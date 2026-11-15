// The outside-services boundary: the ONLY way app code reaches the outside
// world. Claude, Resend (email), Open-Meteo (weather), Aladhan (prayer times)
// and Web Push each sit behind one member of OutsideServices. Modules get the
// services from the app context (getAppContext().services), never by calling
// fetch or an SDK directly, so tests can swap in the fakes from ./fakes.ts.
//
// The method shapes here are the starting contract. The ticket that first uses
// a service owns its real adapter and may extend its interface additively
// (add methods or optional fields; do not rename), updating the fake with it.

import { aladhanPrayerTimesService } from "./aladhan";
import { claudeService } from "./claude";
import { openMeteoWeatherService } from "./open-meteo";
import { resendEmailService } from "./resend";
import { webPushService } from "./web-push";

// --- Claude --------------------------------------------------------------------

export interface ClaudeRequest {
  /** What the call is for, e.g. "top-picks", "ask", "gathering-rules". Fakes key canned replies on it. */
  purpose: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** Let Claude search the web (Ask). */
  webSearch?: boolean;
  maxTokens?: number;
}

export interface ClaudeReply {
  text: string;
  /** Links Claude cited, when web search or sources were used. */
  citations?: { title?: string; url: string }[];
}

export interface ClaudeService {
  complete(request: ClaudeRequest): Promise<ClaudeReply>;
}

// --- Email (Resend) ----------------------------------------------------------

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

// --- Weather (Open-Meteo) and prayer times (Aladhan) ---------------------------

export interface Place {
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  /** IANA time zone, e.g. Asia/Riyadh. */
  timezone?: string;
}

export interface WeatherToday {
  temperatureC: number;
  highC: number;
  lowC: number;
  /** WMO weather code, as Open-Meteo returns it. */
  weatherCode: number;
}

export interface WeatherService {
  /** Today's weather at a place found with findPlace (needs its latitude and longitude). */
  today(place: Place): Promise<WeatherToday>;
  /**
   * Look up a city as a Reader wrote it (Open-Meteo geocoding): where it is and
   * its time zone. Null when no such place is known.
   */
  findPlace(city: string): Promise<Place | null>;
}

/** Local times as "HH:MM", Umm al-Qura method. */
export interface PrayerTimes {
  date: string; // YYYY-MM-DD
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface PrayerTimesService {
  /** Prayer times on `date` (YYYY-MM-DD) at a place: by its coordinates when known, else by its city name. */
  forDay(place: Place, date: string): Promise<PrayerTimes>;
}

// --- Web Push ------------------------------------------------------------------

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path inside the app to open on tap. */
  url?: string;
  /** A newer push with the same tag replaces the older one on the device. */
  tag?: string;
  /** Text direction of title and body ("rtl" for Arabic). */
  dir?: "ltr" | "rtl";
  /** BCP 47 language of title and body. */
  lang?: string;
}

export interface PushService {
  /** The VAPID public key (base64url) browsers subscribe with; null when push is not connected. */
  publicKey: string | null;
  /** Returns "gone" when the subscription has expired and should be deleted. */
  send(subscription: PushSubscription, message: PushMessage): Promise<"sent" | "gone">;
}

// --- The boundary ----------------------------------------------------------------

export interface OutsideServices {
  claude: ClaudeService;
  email: EmailService;
  weather: WeatherService;
  prayerTimes: PrayerTimesService;
  push: PushService;
}

export class OutsideServiceNotConnected extends Error {
  constructor(service: string) {
    super(`The ${service} adapter is not connected yet. Its ticket adds the real adapter in src/server/outside/.`);
    this.name = "OutsideServiceNotConnected";
  }
}

function notConnected(service: string): () => Promise<never> {
  return async () => {
    throw new OutsideServiceNotConnected(service);
  };
}

/**
 * The real adapters. Each reads its own secrets from the environment when it
 * is connected. Until a ticket connects one, calling it throws.
 */
export function realOutsideServices(env: Record<string, string | undefined> = process.env): OutsideServices {
  return {
    // Claude (ticket 16): ANTHROPIC_API_KEY.
    claude: env.ANTHROPIC_API_KEY ? claudeService({ apiKey: env.ANTHROPIC_API_KEY }) : { complete: notConnected("Claude") },
    // Resend (ticket 06): RESEND_API_KEY + EMAIL_FROM.
    email:
      env.RESEND_API_KEY && env.EMAIL_FROM
        ? resendEmailService({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
        : { send: notConnected("Resend") },
    // Open-Meteo and Aladhan (ticket 17): free, no key.
    weather: openMeteoWeatherService(),
    prayerTimes: aladhanPrayerTimesService(),
    // Web Push (ticket 18): VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT.
    push:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
        ? webPushService({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT })
        : { publicKey: null, send: notConnected("Web Push") },
  };
}
