"""Assemble one Edition v3 document from the agent's gathered drafts.

Inputs: the gathering list (which Topics to cover), one or more drafts files the agent
wrote while gathering, and the state of earlier runs. The result is a complete Edition.

A drafts file:

    {
      "items":   [ Item, ... ],            # Edition v3 Items; "status" is set here, not by the agent
      "threads": [ {id, title, title_ar} ],
      "widgets": { "next_match": {...}, "countdowns": [...] },
      "top_stories":   [ item id, ... ],   # optional fallback lead stories
      "nothing_found": { topic id: "why nothing qualified" },
      "drop":          [ item id, ... ],   # evening: earlier Items that are no longer current
      "carry_over":    [ item id, ... ]    # morning: earlier Items that are still current
    }
"""
import json
from datetime import datetime, timedelta, timezone

from .errors import RunError

RIYADH = timezone(timedelta(hours=3))  # Asia/Riyadh: UTC+3 all year, no daylight saving

# The next-match Widget belongs to this Topic (the app shows it to its followers only).
NEXT_MATCH_TOPIC = "liverpool"


def riyadh_now() -> str:
    return datetime.now(RIYADH).replace(microsecond=0).isoformat()


def default_kind(generated_at: str) -> str:
    """06:00 is the morning run, 19:15 the evening refresh."""
    hour = datetime.fromisoformat(generated_at).astimezone(RIYADH).hour
    return "morning" if hour < 12 else "evening"


def edition_id(generated_at: str, kind: str) -> str:
    day = datetime.fromisoformat(generated_at).astimezone(RIYADH).date().isoformat()
    return f"{day}-{kind}"


# What makes an Item "updated" when it comes back: the same event, changed facts.
MATERIAL_FIELDS = ("title", "title_ar", "summary", "summary_ar", "sources", "image", "warning", "warning_ar", "time")


def assemble(
    *,
    gathering_list: dict,
    drafts: list[dict],
    kind: str,
    generated_at: str,
    previous: dict | None = None,
    known_items: dict[str, dict] | None = None,
    known_threads: dict[str, dict] | None = None,
    link_check=None,
) -> tuple[dict, list[str]]:
    """The Edition, and notes on what the assembler changed or left out (for the run log).

    previous: the last Edition the app accepted (carry-over comes from it).
    known_items / known_threads: every Item and Story Thread published so far, by id.
    link_check: checks the Items' links (gathering.links.check_links), or None to skip.
    """
    notes: list[str] = []
    known_items = known_items or {}
    known_threads = known_threads or {}
    gathered_topics = {t["id"] for t in gathering_list["topics"]}

    gathered = _gathered_items(drafts, notes)
    threads, alias = _threads(drafts, known_threads, notes)

    # Story Threads: stable ids, and a new development is a new Item.
    for item in gathered:
        if "thread_id" in item and item["thread_id"] in alias:
            notes.append(f"{item['id']}: Story Thread {item['thread_id']} is {alias[item['thread_id']]}, kept its id")
            item["thread_id"] = alias[item["thread_id"]]
        earlier = known_items.get(item["id"])
        if earlier and earlier.get("thread_id"):
            if "thread_id" not in item:
                item["thread_id"] = earlier["thread_id"]
            elif item["thread_id"] != earlier["thread_id"]:
                raise RunError(
                    f"{item['id']} was published on Story Thread {earlier['thread_id']} and is now on "
                    f"{item['thread_id']}. A new development is a new Item: give it a new id."
                )
        item["status"] = _status(item, earlier)

    # Each Edition is complete: bring forward earlier Items that are still current.
    regathered = {item["id"] for item in gathered}
    carried = []
    for earlier in _still_current(drafts, kind, previous, known_items, notes):
        if earlier["id"] not in regathered:
            carried.append(dict(earlier, status=""))

    items = []
    for item in gathered + carried:
        topics = [t for t in item.get("topics", []) if t in gathered_topics]
        stripped = [t for t in item.get("topics", []) if t not in gathered_topics]
        if not topics:
            notes.append(f"left out {item.get('id')}: none of its Topics ({', '.join(stripped)}) is on the gathering list")
            continue
        if stripped:
            notes.append(f"{item['id']}: removed Topics not on the gathering list ({', '.join(stripped)})")
        item["topics"] = topics
        items.append(item)

    # Every link and picture is checked before coverage, so a Topic is not covered by a dead Item.
    if link_check is not None:
        items, link_notes = link_check(items)
        notes.extend(link_notes)

    # Every Thread an Item links to is listed, under its stable id; unused ones are not.
    used = {item["thread_id"] for item in items if "thread_id" in item}
    for thread_id in sorted(used - set(threads)):
        if thread_id in known_threads:
            threads[thread_id] = dict(known_threads[thread_id])
        else:
            raise RunError(f"Story Thread {thread_id} is used by an Item but not described in the drafts' threads.")
    thread_list = [t for tid, t in threads.items() if tid in used]

    widgets = _widgets(drafts, gathered_topics, notes)
    _check_coverage(gathering_list, drafts, items, notes)

    edition = {
        "edition_id": edition_id(generated_at, kind),
        "kind": kind,
        "generated_at": generated_at,
        "items": items,
        "threads": thread_list,
        "widgets": widgets,
    }
    top = _top_stories(drafts, items, notes)
    if top:
        edition["top_stories"] = top
    return edition, notes


