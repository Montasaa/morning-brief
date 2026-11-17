// The real Reddit adapter (issue #19): reads one public subreddit RSS feed
// (https://www.reddit.com/r/<subreddit>/new/.rss, an Atom document) and returns
// its posts. No account and no key. Reddit refuses generic clients and limits
// how fast one client may ask, so every request names this app in its
// User-Agent and requests are spaced out (MIN_GAP_MS apart).
import type { RedditPost, RedditService } from "./index";

/** Reddit asks clients for a descriptive User-Agent; generic ones are refused. */
export const REDDIT_USER_AGENT = "morning-brief/3.0 (subreddit RSS reader for one private news brief)";
/** Unauthenticated feeds answer 429 when asked too quickly: wait this long between requests. */
const MIN_GAP_MS = 2500;

export interface RedditOptions {
  /** Injected for adapter tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Give up on one feed after this long (default 20 s). */
  timeoutMs?: number;
  /** Wait between requests (default 2.5 s). Tests pass 0. */
  minGapMs?: number;
}

export function redditFeedService(options: RedditOptions = {}): RedditService {
  let lastRequestAt = 0;
  const gap = options.minGapMs ?? MIN_GAP_MS;
  return {
    async feed(url) {
      const wait = lastRequestAt + gap - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      const doFetch = options.fetch ?? fetch;
      const res = await doFetch(url, {
        headers: { "user-agent": REDDIT_USER_AGENT, accept: "application/atom+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
      if (!res.ok) throw new Error(`Reddit refused the feed (${res.status})`);
      return parseRedditAtom(await res.text());
    },
  };
}

/** Hosts whose links are pictures or videos: a post linking to one has media. */
const MEDIA_HOSTS = /^(?:i\.redd\.it|v\.redd\.it|preview\.redd\.it|i\.imgur\.com|imgur\.com|(?:www\.)?redgifs\.com|i\.redgifs\.com|gfycat\.com)$/i;
const IMAGE_PATH = /\.(?:jpe?g|png|gif|webp)$/i;

/** The posts of a subreddit Atom feed, in feed order. Entries without an id, link, title or date are skipped. */
export function parseRedditAtom(xml: string): RedditPost[] {
  const posts: RedditPost[] = [];
  for (const [, entry = ""] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const rawId = textOf(entry, "id");
    const id = /^t3_([a-z0-9]+)$/i.exec(rawId ?? "")?.[1]?.toLowerCase();
    const title = textOf(entry, "title");
    const url = attrOf(entry, "link", "href");
    const published = textOf(entry, "published") ?? textOf(entry, "updated");
    if (!id || !title || !url || !published || Number.isNaN(Date.parse(published))) continue;

    const subreddit = attrOf(entry, "category", "term") ?? /\/r\/([^/]+)\//.exec(url)?.[1] ?? "";
    const author = /^\/?u\/(.+)$/.exec(textOf(entry, "name") ?? "")?.[1] ?? null;
    const html = textOf(entry, "content") ?? "";
    const thumbnail = attrOf(entry, "media:thumbnail", "url") ?? /<img\b[^>]*\bsrc="([^"]+)"/i.exec(html)?.[1];
    const linked = /<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*\[link\]\s*<\/a>/i.exec(html)?.[1];
    const linkedUrl = safeUrl(decodeEntities(linked ?? ""));
    const linkedImage = linkedUrl && IMAGE_PATH.test(linkedUrl.pathname) && MEDIA_HOSTS.test(linkedUrl.hostname) ? linkedUrl.href : null;
    const image = safeUrl(decodeEntities(thumbnail ?? ""))?.href ?? linkedImage;
    const media =
      !!image ||
      /<img\b/i.test(html) ||
      (!!linkedUrl && (MEDIA_HOSTS.test(linkedUrl.hostname) || /\/gallery\//.test(linkedUrl.pathname)));

    posts.push({
      id,
      subreddit,
      title: collapse(title),
      url,
      author,
      published: new Date(Date.parse(published)).toISOString(),
      text: selfText(html),
      image: image ?? null,
      media,
    });
  }
  return posts;
}

/** The self-post's text (the `md` block), as plain text; empty for a link post. */
function selfText(html: string): string {
  const md = /<div class="md">([\s\S]*?)<\/div>/i.exec(html)?.[1];
  if (!md) return "";
  return collapse(decodeEntities(md.replace(/<[^>]+>/g, " ")));
}

/** The decoded text of the first <tag>...</tag> (CDATA allowed), or null. */
function textOf(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!match) return null;
  const inner = match[1]!.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, "$1");
  return decodeEntities(inner).trim() || null;
}

/** The decoded value of `attr` on the first <tag ...>, or null. */
function attrOf(xml: string, tag: string, attr: string): string | null {
  const element = new RegExp(`<${tag}\\b([^>]*)>`).exec(xml)?.[1];
  const value = element && new RegExp(`\\b${attr}="([^"]*)"`).exec(element)?.[1];
  return value ? decodeEntities(value) : null;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) => {
    const c = code.toLowerCase();
    if (c === "amp") return "&";
    if (c === "lt") return "<";
    if (c === "gt") return ">";
    if (c === "quot") return '"';
    if (c === "apos") return "'";
    const n = c.startsWith("#x") ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
