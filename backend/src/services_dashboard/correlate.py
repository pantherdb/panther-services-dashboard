"""Joining the three sources: what this project is for.

- **Error origin.** Each failed request nginx logged is matched to the API's own line for it, to
  say where it failed: the API was unreachable, the API failed, refused, was too slow, or the
  client gave up.
- **Incidents.** Failures, error lines, container deaths and API restarts close together in time
  become one incident with a summary, instead of four charts to compare by eye.
- **Markers.** Container events and API startups, to draw on every time chart.
- **Job story.** Everything known about one job: its submission, polls, finish line, and what
  happened to the containers meanwhile, down to the API container's CPU and memory while it ran.
- **Resources.** `docker stats` against the rest: memory climbing before a container died, the CPU
  peak and the jobs running then, and whether jobs ran slower while the CPU was busy.
- **Timeline.** Every event from all sources in a window, interleaved.
"""

import bisect
import statistics
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from services_dashboard.aggregate import route_of, run_interval
from services_dashboard.records import (
    LEVEL_RANK,
    DockerEvent,
    Job,
    Level,
    Log,
    Record,
    Request,
    Source,
    Stat,
)

type Tone = Literal["pass", "warn", "fail", "active", "neutral"]
type ErrorOrigin = Literal[
    "api_unreachable",
    "api_error",
    "api_refused",
    "api_slow",
    "client_gave_up",
    "site_error",
    "unknown",
]

MATCH_MS = 2_000
INCIDENT_GAP_MS = 5 * 60_000
INCIDENT_EVENT_LIMIT = 12
# How far back to look at a container's memory before it died: long enough for a slow leak.
MEMORY_LOOKBACK_MS = 60 * 60_000
# `docker stats` samples every few seconds at best; a sample this close to a short job's run
# still describes it.
STATS_SLACK_MS = 15_000
SOURCE_ORDER: tuple[Source, ...] = ("api", "nginx", "docker")

ORIGINS: dict[ErrorOrigin, tuple[str, str, Tone]] = {
    "api_unreachable": (
        "API unreachable",
        "nginx answered 502 or 503 and the API logged nothing: it was down, restarting or not listening.",
        "fail",
    ),
    "api_error": (
        "API error",
        "The API answered 5xx itself. Its log has the error, often with a traceback.",
        "fail",
    ),
    "api_refused": (
        "API refused",
        "The API answered 503 itself, as it does when its job queue is full.",
        "warn",
    ),
    "api_slow": ("API too slow", "nginx stopped waiting for the API's answer (504).", "fail"),
    "client_gave_up": (
        "Client gave up",
        "The browser closed the connection before the answer came (499).",
        "warn",
    ),
    "site_error": ("Site error", "A 5xx on a path nginx serves itself, not the API.", "fail"),
    "unknown": (
        "Unknown",
        "A 5xx on the API's path, with no API log loaded to say where it came from.",
        "neutral",
    ),
}


def hhmmss(t: int) -> str:
    return datetime.fromtimestamp(t / 1000, UTC).strftime("%H:%M:%S")


def describe_duration(ms: int) -> str:
    if ms < 60_000:
        return f"{max(1, round(ms / 1000))} s"
    if ms < 3_600_000:
        return f"{round(ms / 60_000)} min"
    return f"{ms / 3_600_000:.1f} h"


def describe_bytes(n: int) -> str:
    """Binary units, as Docker writes memory: `410 MiB`, `1.98 GiB`, `2 GiB`."""
    value = float(n)
    for unit in ("B", "KiB", "MiB", "GiB"):
        if value < 1024 or unit == "GiB":
            return f"{value:.3g} {unit}"
        value /= 1024
    return f"{value:.3g} GiB"


def _seconds(s: float) -> str:
    return f"{s:.0f} s" if s >= 10 else f"{s:.1f} s"


# --------------------------------------------------------------------------- error origin


@dataclass(slots=True)
class Failure:
    request: Request
    origin: ErrorOrigin


