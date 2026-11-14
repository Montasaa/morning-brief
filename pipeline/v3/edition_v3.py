#!/usr/bin/env python3
"""Morning Brief Pipeline v3: build an Edition from gathered drafts and post it to the app.

The procedure is pipeline/PIPELINE-v3.md. Commands:

  gathering-list  fetch what to gather (GET /api/gathering-list) into a file
  context         what earlier runs published: the previous Edition's Items and every Story Thread
  run             one scheduled run: gathering list, assemble, check links, validate, post
  validate        check an Edition file against the v3 schema and the house rules
  post            post an Edition file to the app (POST /api/editions) and remember it
  dry-run         post a sample morning and evening Edition to a staging app

The ingest token comes only from the INGEST_TOKEN environment variable, never a flag,
and is never printed. Nothing here sends a summary message: push replaces it.
"""
import argparse
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from gathering import app  # noqa: E402
from gathering.assemble import RIYADH, assemble, default_kind, edition_id, riyadh_now  # noqa: E402
from gathering.errors import RunError  # noqa: E402
from gathering.links import check_links  # noqa: E402
from gathering.state import State  # noqa: E402
from gathering.tiktok import SOCIAL_TRENDS, tiktok_drafts  # noqa: E402
from gathering.validate import house_problems, schema_problems  # noqa: E402

SAMPLES = HERE / "samples"


def _read_json(path: str | Path) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise RunError(f"No such file: {path}") from None
    except ValueError as error:
        raise RunError(f"{path} is not valid JSON: {error}") from None


