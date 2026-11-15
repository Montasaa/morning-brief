"""Validation of an Edition v3 document before it is posted.

The same checks the app's ingest runs (schema/edition.v3.schema.json, draft 2020-12 with
format checks, then the cross-references the schema cannot express), so a run that passes
here is not rejected for its shape on the app.
"""
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from .errors import RunError

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schema" / "edition.v3.schema.json"

_DATE_TIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$"
)


def _is_date_time(value: object) -> bool:
    if not isinstance(value, str):
        return True  # the schema's "type" reports it
    if not _DATE_TIME.match(value):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00").replace("z", "+00:00"))
    except ValueError:
        return False
    return True


def _is_uri(value: object) -> bool:
    if not isinstance(value, str):
        return True
    if any(c.isspace() for c in value):
        return False
    parts = urlsplit(value)
    if not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*$", parts.scheme or ""):
        return False
    return bool(parts.netloc) if parts.scheme in ("http", "https") else bool(parts.path or parts.netloc)


def _validator():
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError:  # pragma: no cover - depends on the machine
        raise RunError("The Python package jsonschema (4.x) is needed: pip install jsonschema") from None
    checker = FormatChecker()
    # jsonschema only checks these formats when optional packages are installed; check them here always.
    checker.checks("date-time")(_is_date_time)
    checker.checks("uri")(_is_uri)
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return Draft202012Validator(schema, format_checker=checker)


def schema_problems(edition: dict) -> list[str]:
    """Every way the document breaks the v3 schema or its cross-references; empty when valid."""
    problems = []
    for error in sorted(_validator().iter_errors(edition), key=lambda e: list(e.absolute_path)):
        where = "/" + "/".join(str(p) for p in error.absolute_path)
        problems.append(f"{where}: {error.message}")
    if problems:
        return problems

    thread_ids: set[str] = set()
    for i, thread in enumerate(edition["threads"]):
        if thread["id"] in thread_ids:
            problems.append(f'/threads/{i}/id: duplicate Story Thread id "{thread["id"]}"')
        thread_ids.add(thread["id"])
    item_ids: set[str] = set()
    for i, item in enumerate(edition["items"]):
        if item["id"] in item_ids:
            problems.append(f'/items/{i}/id: duplicate Item id "{item["id"]}"')
        item_ids.add(item["id"])
        if "thread_id" in item and item["thread_id"] not in thread_ids:
            problems.append(f'/items/{i}/thread_id: Story Thread "{item["thread_id"]}" is not listed in threads')
    for i, ref in enumerate(edition.get("top_stories", [])):
        if ref not in item_ids:
            problems.append(f'/top_stories/{i}: Item "{ref}" is not in this Edition')
    return problems


# Fields every Item carries under the house rules: a real picture (unless graded image_kind none),
# English and Arabic text.
HOUSE_REQUIRED = ("image", "title_ar", "summary_ar")


def house_problems(edition: dict, gathering_list: dict | None = None) -> list[str]:
    """The house rules the schema leaves optional.

    Every Item has a picture (unless its image_kind is none: no usable picture) and Arabic
    text; an Item in a Sensitive Topic carries its content warning in both languages.
    Sensitive Topics come from the gathering list (Graphic and Adult Trending when there
    is none).
    """
    sensitive = {"graphic", "adult-trending"}
    if gathering_list is not None:
        sensitive |= {t["id"] for t in gathering_list.get("topics", []) if t.get("sensitive")}
    problems = []
    for i, item in enumerate(edition.get("items", [])):
        name = item.get("id", f"#{i}")
        for field in HOUSE_REQUIRED:
            if field == "image" and item.get("image_kind") == "none":
                continue
            if not item.get(field):
                problems.append(f"{name}: no {field} (house rule: a real image and English and Arabic text)")
        if sensitive & set(item.get("topics", [])):
            for field in ("warning", "warning_ar"):
                if not item.get(field):
                    problems.append(f"{name}: no {field} (an Item in a Sensitive Topic carries a content warning)")
    return problems


def headline_warnings(edition: dict) -> list[str]:
    """Headlines are written in sentence case: warn (without stopping the run) about an all-lowercase title."""
    warnings = []
    for item in edition.get("items", []):
        title = item.get("title", "")
        if any(c.isalpha() for c in title) and title == title.lower():
            warnings.append(f"{item.get('id')}: the title is all lowercase; write headlines in sentence case: {title!r}")
    return warnings
