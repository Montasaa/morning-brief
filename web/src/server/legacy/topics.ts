// Legacy importer: which starting Topics a v2 Item belongs to, from its section.
//
// - middle_east: Saudi, Yemen, Iran and/or Wider Middle East, by keywords in
//   the English title and summary. Several are allowed, ordered by first
//   mention (headline first). No keyword at all means Wider Middle East.
// - games: Turn-based RPG & Tactics and/or Strategy Games by `genres`, in
//   genre order. A game matching neither is in Trending Games.
// - Every other section maps one-to-one, and graphic goes to Graphic.

/** Sections that map one-to-one onto a starting Topic. */
const ONE_TO_ONE: Record<string, string> = {
  us_markets: "us-markets",
  ai: "ai",
  trending: "github-trending",
  liverpool: "liverpool",
  social: "social-trends",
  graphic: "graphic",
  adult_trending: "adult-trending",
};

/**
 * Keywords per Middle East Topic, as regex fragments over lower-case English.
 * Each must stand as its own word (no letter directly before or after).
 */
const MIDDLE_EAST_KEYWORDS: [topic: string, keywords: string[]][] = [
  [
    "saudi",
    [
      "saudis?", "saudi arabia", "riyadh", "jeddah", "jiddah", "mecca", "makkah", "medina", "madinah",
      "aramco", "jazan", "jizan", "najran", "yanbu", "dammam", "khobar", "dhahran", "tabuk", "neom",
      "bin salman", "mbs", "two holy mosques",
    ],
  ],
  [
    "yemen",
    [
      "yemen", "yemeni?s?", "houthis?", "ansar allah", "sanaa", "sana'a", "aden", "hodeidah", "hudaydah",
      "taiz", "marib", "saree", "hadram(?:aw|ou)t", "bab (?:el|al)-mand[ae]b",
    ],
  ],
  [
    "iran",
    [
      "iran", "iranians?", "tehran", "irgc", "revolutionary guards?", "khamenei", "isfahan", "natanz",
      "fordow", "hormuz", "pezeshkian", "araghchi",
    ],
  ],
  [
    "wider-middle-east",
    [
      "israel", "israelis?", "gaza", "west bank", "hamas", "hezbollah", "netanyahu", "idf", "rafah",
      "palestin(?:e|ians?)", "lebanon", "lebanese", "beirut", "syrian?s?", "damascus", "iraq", "iraqis?",
      "baghdad", "qatar", "qataris?", "doha", "uae", "emirat(?:es|i|is)", "dubai", "abu dhabi", "fujairah",
      "sharjah", "bahrain", "bahrainis?", "kuwait", "kuwaitis?", "oman", "omanis?", "muscat", "jordan",
      "jordanians?", "amman", "egypt", "egyptians?", "cairo", "sinai", "t[uü]rkiye", "turkey", "turkish",
      "ankara", "istanbul", "erdogan", "gulf states", "gcc",
    ],
  ],
];

const MIDDLE_EAST_PATTERNS = MIDDLE_EAST_KEYWORDS.map(
  ([topic, words]) => [topic, new RegExp(`(?<![a-z])(?:${words.join("|")})(?![a-z])`)] as const,
);

function middleEastTopics(item: Record<string, unknown>): string[] {
  // Headline first, then summary: position in this text is the order of mention.
  const text = [item.title, item.summary]
    .filter((t): t is string => typeof t === "string")
    .join("\n")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'"); // curly apostrophes
  const found = MIDDLE_EAST_PATTERNS.map(([topic, pattern]) => ({ topic, at: text.search(pattern) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((m) => m.topic);
  return found.length ? found : ["wider-middle-east"];
}

/**
 * Game genres per Topic, checked in this order for each genre. A turn-based
 * RPG or any tactics game is Turn-based RPG & Tactics; any strategy genre
 * (including turn-based strategy, grand strategy, RTS and 4X) is Strategy Games.
 */
const GAME_GENRES: [topic: string, pattern: RegExp][] = [
  ["turn-based-rpg-tactics", /turn[- ]?based.*\b(rpg|role[- ]playing)\b|\btactic(s|al)\b/],
  ["strategy-games", /strateg|\brts\b|\b4x\b|wargame|tower defen[cs]e/],
];

function gameTopics(item: Record<string, unknown>): string[] {
  const genres = Array.isArray(item.genres) ? item.genres.filter((g): g is string => typeof g === "string") : [];
  const found = new Set<string>();
  for (const genre of genres) {
    for (const [topic, pattern] of GAME_GENRES) if (pattern.test(genre.toLowerCase())) found.add(topic);
  }
  return found.size ? [...found] : ["trending-games"];
}

/** The Item's Topic ids, primary first, or null for a section v2 never had. */
export function topicsForLegacyItem(section: string, item: Record<string, unknown>): string[] | null {
  if (section === "middle_east") return middleEastTopics(item);
  if (section === "games") return gameTopics(item);
  const topic = ONE_TO_ONE[section];
  return topic ? [topic] : null;
}
