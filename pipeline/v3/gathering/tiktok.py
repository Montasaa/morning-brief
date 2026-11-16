"""Saudi TikTok trends (scripts/tiktok_trends.py) as Social Trends Items.

The scrape writes scripts/tiktok_trends.json for both pipelines; the v2 one merges it with
scripts/merge_tiktok.py, this one turns it into a drafts file for the Edition. Item ids are
the same as v2's (tt-<kind>-<slug>), so a hashtag keeps its id across runs.
"""
import hashlib
import re

SOCIAL_TRENDS = "social-trends"
CREATIVE_CENTER = "https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?region=SA&period=7"
TOP = 10


def _arabic_metric(metric: str) -> str:
    return metric.replace(" posts", " منشور").replace(" views", " مشاهدة")


def tiktok_drafts(trends: dict, known_items: dict[str, dict] | None = None) -> tuple[dict, list[str]]:
    """A drafts file of Social Trends Items, and notes on what was left out."""
    known_items = known_items or {}
    notes: list[str] = []
    if any(str(n).startswith("WARNING: region") for n in trends.get("notes", [])):
        notes.append("TikTok trends left out: the scrape did not switch to Saudi Arabia")
        return {"items": []}, notes

    items = []
    for trend in trends.get("items", [])[:TOP]:
        name = str(trend.get("name") or "").strip()
        if not name or not trend.get("url"):
            notes.append(f"TikTok trend {name or '(unnamed)'} left out: no link")
            continue
        if not trend.get("image"):
            notes.append(f"TikTok trend {name} left out: no image")
            continue
        tag = name.lstrip("#")
        slug = re.sub(r"[^a-z0-9]+", "-", tag.lower()).strip("-") or hashlib.md5(tag.encode()).hexdigest()[:8]
        item_id = f"tt-{trend['kind']}-{slug}"
        metric = str(trend.get("metric") or "").strip()
        rank = trend.get("rank")
        item = {
            "id": item_id,
            "topics": [SOCIAL_TRENDS],
            # A trend that was already published keeps its first time, so it is not "updated" for nothing.
            "time": known_items.get(item_id, {}).get("time", trends["generated_at"]),
            "title": f"{name} is #{rank} on TikTok in Saudi Arabia this week",
            "title_ar": f"{name} في المرتبة {rank} على تيك توك في السعودية هذا الأسبوع",
            "summary": "TikTok Creative Center, Saudi Arabia, last 7 days" + (f": {metric}." if metric else "."),
            "summary_ar": "مركز تيك توك الإبداعي، السعودية، آخر 7 أيام" + (f": {_arabic_metric(metric)}." if metric else "."),
            "sources": [
                {"title": "TikTok", "url": trend["url"], "type": "social"},
                {"title": "TikTok Creative Center (SA, 7 days)", "url": CREATIVE_CENTER, "type": "social"},
            ],
            "image": trend["image"],
            "image_kind": "photo",  # a TikTok video thumbnail
            "platform": "tiktok",
            "creator": trend.get("creator") or "TikTok Creative Center",
        }
        if metric:
            item["metric"] = metric
        items.append(item)
    return {"items": items}, notes