def _gathered_items(drafts: list[dict], notes: list[str]) -> list[dict]:
    """Every drafted Item once. The same id in two drafts is one Item with both sets of Topics."""
    by_id: dict[str, dict] = {}
    for d in drafts:
        for draft in d.get("items", []):
            if not isinstance(draft, dict) or not isinstance(draft.get("id"), str) or not draft["id"]:
                raise RunError(f"A drafted Item has no id: {json.dumps(draft, ensure_ascii=False)[:200]}")
            item = {k: v for k, v in draft.items() if k != "status"}
            item["sources"] = _independent_first(item.get("sources", []))
            same = by_id.get(item.get("id"))
            if same is not None:
                topics = same.get("topics", []) + [t for t in item.get("topics", []) if t not in same.get("topics", [])]
                item["topics"] = topics
                notes.append(f"{item['id']}: drafted twice, merged (Topics {', '.join(topics)})")
            by_id[item.get("id")] = item
    return list(by_id.values())


def _normal(title: str) -> str:
    return " ".join("".join(c if c.isalnum() else " " for c in title.lower()).split())


def _threads(drafts: list[dict], known: dict[str, dict], notes: list[str]) -> tuple[dict[str, dict], dict[str, str]]:
    """The drafted Story Threads by id, and drafted ids that are really a known Thread's (same title)."""
    by_title = {_normal(t["title"]): tid for tid, t in known.items()}
    threads: dict[str, dict] = {}
    alias: dict[str, str] = {}
    for d in drafts:
        for draft in d.get("threads", []):
            thread = dict(draft)
            if thread["id"] not in known and _normal(thread.get("title", "")) in by_title:
                stable = by_title[_normal(thread["title"])]
                alias[thread["id"]] = stable
                notes.append(f"Story Thread {thread['id']} has the title of {stable}: kept {stable}")
                thread["id"] = stable
            threads[thread["id"]] = thread
    return threads, alias


def _status(item: dict, earlier: dict | None) -> str:
    """new on first appearance, updated when the same event changed, empty otherwise."""
    if earlier is None:
        return "new"
    changed = any(item.get(f) != earlier.get(f) for f in MATERIAL_FIELDS)
    return "updated" if changed else ""


def _still_current(drafts, kind, previous, known_items, notes) -> list[dict]:
    """Earlier Items to carry into this Edition.

    Evening: every Item of the previous Edition, except those the drafts "drop".
    Morning (a full run): only those the drafts name in "carry_over".
    """
    drop = {i for d in drafts for i in d.get("drop", [])}
    carry = [i for d in drafts for i in d.get("carry_over", [])]
    if kind == "evening":
        if previous is None:
            notes.append("no previous Edition in the state folder: nothing carried over")
            return []
        for item_id in drop:
            notes.append(f"dropped {item_id}: no longer current")
        return [item for item in previous["items"] if item["id"] not in drop]
    found = []
    for item_id in carry:
        if item_id not in known_items:
            raise RunError(f'carry_over names {item_id}, which no earlier Edition carried.')
        found.append(known_items[item_id])
    return found


SOURCE_ORDER = {"independent": 0, "wire": 0}


def _independent_first(sources: list[dict]) -> list[dict]:
    """Independent outlets (and wires) lead; official and state sources only follow them."""
    return sorted(sources, key=lambda s: SOURCE_ORDER.get(s.get("type"), 1))


def _check_coverage(gathering_list: dict, drafts: list[dict], items: list[dict], notes: list[str]) -> None:
    """Every Topic on the gathering list is covered: by an Item, or by saying nothing qualified."""
    nothing_found: dict[str, str] = {}
    for d in drafts:
        nothing_found.update(d.get("nothing_found", {}))
    covered = {t for item in items for t in item["topics"]}
    missing = [t for t in gathering_list["topics"] if t["id"] not in covered and t["id"] not in nothing_found]
    if missing:
        names = ", ".join(f"{t['id']} ({t['name']})" for t in missing)
        raise RunError(
            f"These Topics on the gathering list have no Items: {names}. Gather them, or say why "
            'nothing qualified in the drafts\' "nothing_found".'
        )
    for topic in gathering_list["topics"]:
        if topic["id"] not in covered:
            notes.append(f"{topic['id']}: nothing found ({nothing_found[topic['id']]})")


def _top_stories(drafts: list[dict], items: list[dict], notes: list[str]) -> list[str]:
    ids = {item["id"] for item in items}
    top: list[str] = []
    for d in drafts:
        for ref in d.get("top_stories", []):
            if ref in top:
                continue
            if ref not in ids:
                notes.append(f"top story {ref} is not in this Edition: left out")
                continue
            top.append(ref)
    return top[:3]


def _widgets(drafts: list[dict], gathered: set[str], notes: list[str]) -> dict:
    next_match = None
    countdowns: list[dict] = []
    for d in drafts:
        w = d.get("widgets", {})
        next_match = w.get("next_match", next_match)
        countdowns.extend(w.get("countdowns", []))
    widgets: dict = {}
    if next_match is not None:
        if NEXT_MATCH_TOPIC in gathered:
            widgets["next_match"] = next_match
        else:
            notes.append(f"left out the next match: nobody follows {NEXT_MATCH_TOPIC}")
    kept = []
    for c in countdowns:
        if c.get("topic") in gathered:
            kept.append(c)
        else:
            notes.append(f"left out the countdown {c.get('label')!r}: nobody follows {c.get('topic')}")
    if kept:
        widgets["countdowns"] = kept
    return widgets
