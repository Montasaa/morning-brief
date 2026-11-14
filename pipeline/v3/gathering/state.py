"""The run's memory between Editions: every Edition the app accepted, one file each.

<state-dir>/editions/<edition_id>.json. The previous Edition (for carry-over and the
new/updated status), the Story Threads already used (so Thread ids stay stable) and the
Items already published all come from here.
"""
import json
from pathlib import Path


class State:
    def __init__(self, directory: str | Path):
        self.directory = Path(directory)
        self.editions_dir = self.directory / "editions"
        self._editions: list[dict] | None = None

    def editions(self) -> list[dict]:
        """Every accepted Edition, oldest first (by generated_at)."""
        if self._editions is None:
            found = []
            if self.editions_dir.is_dir():
                for file in self.editions_dir.glob("*.json"):
                    found.append(json.loads(file.read_text(encoding="utf-8")))
            found.sort(key=lambda e: (_instant(e["generated_at"]), e["edition_id"]))
            self._editions = found
        return self._editions

    def previous(self, edition_id: str, generated_at: str) -> dict | None:
        """The newest accepted Edition generated before this one (never this one itself)."""
        before = [
            e for e in self.editions()
            if e["edition_id"] != edition_id and _instant(e["generated_at"]) < _instant(generated_at)
        ]
        return before[-1] if before else None

    def threads(self, edition_id: str) -> dict[str, dict]:
        """Every Story Thread used so far, by id, with its newest title."""
        known: dict[str, dict] = {}
        for edition in self.editions():
            if edition["edition_id"] == edition_id:
                continue
            for thread in edition.get("threads", []):
                known[thread["id"]] = thread
        return known

    def items(self, edition_id: str) -> dict[str, dict]:
        """Every Item published so far, by id, as last published."""
        known: dict[str, dict] = {}
        for edition in self.editions():
            if edition["edition_id"] == edition_id:
                continue
            for item in edition.get("items", []):
                known[item["id"]] = item
        return known

    def record(self, edition: dict) -> Path:
        """Keep an Edition the app accepted. Written to a .tmp file, then moved into place."""
        self.editions_dir.mkdir(parents=True, exist_ok=True)
        target = self.editions_dir / f"{edition['edition_id']}.json"
        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(edition, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(target)
        self._editions = None
        return target


def _instant(value: str):
    from datetime import datetime

    return datetime.fromisoformat(value.replace("Z", "+00:00"))
