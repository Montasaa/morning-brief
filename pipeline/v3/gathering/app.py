"""The two pipeline routes of the Morning Brief app: the gathering list and Edition ingest.

The bearer token comes only from the INGEST_TOKEN environment variable. There is no
command-line flag for it (it would show up in `ps` and shell history), and it never
appears in anything this module prints, raises or writes.
"""
import json
import os
import urllib.error
import urllib.request

from .errors import RunError

USER_AGENT = "morning-brief-gathering/3"


def ingest_token() -> str:
    token = os.environ.get("INGEST_TOKEN", "").strip()
    if not token:
        raise RunError("INGEST_TOKEN is not set. Export the app's ingest token before calling the app.")
    return token


def _scrub(text: str, token: str) -> str:
    return text.replace(token, "[INGEST_TOKEN]") if token else text


def _call(method: str, url: str, body: bytes | None = None) -> tuple[int, object]:
    token = ingest_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": USER_AGENT}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    except (urllib.error.URLError, OSError) as error:
        raise RunError(_scrub(f"Could not reach the app at {url}: {error}", token)) from None
    try:
        payload: object = json.loads(raw.decode("utf-8")) if raw else None
    except ValueError:
        payload = _scrub(raw.decode("utf-8", "replace")[:500], token)
    return status, payload


def _api(app_url: str, path: str) -> str:
    return app_url.rstrip("/") + path


def fetch_gathering_list(app_url: str) -> dict:
    """GET /api/gathering-list: every Topic with at least one follower, with its Gathering Rules."""
    status, payload = _call("GET", _api(app_url, "/api/gathering-list"))
    if status == 401:
        raise RunError("The app refused the ingest token (401) for the gathering list. Check INGEST_TOKEN.")
    if status != 200 or not isinstance(payload, dict) or not isinstance(payload.get("topics"), list):
        raise RunError(f"The gathering list could not be read (HTTP {status}).")
    return payload


def post_edition(app_url: str, edition: dict) -> dict:
    """POST /api/editions. Returns the app's ingest result; raises RunError unless accepted."""
    body = json.dumps(edition, ensure_ascii=False).encode("utf-8")
    status, payload = _call("POST", _api(app_url, "/api/editions"), body)
    if status == 401:
        raise RunError("The app refused the ingest token (401). Check INGEST_TOKEN. Nothing was stored.")
    if status == 200 and isinstance(payload, dict) and payload.get("accepted") is True:
        return payload
    reasons = payload.get("reasons") if isinstance(payload, dict) else None
    detail = "\n  ".join(str(r) for r in reasons) if isinstance(reasons, list) else str(payload)
    raise RunError(f"The app rejected the Edition (HTTP {status}). Nothing was stored.\n  {detail}")