def classify_failures(nginx: Sequence[Request], api: Sequence[Request]) -> list[Failure]:
    """Every failed request nginx logged (5xx, 499), with where it failed. Both lists oldest first."""
    times: dict[tuple[str, str], list[int]] = {}
    statuses: dict[tuple[str, str], list[int]] = {}
    for r in api:
        key = (r.method, r.path)
        times.setdefault(key, []).append(r.t)
        statuses.setdefault(key, []).append(r.status)

    failures: list[Failure] = []
    for r in nginx:
        if r.status < 500 and r.status != 499:
            continue
        failures.append(Failure(r, _origin(r, times, statuses, bool(api))))
    return failures


def _origin(
    r: Request,
    times: dict[tuple[str, str], list[int]],
    statuses: dict[tuple[str, str], list[int]],
    has_api: bool,
) -> ErrorOrigin:
    if r.status == 499:
        return "client_gave_up"
    if not r.path.startswith("/api/"):
        return "site_error"
    if r.status == 504:
        return "api_slow"
    key = (r.method, r.path)
    status = _matching_status(times.get(key, []), statuses.get(key, []), r)
    if status is not None:
        return "api_refused" if status == 503 else "api_error"
    if r.status in (502, 503):
        return "api_unreachable"
    return "unknown" if not has_api else "site_error"


def _matching_status(times: list[int], statuses: list[int], r: Request) -> int | None:
    """The status of the API's line for this request: same method and path within MATCH_MS, and a
    failure too. Many requests share a path (every POST /jobs), so the nearest line alone could be
    another request's 202; a line with the same status wins, then the nearest failing one."""
    lo = bisect.bisect_left(times, r.t - MATCH_MS)
    hi = bisect.bisect_right(times, r.t + MATCH_MS)
    failing = [(abs(times[i] - r.t), statuses[i]) for i in range(lo, hi) if statuses[i] >= 500]
    if not failing:
        return None
    same = [c for c in failing if c[1] == r.status]
    return min(same or failing)[1]


@dataclass(slots=True)
class OriginRow:
    origin: ErrorOrigin
    label: str
    description: str
    tone: Tone
    count: int
    example: str | None


def origin_rows(failures: Sequence[Failure]) -> list[OriginRow]:
    counts: Counter[ErrorOrigin] = Counter(f.origin for f in failures)
    examples: dict[ErrorOrigin, str] = {}
    for f in failures:
        r = f.request
        examples.setdefault(f.origin, f"{r.method} {r.path} → {r.status} at {hhmmss(r.t)} UTC")
    rows = [
        OriginRow(o, ORIGINS[o][0], ORIGINS[o][1], ORIGINS[o][2], n, examples.get(o))
        for o, n in counts.items()
    ]
    return sorted(rows, key=lambda row: -row.count)


# --------------------------------------------------------------------------- markers


@dataclass(slots=True)
class Marker:
    t: int
    kind: Literal["container", "api_start"]
    label: str
    tone: Tone


def event_text(e: DockerEvent) -> tuple[str, Tone] | None:
    """A container event in words, and how bad it is. None for events not worth showing."""
    who = e.service or e.container
    match e.action:
        case "die":
            code = f" (exit {e.exit_code})" if e.exit_code is not None else ""
            return f"{who} stopped{code}", "pass" if e.exit_code == 0 else "fail"
        case "oom":
            return f"{who} ran out of memory", "fail"
        case "kill":
            return f"{who} was sent signal {e.signal or '?'}", "warn"
        case "start":
            return f"{who} started", "active"
        case "restart":
            return f"{who} restarted", "warn"
        case "stop":
            return f"{who} was stopped", "neutral"
        case "health_status: unhealthy":
            return f"{who} became unhealthy", "fail"
        case "health_status: healthy":
            return f"{who} became healthy", "pass"
        case "create":
            return f"{who} was created", "neutral"
        case "destroy":
            return f"{who} was removed", "neutral"
        case _:
            return None


def _is_api_start(log: Log) -> bool:
    return log.source == "api" and log.message.startswith("Application startup complete")


