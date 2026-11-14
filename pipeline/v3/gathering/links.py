"""Check that every link and image of an Edition loads, and leave out what does not.

- A source that does not load is removed. An Item with no source left is left out.
- An Item whose picture does not load is left out (house rule: a real image).
- A broken try_url, store_url or voice is removed from its Item.

A site that refuses scripted requests (HTTP 401, 403 or 429) is not counted as broken:
it is reported as unverified, for the agent to open by hand before posting.
"""
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

USER_AGENT = "Mozilla/5.0 (compatible; morning-brief-link-check/3)"
UNVERIFIABLE = {401, 403, 429}


def url_status(url: str, timeout: float = 15) -> int | str:
    """The HTTP status the URL answers with (HEAD, then GET if HEAD is refused), or why it failed."""
    if not url.startswith(("http://", "https://")):
        return "not an http(s) link"
    last: int | str = "no answer"
    for method in ("HEAD", "GET"):
        headers = {"User-Agent": USER_AGENT}
        if method == "GET":
            headers["Range"] = "bytes=0-0"
        request = urllib.request.Request(url, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status
        except urllib.error.HTTPError as error:
            last = error.code
            if error.code not in (403, 405, 501):
                return last
        except (urllib.error.URLError, OSError, ValueError) as error:
            last = str(getattr(error, "reason", error))
            return last
    return last


def _loads(status: int | str) -> bool:
    return isinstance(status, int) and (status < 400 or status in UNVERIFIABLE)


def check_links(items: list[dict], status_of=url_status, workers: int = 8) -> tuple[list[dict], list[str]]:
    """The Items with broken links removed, and notes on everything removed or unverified."""
    urls: set[str] = set()
    for item in items:
        urls.update(s["url"] for s in item.get("sources", []))
        urls.update(v["url"] for v in item.get("voices", []) if "url" in v)
        urls.update(item[f] for f in ("image", "try_url", "store_url") if f in item)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        statuses = dict(zip(sorted(urls), pool.map(status_of, sorted(urls))))

    notes = [f"unverified (HTTP {s}): {u} - open it by hand" for u, s in sorted(statuses.items()) if s in UNVERIFIABLE]
    kept = []
    for original in items:
        item = dict(original)
        name = item["id"]
        if "image" in item and not _loads(statuses[item["image"]]):
            notes.append(f"left out {name}: its image does not load ({statuses[item['image']]}): {item['image']}")
            continue
        sources = []
        for source in item.get("sources", []):
            if _loads(statuses[source["url"]]):
                sources.append(source)
            else:
                notes.append(f"{name}: removed a source that does not load ({statuses[source['url']]}): {source['url']}")
        if not sources:
            notes.append(f"left out {name}: none of its sources loads")
            continue
        item["sources"] = sources
        for field in ("try_url", "store_url"):
            if field in item and not _loads(statuses[item[field]]):
                notes.append(f"{name}: removed {field}, it does not load ({statuses[item[field]]}): {item[field]}")
                del item[field]
        if "voices" in item:
            voices = [v for v in item["voices"] if "url" not in v or _loads(statuses[v["url"]])]
            if len(voices) != len(item["voices"]):
                notes.append(f"{name}: removed {len(item['voices']) - len(voices)} voice(s) whose link does not load")
            item["voices"] = voices
        kept.append(item)
    return kept, notes
