"""The loaded files, kept in memory: from the folder the dashboard was pointed at, from uploads,
and the sample. A restart forgets uploads; the folder is read again.

Every change bumps `version`, and the merged, sorted view of all records is rebuilt only when the
version moves, so requests between changes share it. A lock keeps changes and rebuilds apart:
FastAPI runs plain `def` routes on a thread pool.
"""

import gzip
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from services_dashboard.parse.lines import Parsed, Summary, parse_text
from services_dashboard.records import Container, DockerEvent, Record, Stat

type FileOrigin = Literal["folder", "upload", "sample"]

MAX_FILE_BYTES = 200 * 1024 * 1024
_SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".tar", ".tgz", ".pdf", ".exe"}


@dataclass(slots=True)
class LoadedFile:
    id: str
    name: str
    path: str
    bytes: int
    origin: FileOrigin
    status: Literal["ready", "error"]
    error: str | None
    summary: Summary | None
    records: list[Record] = field(default_factory=list[Record])
    containers: list[Container] = field(default_factory=list[Container])
    stats: list[Stat] = field(default_factory=list[Stat])


@dataclass(slots=True)
class Snapshot:
    """Everything loaded, merged: records and stats oldest first, and every container."""

    records: list[Record]
    containers: list[Container]
    stats: list[Stat]
    span: tuple[int, int] | None


def decode(name: str, data: bytes) -> str:
    """The text of a file, unzipped if it's a `.gz` (a rotated log)."""
    if name.endswith(".gz"):
        data = gzip.decompress(data)
    return data.decode("utf-8", errors="replace")


class Store:
    def __init__(self, folder: Path | None = None) -> None:
        self.folder = folder
        self._files: dict[str, LoadedFile] = {}
        self._next_id = 0
        self._version = 0
        self._snapshot: tuple[int, Snapshot] | None = None
        self._lock = threading.RLock()

    @property
    def version(self) -> int:
        return self._version

    def files(self) -> list[LoadedFile]:
        with self._lock:
            return list(self._files.values())

    def add(self, name: str, path: str, data: bytes, origin: FileOrigin) -> LoadedFile:
        with self._lock:
            self._next_id += 1
            file_id = f"f{self._next_id}"
        if len(data) > MAX_FILE_BYTES:
            loaded = LoadedFile(
                file_id,
                name,
                path,
                len(data),
                origin,
                "error",
                "Larger than 200 MB. Split it or filter it first.",
                None,
            )
        else:
            try:
                parsed: Parsed = parse_text(decode(name, data), file_id)
                loaded = LoadedFile(
                    file_id,
                    name,
                    path,
                    len(data),
                    origin,
                    "ready",
                    None,
                    parsed.summary,
                    parsed.records,
                    parsed.containers,
                    parsed.stats,
                )
            except (OSError, EOFError, ValueError) as error:
                loaded = LoadedFile(
                    file_id, name, path, len(data), origin, "error", str(error), None
                )
        with self._lock:
            self._files[file_id] = loaded
            self._version += 1
        return loaded

    def remove(self, file_id: str) -> bool:
        with self._lock:
            found = self._files.pop(file_id, None) is not None
            if found:
                self._version += 1
            return found

    def clear(self) -> None:
        with self._lock:
            self._files.clear()
            self._version += 1

    def load_folder(self) -> int:
        """Reads every log-like file under the folder again, replacing what was read before."""
        if self.folder is None:
            return 0
        with self._lock:
            for file_id in [f.id for f in self._files.values() if f.origin == "folder"]:
                del self._files[file_id]
            self._version += 1
        count = 0
        for path in sorted(self.folder.rglob("*")):
            if (
                not path.is_file()
                or path.name.startswith(".")
                or path.suffix.lower() in _SKIP_SUFFIXES
            ):
                continue
            rel = path.relative_to(self.folder).as_posix()
            self.add(path.name, rel, path.read_bytes(), "folder")
            count += 1
        return count

    def snapshot(self) -> Snapshot:
        with self._lock:
            if self._snapshot and self._snapshot[0] == self._version:
                return self._snapshot[1]
            ready = [f for f in self._files.values() if f.status == "ready"]
            records = sorted((r for f in ready for r in f.records), key=lambda r: r.t)
            containers = [c for f in ready for c in f.containers]
            stats = sorted((s for f in ready for s in f.stats), key=lambda s: s.t)
            _fill_services(stats, records, containers)
            ends = [r.t for r in records[:1] + records[-1:]] + [s.t for s in stats[:1] + stats[-1:]]
            span = (min(ends), max(ends)) if ends else None
            snap = Snapshot(records, containers, stats, span)
            self._snapshot = (self._version, snap)
            return snap


def _fill_services(stats: list[Stat], records: list[Record], containers: list[Container]) -> None:
    """A stat's service from Docker's own labels, when inspect or events name its container: the
    name alone can't say where a project's name ends and a dashed service's begins."""
    by_name = {c.name: c.service for c in containers if c.service}
    by_name.update(
        (r.container, r.service) for r in records if isinstance(r, DockerEvent) and r.service
    )
    for s in stats:
        s.service = by_name.get(s.container, s.service)
