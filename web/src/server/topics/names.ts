// Display names for Topic ids, until the Catalog (tickets 02 and 07) holds
// them. The 14 starting Topics have their agreed names; any other id is
// title-cased from its slug ("formula-1" -> "Formula 1").
const STARTING_TOPIC_NAMES: Record<string, string> = {
  saudi: "Saudi",
  yemen: "Yemen",
  iran: "Iran",
  "wider-middle-east": "Wider Middle East",
  "us-markets": "US Markets",
  ai: "AI",
  "github-trending": "GitHub Trending",
  liverpool: "Liverpool",
  "strategy-games": "Strategy Games",
  "turn-based-rpg-tactics": "Turn-based RPG & Tactics",
  "trending-games": "Trending Games",
  "social-trends": "Social Trends",
  graphic: "Graphic",
  "adult-trending": "Adult Trending",
};

export function topicName(id: string): string {
  return (
    STARTING_TOPIC_NAMES[id] ??
    id
      .split(/[-.]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" ")
  );
}
