"""Turns a file's text into records and a summary.

Each line is classified on its own, so one file can mix formats: `docker logs web > web.log 2>&1`
interleaves nginx's access log (stdout) with its error log (stderr). `docker logs -t` puts its own
timestamp before every line; it's stripped, and it dates Uvicorn's first lines, which have none.
A `docker inspect` file is recognised whole. `docker stats` lines only count with that timestamp in
front, since Docker prints them without one; they're kept apart from the other records.

A line nothing understands is attached to the record before it when that record is an API warning
or error (a traceback's lines), and otherwise counted as unparsed, with the first few kept so the
files page can show what wasn't understood.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

from services_dashboard.parse.api_log import Untimed, is_cli_banner, parse_api_line
from services_dashboard.parse.docker import IGNORED, Ignored, parse_event, parse_inspect
from services_dashboard.parse.nginx import parse_access, parse_error
from services_dashboard.parse.stats import parse_stat
from services_dashboard.records import (
    LEVEL_RANK,
    Container,
    DockerEvent,
    Job,
    Log,
    Record,
    Request,
    Stat,
    iso_ms,
    source_of,
)

type FileFormat = Literal["api", "nginx", "docker", "stats", "mixed", "unknown"]

_DOCKER_PREFIX = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$")
_UNPARSED_SAMPLES = 20
_FORMATS: dict[str, FileFormat] = {
    "api": "api",
    "nginx": "nginx",
    "docker": "docker",
    "stats": "stats",
}


@dataclass(slots=True)
class Counts:
    request: int = 0
    job: int = 0
    log: int = 0
    event: int = 0
    container: int = 0
    stat: int = 0


@dataclass(slots=True)
class Summary:
    format: FileFormat
    lines: int
    parsed: int
    unparsed: int
    unparsed_samples: list[str]
    counts: Counts
    first_t: int | None
    last_t: int | None
    has_durations: bool


@dataclass(slots=True)
class Parsed:
    records: list[Record] = field(default_factory=list[Record])
    containers: list[Container] = field(default_factory=list[Container])
    stats: list[Stat] = field(default_factory=list[Stat])
    summary: Summary | None = None


type _Classified = Request | Job | Log | DockerEvent | Stat | Untimed | Ignored


def _classify_bare(line: str, file_id: str) -> _Classified | None:
    # A blank line after a time prefix, and fastapi-cli's banner, are understood: they hold nothing.
    if not line.strip() or is_cli_banner(line):
        return IGNORED
    return (
        parse_api_line(line, file_id)
        or parse_access(line, file_id)
        or parse_error(line, file_id)
        or parse_event(line, file_id)
    )


def _classify(line: str, file_id: str) -> tuple[_Classified | None, int | None]:
    direct = _classify_bare(line, file_id)
    if direct is not None:
        return direct, None
    prefixed = _DOCKER_PREFIX.match(line)
    if prefixed:
        t = iso_ms(prefixed[1])
        found = _classify_bare(prefixed[2], file_id)
        if found is None and t is not None:
            found = parse_stat(prefixed[2], file_id, t)
        return found, t
    return None, None


def parse_text(text: str, file_id: str) -> Parsed:
    if text.lstrip().startswith("["):
        containers = parse_inspect(text, file_id)
        if containers is not None:
            counts = Counts(container=len(containers))
            n = len(containers)
            summary = Summary("docker", n, n, 0, [], counts, None, None, False)
            return Parsed(containers=containers, summary=summary)

    records: list[Record] = []
    stats: list[Stat] = []
    samples: list[str] = []
    pending: list[Untimed] = []
    lines = unparsed = 0

    def flush(t: int) -> None:
        for p in pending:
            records.append(Log(file_id, t, "api", p.level, p.logger, p.message))
        pending.clear()

    for raw in text.splitlines():
        if not raw.strip():
            continue
        lines += 1
        parsed, docker_t = _classify(raw, file_id)

        if parsed is None:
            last = records[-1] if records else None
            if (
                isinstance(last, Job | Log)
                and source_of(last) == "api"
                and LEVEL_RANK[last.level] >= 30
            ):
                last.detail = raw if last.detail is None else f"{last.detail}\n{raw}"
            else:
                unparsed += 1
                if len(samples) < _UNPARSED_SAMPLES:
                    samples.append(raw)
            continue

        if isinstance(parsed, Ignored):
            continue
        if isinstance(parsed, Stat):
            stats.append(parsed)
            continue
        if isinstance(parsed, Untimed):
            if docker_t is not None:
                flush(docker_t)
                records.append(
                    Log(file_id, docker_t, "api", parsed.level, parsed.logger, parsed.message)
                )
            else:
                pending.append(parsed)
            continue

        flush(parsed.t)
        records.append(parsed)

    if records:
        flush(records[-1].t)
    # Lines with no time anywhere in the file can't be placed on a timeline.
    unparsed += len(pending)

    return Parsed(
        records=records,
        stats=stats,
        summary=_summarise(records, stats, lines, unparsed, samples),
    )


def _summarise(
    records: list[Record], stats: list[Stat], lines: int, unparsed: int, samples: list[str]
) -> Summary:
    counts = Counts(stat=len(stats))
    sources: set[str] = {"stats"} if stats else set()
    first: int | None = min((s.t for s in stats), default=None)
    last: int | None = max((s.t for s in stats), default=None)
    has_durations = False
    for r in records:
        match r:
            case Request():
                counts.request += 1
                has_durations = has_durations or r.duration_ms is not None
            case Job():
                counts.job += 1
            case Log():
                counts.log += 1
            case DockerEvent():
                counts.event += 1
        sources.add(source_of(r))
        first = r.t if first is None else min(first, r.t)
        last = r.t if last is None else max(last, r.t)

    fmt: FileFormat
    if not sources:
        fmt = "unknown"
    elif len(sources) > 1:
        fmt = "mixed"
    else:
        only = next(iter(sources))
        fmt = _FORMATS[only]
    # Lines folded into a record's detail were understood too: they count as parsed.
    return Summary(
        fmt, lines, lines - unparsed, unparsed, samples, counts, first, last, has_durations
    )
