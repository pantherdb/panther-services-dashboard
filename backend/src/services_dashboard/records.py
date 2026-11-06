"""What a log line becomes once parsed.

Every timed record carries `t`, epoch milliseconds in UTC, and the id of the file it came from, so
removing a file removes exactly its records. Slotted dataclasses: a day of logs is tens of
thousands of these, and pydantic is kept for the API's edge (`models.py`).
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

type Level = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
type LogSource = Literal["api", "nginx"]
type Source = Literal["api", "nginx", "docker"]

LEVELS: tuple[Level, ...] = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
LEVEL_RANK: dict[Level, int] = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def to_ms(moment: datetime) -> int:
    """Epoch milliseconds, in integer arithmetic so .611 s never becomes 610.9999 ms."""
    return (moment - _EPOCH) // timedelta(milliseconds=1)


def iso_ms(text: str) -> int | None:
    """`2026-11-04T17:02:54.611Z`, or Docker's nanosecond form, as epoch milliseconds."""
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return to_ms(moment)


@dataclass(slots=True)
class Request:
    """One HTTP request, from nginx's access log or Uvicorn's."""

    file_id: str
    t: int
    source: LogSource
    method: str
    path: str
    """Without the query string, which can carry user input."""
    status: int
    bytes: int | None
    duration_ms: float | None
    """nginx's `$request_time`, when its log format has it. Uvicorn's line never does."""
    upstream_ms: float | None
    client: str | None


@dataclass(slots=True)
class Job:
    """One finished scoring job, from the API runner's line (panther_api/jobs/runner.py)."""

    file_id: str
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
    detail: str | None = None


@dataclass(slots=True)
class Log:
    """Any other line with a level: the API's warnings and errors, Uvicorn's, nginx's error log."""

    file_id: str
    t: int
    source: LogSource
    level: Level
    logger: str
    message: str
    detail: str | None = None


@dataclass(slots=True)
class DockerEvent:
    """One of Docker's container events (`docker events --format '{{json .}}'`)."""

    file_id: str
    t: int
    container_id: str
    container: str
    service: str | None
    """The Compose service, such as `api` or `web`, when the container belongs to one."""
    action: str
    exit_code: int | None
    signal: str | None
    image: str | None


@dataclass(slots=True)
class Container:
    """One container's state, from `docker inspect`. Not timed: it's a snapshot."""

    file_id: str
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


@dataclass(slots=True)
class Stat:
    """One container's CPU and memory at a moment: a line of `docker stats` recorded with a time.

    Kept apart from `Record`: a container sampled every few seconds makes tens of thousands of
    these a day, which would bury the timeline. They're joined to jobs and incidents instead.
    """

    file_id: str
    t: int
    container_id: str
    container: str
    service: str | None
    cpu_pct: float
    """Docker's figure: 100 is one core busy, so four busy cores read 400."""
    mem_bytes: int
    mem_limit_bytes: int | None
    """The container's limit, or the host's memory when it has none."""


type Record = Request | Job | Log | DockerEvent


def source_of(record: Record) -> Source:
    match record:
        case DockerEvent():
            return "docker"
        case Job():
            return "api"
        case Request() | Log():
            return record.source