def _write_json(path: str | Path, data: dict) -> None:
    """Write to a .tmp file, then move it into place, so a reader never sees half a file."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target)


def _say(*lines: str) -> None:
    for line in lines:
        print(line, flush=True)


def _require_valid(edition: dict, gathering_list: dict | None = None) -> None:
    problems = schema_problems(edition)
    if problems:
        raise RunError("The Edition does not pass the v3 schema:\n  " + "\n  ".join(problems))
    problems = house_problems(edition, gathering_list)
    if problems:
        raise RunError("The Edition breaks the house rules:\n  " + "\n  ".join(problems))


def _build(
    *,
    gathering_list: dict,
    drafts: list[dict],
    kind: str,
    generated_at: str,
    state: State,
    tiktok: str | Path | None,
    link_check: bool,
) -> dict:
    """Assemble and validate one Edition. Raises RunError, and posts nothing, when it is not right."""
    this_id = edition_id(generated_at, kind)
    drafts = list(drafts)
    if tiktok:
        tiktok_draft, tiktok_notes = tiktok_drafts(_read_json(tiktok), state.items(this_id))
        _say(*(f"note: {n}" for n in tiktok_notes))
        drafts.append(tiktok_draft)
    edition, notes = assemble(
        gathering_list=gathering_list,
        drafts=drafts,
        kind=kind,
        generated_at=generated_at,
        previous=state.previous(this_id, generated_at),
        known_items=state.items(this_id),
        known_threads=state.threads(this_id),
        link_check=check_links if link_check else None,
    )
    _say(*(f"note: {n}" for n in notes))
    _require_valid(edition, gathering_list)
    return edition


def _post(app_url: str, edition: dict, state: State) -> None:
    result = app.post_edition(app_url, edition)
    state.record(edition)
    counts = result.get("counts", {})
    _say(
        f"accepted: {result.get('edition_id')} "
        f"({counts.get('items', 0)} Items, {counts.get('threads', 0)} Story Threads, {counts.get('topics', 0)} Topics)"
    )


# --- commands -----------------------------------------------------------------


def cmd_gathering_list(args) -> None:
    gathering_list = app.fetch_gathering_list(args.app_url)
    _write_json(args.out, gathering_list)
    _say(f"gathering list: {len(gathering_list['topics'])} Topics -> {args.out}")
    for topic in gathering_list["topics"]:
        flag = " (sensitive)" if topic.get("sensitive") else ""
        _say(f"  {topic['id']}: {topic['name']}{flag}, {topic.get('followers', 0)} follower(s)")


def cmd_context(args) -> None:
    state = State(args.state_dir)
    editions = state.editions()
    if not editions:
        _say(f"no earlier Editions in {args.state_dir}: every Item and Story Thread will be new")
        return
    previous = editions[-1]
    _say(f"previous Edition: {previous['edition_id']} ({previous['kind']}, {previous['generated_at']})")
    for item in previous["items"]:
        thread = f" [thread {item['thread_id']}]" if "thread_id" in item else ""
        _say(f"  {item['id']} ({', '.join(item['topics'])}){thread}: {item['title']}")
    threads = state.threads("")
    _say(f"Story Threads ({len(threads)}), reuse these ids:")
    for thread_id, thread in sorted(threads.items()):
        _say(f"  {thread_id}: {thread['title']} / {thread['title_ar']}")


def cmd_run(args) -> None:
    gathering_list = _read_json(args.gathering_list) if args.gathering_list else app.fetch_gathering_list(args.app_url)
    generated_at = args.generated_at or riyadh_now()
    kind = args.kind or default_kind(generated_at)
    state = State(args.state_dir)
    edition = _build(
        gathering_list=gathering_list,
        drafts=[_read_json(p) for p in args.drafts],
        kind=kind,
        generated_at=generated_at,
        state=state,
        tiktok=args.tiktok,
        link_check=not args.no_link_check,
    )
    _write_json(args.out, edition)
    _say(f"assembled: {edition['edition_id']} with {len(edition['items'])} Items -> {args.out}")
    if args.no_post:
        _say("not posted (--no-post)")
        return
    _post(args.app_url, edition, state)


def cmd_validate(args) -> None:
    edition = _read_json(args.edition)
    _require_valid(edition, _read_json(args.gathering_list) if args.gathering_list else None)
    _say(f"valid: {edition['edition_id']} ({len(edition['items'])} Items)")


def cmd_post(args) -> None:
    edition = _read_json(args.edition)
    _require_valid(edition)
    _post(args.app_url, edition, State(args.state_dir))


def cmd_dry_run(args) -> None:
    out_dir = Path(args.out_dir or tempfile.mkdtemp(prefix="morning-brief-dry-run-"))
    state = State(args.state_dir or out_dir / "state")
    gathering_list = app.fetch_gathering_list(args.app_url)
    if not gathering_list["topics"]:
        raise RunError("The staging app's gathering list is empty: sign in there and follow some Topics first.")
    morning, evening = _read_json(SAMPLES / "drafts.morning.json"), _read_json(SAMPLES / "drafts.evening.json")

    # The samples cover the starting Topics. Any other Topic on the staging app's list
    # (one a Reader created) is covered by saying the dry run has nothing for it.
    sampled = {SOCIAL_TRENDS}
    for drafts in (morning, evening):
        sampled |= {t for item in drafts["items"] for t in item["topics"]} | set(drafts.get("nothing_found", {}))
    others = {
        "nothing_found": {
            t["id"]: "dry run: no sample Items for this Topic" for t in gathering_list["topics"] if t["id"] not in sampled
        }
    }

    today = datetime.now(RIYADH).date().isoformat()
    for kind, drafts, at in (("morning", morning, "06:00"), ("evening", evening, "19:15")):
        edition = _build(
            gathering_list=gathering_list,
            drafts=[drafts, others],
            kind=kind,
            generated_at=f"{today}T{at}:00+03:00",
            state=state,
            tiktok=SAMPLES / "tiktok_trends.sample.json",
            link_check=False,  # sample links are example.com placeholders
        )
        out = out_dir / f"edition.{edition['edition_id']}.json"
        _write_json(out, edition)
        _say(f"assembled: {edition['edition_id']} with {len(edition['items'])} Items -> {out}")
        _post(args.app_url, edition, state)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="edition_v3.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    commands = parser.add_subparsers(dest="command", required=True)
    app_url_help = "the app's URL including its base path, e.g. https://example.com/brief"

    gl = commands.add_parser("gathering-list", help="fetch the gathering list into a file")
    gl.add_argument("--app-url", required=True, help=app_url_help)
    gl.add_argument("--out", required=True)
    gl.set_defaults(handler=cmd_gathering_list)

    ctx = commands.add_parser("context", help="list the previous Edition's Items and the Story Threads in use")
    ctx.add_argument("--state-dir", required=True)
    ctx.set_defaults(handler=cmd_context)

    run = commands.add_parser("run", help="one scheduled run: assemble, check links, validate, post")
    run.add_argument("--app-url", required=True, help=app_url_help)
    run.add_argument("--drafts", action="append", required=True, help="a drafts file the agent wrote (repeatable)")
    run.add_argument("--state-dir", required=True, help="where accepted Editions are kept between runs")
    run.add_argument("--out", required=True, help="where to write the Edition")
    run.add_argument("--gathering-list", help="a gathering list file to use instead of fetching it again")
    run.add_argument("--tiktok", help="scripts/tiktok_trends.json: Saudi TikTok trends for Social Trends")
    run.add_argument("--kind", choices=["morning", "evening"], help="default: from the time (before noon is morning)")
    run.add_argument("--generated-at", help="RFC 3339 with +03:00; default: now in Asia/Riyadh")
    run.add_argument(
        "--no-link-check",
        action="store_true",
        help="skip checking links and images (dry runs on sample data only; a real run always checks)",
    )
    run.add_argument("--no-post", action="store_true", help="assemble and validate only")
    run.set_defaults(handler=cmd_run)

    val = commands.add_parser("validate", help="check an Edition file against the v3 schema and the house rules")
    val.add_argument("edition")
    val.add_argument("--gathering-list", help="the gathering list, for its Sensitive Topics")
    val.set_defaults(handler=cmd_validate)

    post = commands.add_parser("post", help="post an Edition file to the app and remember it")
    post.add_argument("edition")
    post.add_argument("--app-url", required=True, help=app_url_help)
    post.add_argument("--state-dir", required=True)
    post.set_defaults(handler=cmd_post)

    dry = commands.add_parser("dry-run", help="post a sample morning and evening Edition to a STAGING app")
    dry.add_argument("--app-url", required=True, help="a staging or local app, never the live one")
    dry.add_argument("--out-dir", help="where to write the Editions (default: a new temporary folder)")
    dry.add_argument("--state-dir", help="default: <out-dir>/state, separate from the live run's state")
    dry.set_defaults(handler=cmd_dry_run)

    args = parser.parse_args(argv)
    try:
        args.handler(args)
    except RunError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
