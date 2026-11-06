"""Turning records into what the charts and tables show: time windows, buckets, percentiles,
endpoints, jobs and headline numbers. Pure functions of their inputs."""

import bisect
import math
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Literal

from services_dashboard.records import DockerEvent, Job, Log, LogSource, Record, Request, Stat

type WindowKey = Literal["15m", "1h", "6h", "24h", "7d", "all"]

WINDOW_MS: dict[WindowKey, int | None] = {
    "15m": 15 * 60_000,
    "1h": 3_600_000,
    "6h": 6 * 3_600_000,
    "24h": 24 * 3_600_000,
    "7d": 7 * 86_400_000,
    "all": None,
}

_BUCKETS_MS = (
    10_000,
    30_000,
    60_000,
    300_000,
    900_000,
    3_600_000,
    10_800_000,
    21_600_000,
    86_400_000,
)

_ID_SEGMENT = re.compile(
    r"^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+)$", re.I
)
# Built files are named by their content (`index-3f9a1c.js`); they're grouped by folder.
_ASSET = re.compile(r"^/(?:.*/)?assets/")


def window_range(key: WindowKey, span: tuple[int, int]) -> tuple[int, int]:
    """Windows count back from the newest record loaded, not from now: files are a snapshot."""
    first, last = span
    ms = WINDOW_MS[key]
    return (first if ms is None else max(first, last - ms), last)


@dataclass(slots=True)
class Slice:
    """The records inside a window, split by kind."""

    range: tuple[int, int]
    requests: dict[LogSource, list[Request]] = field(
        default_factory=lambda: {"api": [], "nginx": []}
    )
    jobs: list[Job] = field(default_factory=list[Job])
    logs: list[Log] = field(default_factory=list[Log])
    events: list[DockerEvent] = field(default_factory=list[DockerEvent])


def slice_records(records: Iterable[Record], window: tuple[int, int]) -> Slice:
    s = Slice(window)
    start, end = window
    for r in records:
        if r.t < start or r.t > end:
            continue
        match r:
            case Request():
                s.requests[r.source].append(r)
            case Job():
                s.jobs.append(r)
            case Log():
                s.logs.append(r)
            case DockerEvent():
                s.events.append(r)
    return s


def slice_stats(stats: Sequence[Stat], window: tuple[int, int]) -> list[Stat]:
    """The stats inside a window; `stats` is oldest first."""
    times = [s.t for s in stats]
    return list(stats[bisect.bisect_left(times, window[0]) : bisect.bisect_right(times, window[1])])


def pick_bucket_ms(span_ms: int, max_buckets: int = 150) -> int:
    """The narrowest bucket that keeps a span to at most `max_buckets` buckets."""
    return next((b for b in _BUCKETS_MS if span_ms / b <= max_buckets), _BUCKETS_MS[-1])


def quantile(sorted_values: Sequence[float], q: float) -> float | None:
    """The value at quantile q (0..1) of an ascending sequence, by nearest rank."""
    if not sorted_values:
        return None
    rank = math.ceil(q * len(sorted_values)) - 1
    return sorted_values[min(len(sorted_values) - 1, max(0, rank))]


def route_of(path: str) -> str:
    """Groups paths into routes: `/api/v1/jobs/9c1e…` becomes `/api/v1/jobs/{id}`."""
    if _ASSET.match(path):
        return path.rsplit("/", 1)[0] + "/*"
    return "/".join("{id}" if _ID_SEGMENT.match(seg) else seg for seg in path.split("/"))


@dataclass(slots=True)
class TrafficPoint:
    t: int
    total: int
    client_errors: int
    server_errors: int
    client_error_pct: float | None
    server_error_pct: float | None
    p50: float | None
    p95: float | None
    p99: float | None
    jobs: int
    failed_jobs: int


