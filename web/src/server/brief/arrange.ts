// Arranging the Brief (rework ticket 11, spec #6): the Reader's Display decides
// where the groups sit and how they look, on top of the ranking, never instead
// of it. No server imports: the composer arranges the Brief it sends, and the
// browser arranges it again straight away when the Reader changes their
// Display (Edit mode, Me › Display), before the change is even saved.
//
//   arrangeBrief(brief, display)  ->  the same Brief, groups and Items in Display order
//
// The order: the top stories, then Pinned Topics (in `pinned` order), then
// `topic_order`, then the remaining Topics by `rank` (the ranked order: groups
// by their best Item, then the followed Topics with nothing in this Edition).
// Topics the Reader does not have a group for are skipped. Nothing here
// touches the top stories or the order of the Items inside a group.
//
// A Sensitive Item never comes first: when there are no top stories and the
// arrangement would open on a group led by a Sensitive Item, the first group
// led by one that is not moves in front of it. (The composer makes sure there
// is such a group whenever the Brief holds any non-Sensitive Item.)
import type { Display } from "../display/shape";
import type { Brief, BriefCover, BriefGroup, BriefItem, BriefWidget } from "./compose";

export type Arrangement = Pick<Display, "pinned" | "topic_order" | "collapsed">;

/** `brief` with its groups in Display order, `pinned` and `collapsed` set, and its Items in that order. */
export function arrangeBrief(brief: Brief, display: Arrangement): Brief {
  const byId = new Map(brief.items.map((i) => [i.id, i]));
  const groups = arrangeGroups(brief.groups, display, (id) => byId.get(id));
  const items = groups.flatMap((g) => g.item_ids.flatMap((id) => byId.get(id) ?? []));
  return { ...brief, groups, items };
}

export function arrangeGroups(
  groups: readonly BriefGroup[],
  display: Arrangement,
  item: (id: string) => Pick<BriefItem, "sensitive"> | undefined,
): BriefGroup[] {
  const tops = groups.filter((g) => g.kind === "top");
  const byTopic = new Map(groups.filter((g) => g.kind === "topic").map((g) => [g.topic!, g]));
  const pinned = new Set(display.pinned);
  const collapsed = new Set(display.collapsed);

  const order: string[] = [];
  const place = (topic: string) => {
    if (byTopic.has(topic) && !order.includes(topic)) order.push(topic);
  };
  display.pinned.forEach(place);
  display.topic_order.forEach(place);
  [...byTopic.values()].sort((a, b) => a.rank - b.rank).forEach((g) => place(g.topic!));

  const topicGroups = order.map((topic) => ({
    ...byTopic.get(topic)!,
    pinned: pinned.has(topic),
    collapsed: collapsed.has(topic),
  }));
  return placeSensitive([...tops.map((g) => ({ ...g, pinned: false, collapsed: false })), ...topicGroups], item);
}

/**
 * `groups` with no Sensitive Item first: when the first group with Items is led by one (there are no top
 * stories, which never are), the first group led by a non-Sensitive Item moves in front of it. Run again
 * whenever groups change in the browser (hiding an Item can empty the group that led).
 */
export function placeSensitive(groups: readonly BriefGroup[], item: (id: string) => Pick<BriefItem, "sensitive"> | undefined): BriefGroup[] {
  const placed = [...groups];
  const leadSensitive = (g: BriefGroup) => item(g.item_ids[0]!)?.sensitive === true;
  const first = placed.findIndex((g) => g.item_ids.length > 0);
  if (first >= 0 && leadSensitive(placed[first]!)) {
    const lead = placed.findIndex((g, i) => i > first && g.item_ids.length > 0 && !leadSensitive(g));
    if (lead > 0) placed.splice(first, 0, ...placed.splice(lead, 1));
  }
  return placed;
}

/**
 * The Cover's Widgets in Display order (`keys`, a Widget kind each; several countdowns share one), and the
 * eligible ones the Reader removed, which Edit mode offers to add back.
 */
export function arrangeWidgets(
  eligible: readonly BriefWidget[],
  keys: readonly string[],
): Pick<BriefCover, "widgets" | "more_widgets"> {
  return {
    widgets: keys.flatMap((key) => eligible.filter((w) => w.kind === key)),
    more_widgets: eligible.filter((w) => !keys.includes(w.kind)),
  };
}
