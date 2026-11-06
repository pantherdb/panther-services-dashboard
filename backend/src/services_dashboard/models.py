"""The API's response shapes: the contract with the frontend.

Fields are snake_case here and camelCase on the wire (an alias generator), so the TypeScript types
generated from `openapi.json` read naturally and no field is renamed by hand on either side.
Times are epoch milliseconds, UTC.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from services_dashboard.aggregate import WindowKey
from services_dashboard.correlate import ErrorOrigin, Tone
from services_dashboard.parse.lines import FileFormat
from services_dashboard.records import Level, LogSource, Source
from services_dashboard.store import FileOrigin


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Health(Model):
    status: Literal["ok"] = "ok"


class Counts(Model):
    request: int
    job: int
    log: int
    event: int
    container: int
    stat: int


class FileSummary(Model):
    format: FileFormat
    lines: int
    parsed: int
    unparsed: int
    unparsed_samples: list[str]
    counts: Counts
    first_t: int | None
    last_t: int | None
    has_durations: bool


class LoadedFile(Model):
    id: str
    name: str
    path: str
    bytes: int
    origin: FileOrigin
    status: Literal["ready", "error"]
    error: str | None
    summary: FileSummary | None


class Files(Model):
    folder: str | None
    """The folder the backend reads at start and on reload, if it was given one."""
    files: list[LoadedFile]
    has_sample: bool


class Range(Model):
    start: int
    end: int


class TrafficPoint(Model):
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


class LatencyBin(Model):
    label: str
    lo_ms: float
    hi_ms: float | None


class HeatCell(Model):
    t: int
    """The bucket's start, as in `points`."""
    bin: int
    """An index into `bins`."""
    count: int


class LatencyHeatmap(Model):
    bins: list[LatencyBin]
    """Fastest first, trimmed to the fastest and slowest bins with any requests."""
    cells: list[HeatCell]
    """Non-empty cells only."""
    max_count: int


class EndpointRow(Model):
    method: str
    route: str
    requests: int
    client_errors: int
    server_errors: int
    error_pct: float
    p50: float | None
    p95: float | None
    max: float | None


class Kpis(Model):
    requests: int
    server_error_pct: float | None
    client_error_pct: float | None
    p95_ms: float | None
    jobs: int
    failed_jobs: int
    container_events: int
    mem_peak_pct: float | None
    """The highest any container's memory came to its limit, in percent; None without stats."""


class Marker(Model):
    t: int
    kind: Literal["container", "api_start"]
    label: str
    tone: Tone


class IncidentEvent(Model):
    t: int
    source: Source
    text: str
    tone: Tone


class Incident(Model):
    id: str
    start: int
    end: int
    tone: Tone
    title: str
    summary: list[str]
    """The counts: requests failed and where, errors logged, jobs refused or failed."""
    events: list[IncidentEvent]
    """The evidence, oldest first: the first of each kind of failure, container events, API
    starts, and a container's memory peak before it died."""
    sources: list[Source]
    """Which sources the evidence came from, in the order api, nginx, docker."""
    failed_requests: int


class OriginRow(Model):
    origin: ErrorOrigin
    label: str
    description: str
    tone: Tone
    count: int
    example: str | None


class Line(Model):
    key: str
    t: int
    level: Level
    source: LogSource
    logger: str
    message: str
    detail: str | None


class Overview(Model):
    has_data: bool
    window: WindowKey
    range: Range | None
    bucket_ms: int
    source: LogSource | None
    """Where requests are counted: nginx when its log is loaded, else the API's access log."""
    sources: list[LogSource]
    has_durations: bool
    kpis: Kpis
    points: list[TrafficPoint]
    latency_heatmap: LatencyHeatmap | None
    """Requests by time and latency; None when the requests have no durations."""
    endpoints: list[EndpointRow]
    origins: list[OriginRow]
    incidents: list[Incident]
    markers: list[Marker]
    problems: list[Line]
    problem_count: int


class JobOut(Model):
    t: int
    level: Level
    job_id: str
    service: str
    summary: str
    outcome: Literal["succeeded", "failed"]
    status: int | None
    outcome_text: str
    waited_s: float
    ran_s: float
    detail: str | None


class JobServiceRow(Model):
    service: str
    jobs: int
    succeeded: int
    input_errors: int
    server_errors: int
    ran_p50: float | None
    ran_p95: float | None
    ran_max: float | None
    waited_p95: float | None


class Jobs(Model):
    has_data: bool
    window: WindowKey
    range: Range | None
    jobs: list[JobOut]
    services: list[JobServiceRow]
    markers: list[Marker]
    incidents: list[Incident]


class StoryItem(Model):
    t: int
    source: Source
    text: str
    tone: Tone
    detail: str | None


class JobStory(Model):
    job_id: str
    job: JobOut | None
    items: list[StoryItem]
    clients: list[str]


class Logs(Model):
    has_data: bool
    range: Range | None
    total: int
    page: int
    pages: int
    lines: list[Line]


class TimelineItem(Model):
    key: str
    t: int
    source: Source
    kind: Literal["request", "job", "log", "event"]
    tone: Tone
    text: str
    detail: str | None


class Timeline(Model):
    start: int
    end: int
    total: int
    shown: int
    items: list[TimelineItem]


class Span(Model):
    """The time the loaded data covers, for a link that needs a default window."""

    range: Range | None


class ContainerOut(Model):
    container_id: str
    name: str
    service: str | None
    image: str | None
    status: str
    oom_killed: bool
    exit_code: int | None
    restart_count: int
    created: int | None
    started_at: int | None
    finished_at: int | None
    health: str | None
    error: str | None


class ContainerEvent(Model):
    t: int
    container: str
    service: str | None
    action: str
    text: str
    tone: Tone
    exit_code: int | None


class Containers(Model):
    containers: list[ContainerOut]
    events: list[ContainerEvent]


class ResourceContainer(Model):
    name: str
    service: str | None
    mem_limit_bytes: int | None
    cpu_peak_pct: float
    cpu_peak_t: int
    mem_peak_bytes: int
    mem_peak_t: int


class ResourcePoint(Model):
    t: int
    """The bucket's start."""
    container: str
    cpu_pct: float | None
    """The highest in the bucket; 100 is one core. None when there are no stats for it then."""
    mem_bytes: int | None
    """The highest in the bucket. None when there are no stats for it then."""


class ConcurrencyPoint(Model):
    t: int
    running: float
    """Jobs running, averaged over the bucket."""
    waiting: float
    """Jobs waiting in the queue, averaged over the bucket."""


class ResourceNote(Model):
    t: int
    tone: Tone
    text: str


class Resources(Model):
    has_data: bool
    """Anything loaded."""
    has_stats: bool
    """Any `docker stats` in the window."""
    window: WindowKey
    range: Range | None
    bucket_ms: int
    containers: list[ResourceContainer]
    """The API first, then the web server, then the rest by name."""
    points: list[ResourcePoint]
    """Every bucket for every container."""
    concurrency: list[ConcurrencyPoint]
    notes: list[ResourceNote]
    """What the stats say next to the other sources, newest first."""
    markers: list[Marker]
    incidents: list[Incident]