def _buckets(start: int, end: int, bucket_ms: int) -> tuple[int, int]:
    """The first bucket's start and how many buckets cover start to end."""
    first = (start // bucket_ms) * bucket_ms
    return first, max(1, math.ceil((end - first + 1) / bucket_ms))


def traffic_series(
    requests: Sequence[Request],
    start: int,
    end: int,
    bucket_ms: int,
    jobs: Sequence[Job] = (),
) -> list[TrafficPoint]:
    """Every bucket from start to end, empty ones too: a gap in traffic is a finding."""
    first, count = _buckets(start, end, bucket_ms)
    finished = [0] * count
    failed = [0] * count
    for j in jobs:
        i = (j.t - first) // bucket_ms
        if 0 <= i < count:
            finished[i] += 1
            failed[i] += j.outcome == "failed"
    totals = [0] * count
    client = [0] * count
    server = [0] * count
    durations: list[list[float]] = [[] for _ in range(count)]
    for r in requests:
        i = (r.t - first) // bucket_ms
        if not 0 <= i < count:
            continue
        totals[i] += 1
        if 400 <= r.status < 500:
            client[i] += 1
        elif r.status >= 500:
            server[i] += 1
        if r.duration_ms is not None:
            durations[i].append(r.duration_ms)

    points: list[TrafficPoint] = []
    for i in range(count):
        d = sorted(durations[i])
        n = totals[i]
        points.append(
            TrafficPoint(
                t=first + i * bucket_ms,
                total=n,
                client_errors=client[i],
                server_errors=server[i],
                client_error_pct=client[i] / n * 100 if n else None,
                server_error_pct=server[i] / n * 100 if n else None,
                p50=quantile(d, 0.5),
                p95=quantile(d, 0.95),
                p99=quantile(d, 0.99),
                jobs=finished[i],
                failed_jobs=failed[i],
            )
        )
    return points


# --------------------------------------------------------------------------- latency heatmap

# Bin edges in ms. Roughly logarithmic: a heatmap's job is to show a second mode (a slow path, a
# queue) next to the usual one, and on a linear scale everything fast lands in one row.
LATENCY_EDGES_MS = (5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000)


@dataclass(slots=True)
class LatencyBin:
    label: str
    lo_ms: float
    hi_ms: float | None


@dataclass(slots=True)
class HeatCell:
    t: int
    bin: int
    count: int


@dataclass(slots=True)
class LatencyHeatmap:
    bins: list[LatencyBin]
    cells: list[HeatCell]
    max_count: int


def _ms_text(ms: float) -> str:
    return f"{ms:g} ms" if ms < 1000 else f"{ms / 1000:g} s"


def _bin_label(lo: float, hi: float | None) -> str:
    if hi is None:
        return f"over {_ms_text(lo)}"
    if lo == 0:
        return f"under {_ms_text(hi)}"
    if (lo < 1000) == (hi < 1000):
        return f"{_ms_text(lo).split()[0]} to {_ms_text(hi)}"
    return f"{_ms_text(lo)} to {_ms_text(hi)}"


def latency_heatmap(
    requests: Sequence[Request], start: int, end: int, bucket_ms: int
) -> LatencyHeatmap | None:
    """Requests counted by time bucket and latency bin; None when nothing has a duration."""
    first, count = _buckets(start, end, bucket_ms)
    counts: dict[tuple[int, int], int] = defaultdict(int)
    for r in requests:
        if r.duration_ms is None:
            continue
        i = (r.t - first) // bucket_ms
        if 0 <= i < count:
            counts[(i, bisect.bisect_right(LATENCY_EDGES_MS, r.duration_ms))] += 1
    if not counts:
        return None
    used = [b for _, b in counts]
    lo_bin, hi_bin = min(used), max(used)
    edges: list[float | None] = [0, *LATENCY_EDGES_MS, None]
    bins: list[LatencyBin] = []
    for b in range(lo_bin, hi_bin + 1):
        lo = edges[b] or 0
        hi = edges[b + 1]
        bins.append(LatencyBin(_bin_label(lo, hi), lo, hi))
    cells = [HeatCell(first + i * bucket_ms, b - lo_bin, n) for (i, b), n in sorted(counts.items())]
    return LatencyHeatmap(bins, cells, max(counts.values()))


# --------------------------------------------------------------------------- resources


@dataclass(slots=True)
class ResourceContainer:
    name: str
    service: str | None
    mem_limit_bytes: int | None
    cpu_peak_pct: float
    cpu_peak_t: int
    mem_peak_bytes: int
    mem_peak_t: int


@dataclass(slots=True)
class ResourcePoint:
    t: int
    container: str
    cpu_pct: float | None
    mem_bytes: int | None


@dataclass(slots=True)
class ConcurrencyPoint:
    t: int
    running: float
    waiting: float


def _container_order(name: str, service: str | None) -> tuple[int, str]:
    return ({"api": 0, "web": 1}.get(service or "", 2), name)


def resource_containers(stats: Sequence[Stat]) -> list[ResourceContainer]:
    """Each container's peaks, the API first, then the web server, then the rest by name."""
    groups: dict[str, list[Stat]] = {}
    for s in stats:
        groups.setdefault(s.container, []).append(s)
    out: list[ResourceContainer] = []
    for name, ss in groups.items():
        cpu = max(ss, key=lambda s: s.cpu_pct)
        mem = max(ss, key=lambda s: s.mem_bytes)
        out.append(
            ResourceContainer(
                name,
                ss[-1].service,
                ss[-1].mem_limit_bytes,
                cpu.cpu_pct,
                cpu.t,
                mem.mem_bytes,
                mem.t,
            )
        )
    return sorted(out, key=lambda c: _container_order(c.name, c.service))


def resource_series(
    stats: Sequence[Stat], containers: Sequence[str], start: int, end: int, bucket_ms: int
) -> list[ResourcePoint]:
    """Each container's highest CPU and memory per bucket, every bucket: a container with no
    stats for a while was down or not being recorded, and the chart should show the gap."""
    first, count = _buckets(start, end, bucket_ms)
    cpu: dict[str, list[float | None]] = {c: [None] * count for c in containers}
    mem: dict[str, list[int | None]] = {c: [None] * count for c in containers}
    for s in stats:
        i = (s.t - first) // bucket_ms
        if s.container not in cpu or not 0 <= i < count:
            continue
        c, m = cpu[s.container][i], mem[s.container][i]
        cpu[s.container][i] = s.cpu_pct if c is None else max(c, s.cpu_pct)
        mem[s.container][i] = s.mem_bytes if m is None else max(m, s.mem_bytes)
    return [
        ResourcePoint(first + i * bucket_ms, name, cpu[name][i], mem[name][i])
        for name in containers
        for i in range(count)
    ]


def run_interval(j: Job) -> tuple[int, int]:
    """When a job ran: its line is written when it finishes, after `ran_s` of work."""
    return j.t - round(j.ran_s * 1000), j.t


def concurrency_series(
    jobs: Sequence[Job], start: int, end: int, bucket_ms: int
) -> list[ConcurrencyPoint]:
    """Jobs running and waiting, averaged over each bucket: 2.5 is two and a half jobs' worth of
    time in the bucket, which reads as the number at any moment when they overlap."""
    first, count = _buckets(start, end, bucket_ms)
    running = [0.0] * count
    waiting = [0.0] * count

    def spread(lo: int, hi: int, into: list[float]) -> None:
        for i in range(
            max(0, (lo - first) // bucket_ms), min(count, (hi - first) // bucket_ms + 1)
        ):
            b0 = first + i * bucket_ms
            overlap = min(hi, b0 + bucket_ms) - max(lo, b0)
            if overlap > 0:
                into[i] += overlap / bucket_ms

    for j in jobs:
        run_start, done = run_interval(j)
        spread(run_start, done, running)
        spread(run_start - round(j.waited_s * 1000), run_start, waiting)
    return [
        ConcurrencyPoint(first + i * bucket_ms, round(running[i], 3), round(waiting[i], 3))
        for i in range(count)
    ]


@dataclass(slots=True)
class EndpointRow:
    method: str
    route: str
    requests: int
    client_errors: int
    server_errors: int
    error_pct: float
    p50: float | None
    p95: float | None
    max: float | None


def endpoint_stats(requests: Sequence[Request]) -> list[EndpointRow]:
    """Requests by method and route, busiest first."""
    groups: dict[tuple[str, str], list[Request]] = defaultdict(list)
    for r in requests:
        groups[(r.method, route_of(r.path))].append(r)
    rows: list[EndpointRow] = []
    for (method, route), rs in groups.items():
        d = sorted(r.duration_ms for r in rs if r.duration_ms is not None)
        ce = sum(1 for r in rs if 400 <= r.status < 500)
        se = sum(1 for r in rs if r.status >= 500)
        rows.append(
            EndpointRow(
                method,
                route,
                len(rs),
                ce,
                se,
                (ce + se) / len(rs) * 100,
                quantile(d, 0.5),
                quantile(d, 0.95),
                d[-1] if d else None,
            )
        )
    return sorted(rows, key=lambda row: -row.requests)


@dataclass(slots=True)
class JobServiceRow:
    service: str
    jobs: int
    succeeded: int
    input_errors: int
    server_errors: int
    ran_p50: float | None
    ran_p95: float | None
    ran_max: float | None
    waited_p95: float | None


def job_stats(jobs: Sequence[Job]) -> list[JobServiceRow]:
    """Jobs by service, in the order the services first appear."""
    groups: dict[str, list[Job]] = {}
    for j in jobs:
        groups.setdefault(j.service, []).append(j)
    rows: list[JobServiceRow] = []
    for service, js in groups.items():
        ran = sorted(j.ran_s for j in js)
        waited = sorted(j.waited_s for j in js)
        rows.append(
            JobServiceRow(
                service=service,
                jobs=len(js),
                succeeded=sum(1 for j in js if j.outcome == "succeeded"),
                input_errors=sum(1 for j in js if j.status is not None and j.status < 500),
                server_errors=sum(1 for j in js if j.status is not None and j.status >= 500),
                ran_p50=quantile(ran, 0.5),
                ran_p95=quantile(ran, 0.95),
                ran_max=ran[-1] if ran else None,
                waited_p95=quantile(waited, 0.95),
            )
        )
    return rows


@dataclass(slots=True)
class Kpis:
    requests: int
    server_error_pct: float | None
    client_error_pct: float | None
    p95_ms: float | None
    jobs: int
    failed_jobs: int
    container_events: int
    mem_peak_pct: float | None


def kpis(
    requests: Sequence[Request],
    jobs: Sequence[Job],
    events: Sequence[DockerEvent],
    stats: Sequence[Stat] = (),
) -> Kpis:
    d = sorted(r.duration_ms for r in requests if r.duration_ms is not None)
    n = len(requests)
    bad_events = sum(1 for e in events if e.action in ("die", "oom", "kill", "restart"))
    return Kpis(
        requests=n,
        server_error_pct=sum(1 for r in requests if r.status >= 500) / n * 100 if n else None,
        client_error_pct=sum(1 for r in requests if 400 <= r.status < 500) / n * 100 if n else None,
        p95_ms=quantile(d, 0.95),
        jobs=len(jobs),
        failed_jobs=sum(1 for j in jobs if j.outcome == "failed"),
        container_events=bad_events,
        mem_peak_pct=max(
            (s.mem_bytes / s.mem_limit_bytes * 100 for s in stats if s.mem_limit_bytes),
            default=None,
        ),
    )
