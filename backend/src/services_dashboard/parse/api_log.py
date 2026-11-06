"""The scoring API's log (panther-scoring-services, api/src/panther_api/logs.py):

    2026-11-04T17:02:54.611Z INFO panther_api.jobs.runner: Job 9c1e… csnp, HUMAN, 347 residues, 3 substitutions: succeeded, waited 0.0 s, ran 41.2 s
    2026-11-04T17:03:10.002Z INFO uvicorn.access: 172.18.0.1:51234 - "POST /api/v1/jobs HTTP/1.1" 422

plus Uvicorn's first lines, before the API takes its log over, which have no time:

    INFO:     Started server process [1]

and, before those, the banner `fastapi run` prints at every start (the image's CMD), which says
nothing the Uvicorn lines don't:

     ⚡️ Starting FastAPI in production mode
     🌐 Server started at http://0.0.0.0:8000

The API never logs what a user submitted, only its size. If its format changes, this module and its
tests change with it.
"""

import re
from dataclasses import dataclass
from typing import cast

from services_dashboard.records import Job, Level, Log, Request, iso_ms

_HEADER = re.compile(
    r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (DEBUG|INFO|WARNING|ERROR|CRITICAL) "
    r"([\w.]+): (.*)$"
)
# Uvicorn's access message: '%s - "%s %s HTTP/%s" %d'.
_ACCESS = re.compile(r'^(\S+) - "([A-Z]+) (\S+) HTTP/[\d.]+" (\d{3})$')
# runner.py `_finish_line`: `<describe>: <outcome>, waited 0.0 s, ran 41.2 s`, and at ERROR maybe
# ` (same error as job <id>, seen 3 times since <time>)`. The summary has commas but no ": ", so
# the greedy summary stops at the last ": " before the outcome.
_JOB = re.compile(
    r"^Job (\S+) ([\w-]+)(?:, (.*))?: (succeeded|failed(?: (\d{3}))?(?:, .*?)?), "
    r"waited ([\d.]+) s, ran ([\d.]+) s(?: \(.*\))?$"
)
_UVICORN_PLAIN = re.compile(r"^(DEBUG|INFO|WARNING|ERROR|CRITICAL):\s+(.*)$")
# fastapi-cli's banner: an optional emoji, then one of its fixed phrases. Read from a real
# `docker logs -t` of the API container (fastapi 0.162); a new phrase shows up as not understood.
_CLI_BANNER = re.compile(
    r"^\s*(?:\S+\s+)?(?:Starting FastAPI|Using import string|Server started at|Documentation at|"
    r"Logs:$|Searching for package|Importing from|Found importable FastAPI app|Tip:|"
    r"Running in (?:production|development) mode)"
)


def is_cli_banner(line: str) -> bool:
    """Whether a line is part of the banner `fastapi run` prints before Uvicorn starts."""
    return _CLI_BANNER.match(line) is not None


@dataclass(slots=True)
class Untimed:
    """A line with a level but no time: Uvicorn's first lines."""

    level: Level
    logger: str
    message: str


def parse_api_line(line: str, file_id: str) -> Request | Job | Log | Untimed | None:
    header = _HEADER.match(line)
    if header:
        time, level, logger, message = header.groups()
        t = iso_ms(time)
        if t is None:
            return None
        return _parse_message(file_id, t, cast(Level, level), logger, message)

    plain = _UVICORN_PLAIN.match(line)
    if plain:
        return Untimed(level=cast(Level, plain[1]), logger="uvicorn", message=plain[2])
    return None


def _parse_message(
    file_id: str, t: int, level: Level, logger: str, message: str
) -> Request | Job | Log:
    if logger == "uvicorn.access" and (access := _ACCESS.match(message)):
        client, method, full_path, status = access.groups()
        return Request(
            file_id=file_id,
            t=t,
            source="api",
            method=method,
            path=full_path.split("?", 1)[0],
            status=int(status),
            bytes=None,
            duration_ms=None,
            upstream_ms=None,
            client=client,
        )

    if job := _JOB.match(message):
        job_id, service, summary, outcome_text, status, waited, ran = job.groups()
        succeeded = outcome_text == "succeeded"
        return Job(
            file_id=file_id,
            t=t,
            level=level,
            job_id=job_id,
            service=service,
            summary=summary or "",
            outcome="succeeded" if succeeded else "failed",
            status=None if succeeded or status is None else int(status),
            outcome_text=outcome_text,
            waited_s=float(waited),
            ran_s=float(ran),
        )

    return Log(file_id=file_id, t=t, source="api", level=level, logger=logger, message=message)