def markers(events: Sequence[DockerEvent], logs: Sequence[Log], limit: int = 200) -> list[Marker]:
    out: list[Marker] = []
    for e in events:
        if e.action in ("create", "destroy", "health_status: healthy"):
            continue
        described = event_text(e)
        if described:
            out.append(Marker(e.t, "container", described[0], described[1]))
    out.extend(
        Marker(log.t, "api_start", "API started", "active") for log in logs if _is_api_start(log)
    )
    return sorted(out, key=lambda m: m.t)[:limit]


# --------------------------------------------------------------------------- incidents


@dataclass(slots=True)
class _Signal:
    t: int
    kind: str
    bad: bool
    record: Record | None = None
    origin: ErrorOrigin | None = None


@dataclass(slots=True)
class IncidentEvent:
    t: int
    source: Source
    text: str
    tone: Tone


@dataclass(slots=True)
class Incident:
    id: str
    start: int
    end: int
    tone: Tone
    title: str
    summary: list[str]
    """The counts: requests failed and where, errors logged, jobs refused or failed."""
    events: list[IncidentEvent]
    """The evidence in time order: the first of each kind of failure, and every container event."""
    sources: list[Source]
    """Which sources the evidence came from: the more, the more the incident was joined up."""
    failed_requests: int


def incidents(
    failures: Sequence[Failure],
    jobs: Sequence[Job],
    logs: Sequence[Log],
    events: Sequence[DockerEvent],
    stats: Sequence[Stat] = (),
) -> list[Incident]:
    """Bad things close together in time, as incidents, newest first."""
    signals: list[_Signal] = []
    for f in failures:
        if f.origin != "client_gave_up":
            signals.append(_Signal(f.request.t, "failure", True, f.request, f.origin))
    for j in jobs:
        if j.status is not None and j.status >= 500:
            signals.append(_Signal(j.t, "job_error", True, j))
    for log in logs:
        if _is_api_start(log):
            signals.append(_Signal(log.t, "api_start", False, log))
        elif log.source == "nginx" and LEVEL_RANK[log.level] >= LEVEL_RANK["ERROR"]:
            signals.append(_Signal(log.t, "nginx_error", True, log))
        elif log.source == "api" and log.message.startswith("Refused"):
            signals.append(_Signal(log.t, "queue_full", True, log))
        elif log.source == "api" and LEVEL_RANK[log.level] >= LEVEL_RANK["ERROR"]:
            signals.append(_Signal(log.t, "api_error_log", True, log))
    for e in events:
        described = event_text(e)
        if described and e.action not in ("create", "destroy"):
            signals.append(_Signal(e.t, "container", described[1] in ("fail", "warn"), e))

    signals.sort(key=lambda s: s.t)
    groups: list[list[_Signal]] = []
    for s in signals:
        if groups and s.t - groups[-1][-1].t <= INCIDENT_GAP_MS:
            groups[-1].append(s)
        else:
            groups.append([s])

    found = [_incident(g, stats) for g in groups if any(s.bad for s in g)]
    return sorted(found, key=lambda i: -i.start)


def _incident(group: list[_Signal], stats: Sequence[Stat]) -> Incident:
    start, end = group[0].t, group[-1].t
    origins: Counter[ErrorOrigin] = Counter(
        s.origin for s in group if s.kind == "failure" and s.origin is not None
    )
    kinds = Counter(s.kind for s in group)
    container_events = [s.record for s in group if isinstance(s.record, DockerEvent)]
    died = any(e.action in ("die", "oom") and e.exit_code != 0 for e in container_events)

    if origins["api_unreachable"]:
        title = "API unreachable"
    elif died:
        title = "Container stopped"
    elif origins["api_error"] or kinds["job_error"] or kinds["api_error_log"]:
        title = "API errors"
    elif origins["api_slow"]:
        title = "API too slow"
    elif origins["api_refused"] or kinds["queue_full"]:
        title = "Job queue full"
    elif kinds["nginx_error"]:
        title = "nginx errors"
    else:
        title = "Errors"
    if end > start:
        title = f"{title} for {describe_duration(end - start)}"

    summary: list[str] = []
    if origins:
        parts = ", ".join(f"{n} {ORIGINS[o][0]}" for o, n in origins.most_common())
        summary.append(f"{_n(sum(origins.values()), 'request')} failed through nginx: {parts}.")
    if kinds["nginx_error"]:
        summary.append(f"nginx logged {_n(kinds['nginx_error'], 'error')}.")
    if kinds["queue_full"]:
        summary.append(f"The API refused {_n(kinds['queue_full'], 'job')}: its queue was full.")
    if kinds["job_error"]:
        summary.append(f"{_n(kinds['job_error'], 'job')} failed with a server error.")
    if kinds["api_error_log"]:
        summary.append(f"The API logged {_n(kinds['api_error_log'], 'error')}.")

    timed, peaks_used = _incident_events(group, stats)
    if len(timed) > INCIDENT_EVENT_LIMIT:
        summary.append(
            f"{_n(len(timed) - INCIDENT_EVENT_LIMIT, 'more event')} after these; "
            "the timeline has them all."
        )
        timed = timed[:INCIDENT_EVENT_LIMIT]

    used: set[Source] = set()
    if (
        kinds["job_error"]
        or kinds["api_error_log"]
        or kinds["queue_full"]
        or kinds["api_start"]
        or origins["api_error"]
        or origins["api_refused"]
    ):
        used.add("api")
    if origins or kinds["nginx_error"]:
        used.add("nginx")
    if container_events or peaks_used:
        used.add("docker")

    bad_tones = {ORIGINS[o][2] for o in origins} | (
        {"fail"}
        if died or kinds["job_error"] or kinds["nginx_error"] or kinds["api_error_log"]
        else set()
    )
    tone: Tone = "fail" if "fail" in bad_tones else "warn"
    return Incident(
        f"i{start}",
        start,
        end,
        tone,
        title,
        summary,
        timed,
        [s for s in SOURCE_ORDER if s in used],
        sum(origins.values()),
    )


def _incident_events(
    group: list[_Signal], stats: Sequence[Stat]
) -> tuple[list[IncidentEvent], bool]:
    """The first of each kind of failure, every container event and API start, and the memory
    peak before a container died. Also whether any stats were used."""
    out: list[IncidentEvent] = []
    first_failure = next((s for s in group if s.kind == "failure"), None)
    if (
        first_failure
        and isinstance(first_failure.record, Request)
        and first_failure.origin is not None
    ):
        r = first_failure.record
        label, _, tone = ORIGINS[first_failure.origin]
        out.append(
            IncidentEvent(
                r.t,
                "nginx",
                f"First failed request: {r.method} {route_of(r.path)} → {r.status}, {label}",
                tone,
            )
        )
    firsts: tuple[tuple[str, Source, str, Tone], ...] = (
        ("nginx_error", "nginx", "nginx logged", "fail"),
        ("api_error_log", "api", "The API logged", "fail"),
        ("queue_full", "api", "The API logged", "warn"),
    )
    for kind, source, prefix, tone in firsts:
        first = next((s for s in group if s.kind == kind), None)
        if first and isinstance(first.record, Log):
            out.append(
                IncidentEvent(first.t, source, f"{prefix}: {_clip(first.record.message)}", tone)
            )
    first_job = next((s for s in group if s.kind == "job_error"), None)
    if first_job and isinstance(first_job.record, Job):
        j = first_job.record
        out.append(
            IncidentEvent(j.t, "api", f"Job {j.job_id} ({j.service}) failed {j.status}", "fail")
        )

    peaks_used = False
    for e, _ in _deaths([s.record for s in group if isinstance(s.record, DockerEvent)]):
        peak = _memory_peak(stats, e)
        if peak is None:
            continue
        peaks_used = True
        pct = _pct_of_limit(peak)
        limit = (
            f", {pct:.0f}% of its {describe_bytes(peak.mem_limit_bytes)} limit"
            if pct is not None and peak.mem_limit_bytes
            else ""
        )
        out.append(
            IncidentEvent(
                peak.t,
                "docker",
                f"{e.service or e.container}'s memory peaked at "
                f"{describe_bytes(peak.mem_bytes)}{limit}",
                "fail" if pct is not None and pct >= 90 else "warn",
            )
        )
    for s in group:
        if isinstance(s.record, DockerEvent) and (described := event_text(s.record)):
            out.append(IncidentEvent(s.t, "docker", f"Container {described[0]}", described[1]))
        elif s.kind == "api_start":
            out.append(IncidentEvent(s.t, "api", "The API started", "active"))
    out.sort(key=lambda i: i.t)
    return out, peaks_used


def _n(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def _clip(text: str, n: int = 140) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


# --------------------------------------------------------------------------- job story


@dataclass(slots=True)
class StoryItem:
    t: int
    source: Source
    text: str
    tone: Tone
    detail: str | None = None


@dataclass(slots=True)
class JobStory:
    job: Job | None
    items: list[StoryItem]
    clients: list[str]


def job_story(records: Sequence[Record], job_id: str, stats: Sequence[Stat] = ()) -> JobStory:
    suffix = f"/jobs/{job_id}"
    polls = [r for r in records if isinstance(r, Request) and r.path.endswith(suffix)]
    finishes = [r for r in records if isinstance(r, Job) and r.job_id == job_id]
    job = finishes[0] if finishes else None
    items: list[StoryItem] = []

    for source in ("nginx", "api"):
        items.extend(_poll_items([r for r in polls if r.source == source]))

    nginx_polls = [r for r in polls if r.source == "nginx"]
    clients = sorted({r.client for r in nginx_polls if r.client})
    first_seen = min([r.t for r in polls] + [j.t for j in finishes], default=None)
    last_seen = max([r.t for r in polls] + [j.t for j in finishes], default=None)

    if nginx_polls:
        first = nginx_polls[0]
        submit = _submission(records, first)
        if submit:
            gap = (first.t - submit.t) / 1000
            items.append(
                StoryItem(
                    submit.t,
                    "nginx",
                    f"Submitted: POST {submit.path} → {submit.status}, probably this one "
                    f"(same client, {gap:.1f} s before the first poll)",
                    "active",
                )
            )

    for j in finishes:
        tone: Tone = (
            "pass" if j.outcome == "succeeded" else "fail" if (j.status or 0) >= 500 else "warn"
        )
        items.append(
            StoryItem(
                j.t,
                "api",
                f"Finished: {j.outcome_text}, waited {j.waited_s:.1f} s, ran {j.ran_s:.1f} s",
                tone,
                j.detail,
            )
        )
        if used := _run_resources(stats, j):
            items.append(used)

    if first_seen is not None and last_seen is not None:
        for r in records:
            if r.t < first_seen - 60_000 or r.t > last_seen:
                continue
            if isinstance(r, DockerEvent) and (described := event_text(r)):
                items.append(StoryItem(r.t, "docker", f"Container {described[0]}", described[1]))
            elif isinstance(r, Log) and _is_api_start(r):
                items.append(StoryItem(r.t, "api", "The API started", "active"))

    items.sort(key=lambda i: i.t)
    if job is None and polls:
        restarted = any(i.text == "The API started" for i in items)
        lost = any(p.status == 404 for p in polls)
        why = (
            " The API restarted while it was waiting or running, and the API keeps jobs in memory, "
            "so the restart lost it: later polls got 404."
            if restarted and lost
            else " Either it never finished, or the log with its finish line isn't loaded."
        )
        items.append(StoryItem(polls[-1].t, "api", f"No finish line for this job.{why}", "warn"))
    return JobStory(job, items, clients)


def _run_resources(stats: Sequence[Stat], j: Job) -> StoryItem | None:
    """What the API container used while the job ran, from the stats around its run."""
    run_start, done = run_interval(j)
    during = [
        s
        for s in stats_between(stats, run_start - STATS_SLACK_MS, done + STATS_SLACK_MS)
        if s.service == "api"
    ]
    if not during:
        return None
    lo = min(s.cpu_pct for s in during)
    hi = max(s.cpu_pct for s in during)
    cpu = f"{lo:.0f}% CPU" if round(lo) == round(hi) else f"{lo:.0f} to {hi:.0f}% CPU"
    peak = max(during, key=lambda s: s.mem_bytes)
    pct = _pct_of_limit(peak)
    limit = f", {pct:.0f}% of its limit" if pct is not None else ""
    return StoryItem(
        run_start,
        "docker",
        f"During the run, the API container used {cpu} and {describe_bytes(peak.mem_bytes)} "
        f"of memory{limit}.",
        "neutral",
    )


def _poll_items(polls: Sequence[Request]) -> list[StoryItem]:
    """Polls from one source, a run of the same answer as one line: a page polling every 3 s
    for two minutes is one fact, not forty."""
    items: list[StoryItem] = []
    run: list[Request] = []

    def flush() -> None:
        if not run:
            return
        first, last = run[0], run[-1]
        via = "nginx" if first.source == "nginx" else "the API"
        took = _took([r.duration_ms for r in run if r.duration_ms is not None])
        if len(run) == 1:
            text = f"Polled: {first.status}{took}, logged by {via}"
        else:
            text = (
                f"Polled {len(run)} times until {hhmmss(last.t)}: {first.status} each{took}, "
                f"logged by {via}"
            )
        items.append(StoryItem(first.t, first.source, text, _status_tone(first.status)))
        run.clear()

    for r in polls:
        if run and run[-1].status != r.status:
            flush()
        run.append(r)
    flush()
    return items


def _took(durations: list[float]) -> str:
    if not durations:
        return ""
    lo, hi = min(durations), max(durations)
    return f" in {lo:.0f} ms" if round(lo) == round(hi) else f" in {lo:.0f} to {hi:.0f} ms"


def _submission(records: Sequence[Record], first_poll: Request) -> Request | None:
    """The last accepted POST to /jobs from the same client, within a minute before the first poll."""
    best: Request | None = None
    for r in records:
        if r.t > first_poll.t:
            break
        if (
            isinstance(r, Request)
            and r.source == "nginx"
            and r.method == "POST"
            and r.path.endswith("/jobs")
            and r.status == 202
            and r.client == first_poll.client
            and first_poll.t - r.t <= 60_000
        ):
            best = r
    return best


def _status_tone(status: int) -> Tone:
    return "fail" if status >= 500 else "warn" if status >= 400 else "neutral"


# --------------------------------------------------------------------------- resources


def stats_between(stats: Sequence[Stat], lo: int, hi: int) -> Sequence[Stat]:
    """The stats from lo to hi; `stats` is oldest first."""
    times = [s.t for s in stats]
    return stats[bisect.bisect_left(times, lo) : bisect.bisect_right(times, hi)]


def _same_container(s: Stat, e: DockerEvent) -> bool:
    # Events carry the full id, `docker stats` the short one.
    return s.container == e.container or bool(
        s.container_id
        and e.container_id
        and (e.container_id.startswith(s.container_id) or s.container_id.startswith(e.container_id))
    )


def _pct_of_limit(s: Stat) -> float | None:
    return s.mem_bytes / s.mem_limit_bytes * 100 if s.mem_limit_bytes else None


def _deaths(events: Sequence[DockerEvent]) -> list[tuple[DockerEvent, bool]]:
    """Containers dying badly, once each: Docker reports an out-of-memory kill as `oom` and then
    `die` a moment later. True when it ran out of memory."""
    out: list[tuple[DockerEvent, bool]] = []
    for e in sorted(events, key=lambda e: e.t):
        if not (e.action == "oom" or (e.action == "die" and e.exit_code != 0)):
            continue
        if out and out[-1][0].container == e.container and e.t - out[-1][0].t <= 60_000:
            out[-1] = (out[-1][0], out[-1][1] or e.action == "oom")
            continue
        out.append((e, e.action == "oom"))
    return out


def _memory_before(stats: Sequence[Stat], e: DockerEvent) -> list[Stat]:
    return [s for s in stats_between(stats, e.t - MEMORY_LOOKBACK_MS, e.t) if _same_container(s, e)]


def _memory_peak(stats: Sequence[Stat], e: DockerEvent) -> Stat | None:
    before = _memory_before(stats, e)
    return max(before, key=lambda s: s.mem_bytes) if before else None


@dataclass(slots=True)
class ResourceNote:
    t: int
    tone: Tone
    text: str


def resource_notes(
    stats: Sequence[Stat], jobs: Sequence[Job], events: Sequence[DockerEvent]
) -> list[ResourceNote]:
    """What `docker stats` says next to the other sources, newest first."""
    notes: list[ResourceNote] = []
    explained: set[str] = set()

    for e, oom in _deaths(events):
        if note := _memory_climb(stats, e, oom):
            notes.append(note)
            explained.add(e.container)

    by_container: dict[str, list[Stat]] = {}
    for s in stats:
        by_container.setdefault(s.container, []).append(s)
    for name, ss in by_container.items():
        who = ss[-1].service or name
        peak = max(ss, key=lambda s: s.mem_bytes)
        pct = _pct_of_limit(peak)
        if name not in explained and pct is not None and pct >= 80 and peak.mem_limit_bytes:
            notes.append(
                ResourceNote(
                    peak.t,
                    "warn",
                    f"{who}'s memory reached {describe_bytes(peak.mem_bytes)}, {pct:.0f}% of its "
                    f"{describe_bytes(peak.mem_limit_bytes)} limit, at {hhmmss(peak.t)}.",
                )
            )
        busiest = max(ss, key=lambda s: s.cpu_pct)
        if busiest.cpu_pct >= 50:
            running = (
                f", with {_n(_running_at(jobs, busiest.t), 'job')} running"
                if ss[-1].service == "api"
                else ""
            )
            notes.append(
                ResourceNote(
                    busiest.t,
                    "neutral",
                    f"CPU on {who} peaked at {busiest.cpu_pct:.0f}% "
                    f"({busiest.cpu_pct / 100:.1f} cores) at {hhmmss(busiest.t)}{running}.",
                )
            )

    api = [s for s in stats if s.service == "api"]
    notes.extend(_slower_when_busy(api, jobs))
    return sorted(notes, key=lambda n: -n.t)


def _memory_climb(stats: Sequence[Stat], e: DockerEvent, oom: bool) -> ResourceNote | None:
    """Memory rising to a peak before a container died: a leak, or a job too big for the limit."""
    before = _memory_before(stats, e)
    if len(before) < 3:
        return None
    peak_at = max(range(len(before)), key=lambda i: before[i].mem_bytes)
    peak = before[peak_at]
    low = min(before[: peak_at + 1], key=lambda s: s.mem_bytes)
    rise = peak.mem_bytes - low.mem_bytes
    pct = _pct_of_limit(peak)
    if rise < low.mem_bytes * 0.5 and (pct is None or pct < 80):
        return None
    # Where the climb began: the last sample still near the low before the peak.
    began = next(
        s for s in reversed(before[: peak_at + 1]) if s.mem_bytes <= low.mem_bytes + rise * 0.1
    )
    who = e.service or e.container
    limit = (
        f", {pct:.0f}% of its {describe_bytes(peak.mem_limit_bytes)} limit,"
        if pct is not None and peak.mem_limit_bytes
        else ""
    )
    what = "ran out of memory" if oom else f"stopped (exit {e.exit_code})"
    return ResourceNote(
        e.t,
        "fail",
        f"{who}'s memory rose from {describe_bytes(began.mem_bytes)} to "
        f"{describe_bytes(peak.mem_bytes)}{limit} in the "
        f"{describe_duration(max(1, peak.t - began.t))} before it {what} at {hhmmss(e.t)}.",
    )


def _running_at(jobs: Sequence[Job], t: int) -> int:
    count = 0
    for j in jobs:
        lo, hi = run_interval(j)
        count += lo <= t <= hi
    return count


def _slower_when_busy(api: Sequence[Stat], jobs: Sequence[Job]) -> list[ResourceNote]:
    """Run times split by how busy the API container's CPU was while each job ran, per service.
    The threshold is half the peak, rounded down to 50%, and at least one core (100%)."""
    if not api:
        return []
    peak = max(s.cpu_pct for s in api)
    threshold = max(100, int(peak / 2 // 50 * 50))
    groups: dict[str, tuple[list[float], list[float]]] = {}
    for j in jobs:
        lo, hi = run_interval(j)
        during = stats_between(api, lo - STATS_SLACK_MS, hi + STATS_SLACK_MS)
        if not during:
            continue
        busy = statistics.fmean(s.cpu_pct for s in during) >= threshold
        high, low = groups.setdefault(j.service, ([], []))
        (high if busy else low).append(j.ran_s)

    notes: list[ResourceNote] = []
    t = max(api, key=lambda s: s.cpu_pct).t
    who = api[-1].service or api[-1].container
    for service, (high, low) in groups.items():
        if len(high) < 5 or len(low) < 5:
            continue
        busy_median, calm_median = statistics.median(high), statistics.median(low)
        if calm_median <= 0 or busy_median / calm_median < 1.5:
            continue
        notes.append(
            ResourceNote(
                t,
                "warn",
                f"{service} jobs ran {busy_median / calm_median:.1f} times longer while {who}'s "
                f"CPU was above {threshold}%: median {_seconds(busy_median)} against "
                f"{_seconds(calm_median)}, over {len(high)} and {len(low)} jobs.",
            )
        )
    return notes


# --------------------------------------------------------------------------- timeline


@dataclass(slots=True)
class TimelineItem:
    key: str
    t: int
    source: Source
    kind: Literal["request", "job", "log", "event"]
    tone: Tone
    text: str
    detail: str | None


_LEVEL_TONE: dict[Level, Tone] = {
    "DEBUG": "neutral",
    "INFO": "neutral",
    "WARNING": "warn",
    "ERROR": "fail",
    "CRITICAL": "fail",
}


def timeline_item(r: Record, index: int) -> TimelineItem | None:
    key = f"{r.file_id}-{r.t}-{index}"
    match r:
        case Request():
            took = f" in {r.duration_ms:.0f} ms" if r.duration_ms is not None else ""
            frm = f" from {r.client}" if r.client else ""
            return TimelineItem(
                key,
                r.t,
                r.source,
                "request",
                _status_tone(r.status),
                f"{r.method} {r.path} → {r.status}{took}{frm}",
                None,
            )
        case Job():
            tone: Tone = (
                "pass" if r.outcome == "succeeded" else "fail" if (r.status or 0) >= 500 else "warn"
            )
            summary = f", {r.summary}" if r.summary else ""
            return TimelineItem(
                key,
                r.t,
                "api",
                "job",
                tone,
                f"Job {r.job_id} {r.service}{summary}: {r.outcome_text}, "
                f"waited {r.waited_s:.1f} s, ran {r.ran_s:.1f} s",
                r.detail,
            )
        case Log():
            return TimelineItem(
                key,
                r.t,
                r.source,
                "log",
                _LEVEL_TONE[r.level],
                f"{r.level} {r.logger}: {r.message}",
                r.detail,
            )
        case DockerEvent():
            described = event_text(r)
            if not described:
                return None
            return TimelineItem(
                key, r.t, "docker", "event", described[1], f"Container {described[0]}", None
            )


def is_problem(item: TimelineItem) -> bool:
    return (
        item.tone in ("fail", "warn")
        or item.kind == "event"
        or item.text.startswith("INFO uvicorn")
    )
