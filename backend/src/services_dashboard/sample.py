"""Made-up files for trying the dashboard without a server: one day of the scoring site, written as
the text the real programs write, and parsed by the same code as a real file.

Seeded and anchored to a fixed date, so every run makes the same day. Two incidents to find:

    03:10 to 03:35 UTC  the API container runs out of memory and stops. nginx answers /api/ with 502
                     and logs connect() failures; jobs in flight are lost, and their polls get 502,
                     then 404 once the API is back (it keeps jobs in memory). `docker stats` shows
                     its memory climbing from 02:30 to the 2 GiB limit.
    08:00 to 09:00 UTC  a burst of large csnp jobs: queueing, slow jobs, some refused with 503, and
                     the API container's CPU near its four cores.

Client addresses come from the documentation ranges (RFC 5737), never real ones. The nginx file
uses the timed format the dashboard recommends (`rt=… urt="…"`), so latency can be charted.
"""

import bisect
import json
import random
from dataclasses import dataclass
from datetime import UTC, datetime

DAY_END = int(datetime(2026, 11, 4, 12, 0, tzinfo=UTC).timestamp() * 1000)
DAY_START = DAY_END - 24 * 3_600_000
OUTAGE = (
    int(datetime(2026, 11, 4, 3, 10, tzinfo=UTC).timestamp() * 1000),
    int(datetime(2026, 11, 4, 3, 35, tzinfo=UTC).timestamp() * 1000),
)
BURST = (
    int(datetime(2026, 11, 4, 8, 0, tzinfo=UTC).timestamp() * 1000),
    int(datetime(2026, 11, 4, 9, 0, tzinfo=UTC).timestamp() * 1000),
)
CRASH = int(datetime(2026, 11, 4, 5, 12, 30, tzinfo=UTC).timestamp() * 1000)
OOM_AT = OUTAGE[0] - 1500
DIED_AT = OUTAGE[0] - 1000
RESTARTED_AT = OUTAGE[1] - 600
LEAK_FROM = int(datetime(2026, 11, 4, 2, 30, tzinfo=UTC).timestamp() * 1000)

STATS_EVERY_MS = 30_000
MIB = 1024**2
API_LIMIT = 2 * 1024**3
WEB_LIMIT = 256 * MIB

CLIENTS = (
    "192.0.2.10",
    "192.0.2.44",
    "198.51.100.7",
    "198.51.100.23",
    "203.0.113.5",
    "203.0.113.81",
)
SCANNERS = ("198.51.100.99", "203.0.113.66")
AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0"
API_PEER = "172.18.0.3"
API_ID = "3f1c9a0b7e2d" + "0" * 52
WEB_ID = "8a7b6c5d4e3f" + "1" * 52
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _dt(t: int) -> datetime:
    return datetime.fromtimestamp(t / 1000, UTC)


def _time_local(t: int) -> str:
    d = _dt(t)
    return f"{d.day:02d}/{MONTHS[d.month - 1]}/{d.year}:{d:%H:%M:%S} +0000"


def _iso(t: int) -> str:
    return _dt(t).strftime("%Y-%m-%dT%H:%M:%S.") + f"{t % 1000:03d}Z"


def _within(t: int, span: tuple[int, int]) -> bool:
    return span[0] <= t < span[1]


@dataclass(slots=True)
class _Line:
    t: int
    text: str


class _Day:
    def __init__(self) -> None:
        self.rand = random.Random(20261104)
        self.nginx: list[_Line] = []
        self.api: list[_Line] = []
        self.events: list[_Line] = []
        # When each job ran, for the API container's CPU and memory.
        self.runs: list[tuple[int, int]] = []
        self.connection = 1000

    # ---- writers, in each program's own format

    def access(
        self,
        t: int,
        client: str,
        method: str,
        path: str,
        status: int,
        size: int,
        rt: float,
        urt: str,
    ) -> None:
        self.nginx.append(
            _Line(
                t,
                f'{client} - - [{_time_local(t)}] "{method} {path} HTTP/1.1" {status} {size} '
                f'"-" "{AGENT}" "-" rt={rt:.3f} urt="{urt}"',
            )
        )

    def api_line(self, t: int, level: str, logger: str, message: str) -> None:
        self.api.append(_Line(t, f"{_iso(t)} {level} {logger}: {message}"))

    def event(self, t: int, action: str, service: str, container_id: str, **extra: str) -> None:
        name = f"panther-scoring-services-{service}-1"
        attrs = {
            "com.docker.compose.project": "panther-scoring-services",
            "com.docker.compose.service": service,
            "image": f"panther-scoring-services-{service}",
            "name": name,
            **extra,
        }
        obj = {
            "status": action,
            "id": container_id,
            "from": attrs["image"],
            "Type": "container",
            "Action": action,
            "Actor": {"ID": container_id, "Attributes": attrs},
            "scope": "local",
            "time": t // 1000,
            "timeNano": t * 1_000_000,
        }
        self.events.append(_Line(t, json.dumps(obj, separators=(",", ":"))))

    # ---- traffic

    def api_request(
        self, t: int, client: str, method: str, path: str, status: int, api_ms: float, routine: bool
    ) -> None:
        """A request through nginx: logged by nginx always, by Uvicorn unless it's routine."""
        self.connection += 1
        if _within(t, OUTAGE):
            self.access(t, client, method, path, 502, 157, self.rand.uniform(0.001, 0.004), "0.001")
            self.nginx.append(
                _Line(
                    t,
                    (
                        f"{_dt(t):%Y/%m/%d %H:%M:%S} [error] 29#29: *{self.connection} connect() failed "
                        f"(111: Connection refused) while connecting to upstream, client: {client}, server: _, "
                        f'request: "{method} {path} HTTP/1.1", upstream: "http://172.18.0.2:8000{path}", '
                        'host: "panther.example.org"'
                    ),
                )
            )
            return
        urt = api_ms / 1000
        size = int(self.rand.uniform(80, 2400)) if status < 300 else 220
        self.access(
            t,
            client,
            method,
            path,
            status,
            size,
            urt + self.rand.uniform(0.0002, 0.002),
            f"{urt:.3f}",
        )
        if not routine or status >= 300:
            port = 40000 + self.rand.randrange(20000)
            self.api_line(
                t + int(api_ms) - 1,
                "INFO",
                "uvicorn.access",
                f'{API_PEER}:{port} - "{method} {path} HTTP/1.1" {status}',
            )

    def startup(self, t: int) -> None:
        # As Uvicorn writes them before the API takes its log over: no times.
        self.api.append(_Line(t, "INFO:     Started server process [1]"))
        self.api.append(_Line(t, "INFO:     Waiting for application startup."))
        self.api_line(t + 400, "INFO", "uvicorn.error", "Application startup complete.")
        self.api.append(
            _Line(
                t + 401, "INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)"
            )
        )

    def uuid(self) -> str:
        h = f"{self.rand.getrandbits(128):032x}"
        return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"

    def submit_job(self, t: int, client: str, burst: bool) -> None:
        r = self.rand
        service = "csnp" if r.random() < 0.6 else "refmap" if r.random() < 0.9 else "tools"
        if burst and r.random() < 0.25:
            self.api_request(t, client, "POST", "/api/v1/jobs", 503, r.uniform(3, 9), routine=False)
            if r.random() < 0.3:
                self.api_line(
                    t + 5,
                    "WARNING",
                    "panther_api.jobs.runner",
                    f"Refused a {service} job: the queue is full, with 12 jobs running or "
                    "waiting and a cap of 8 waiting",
                )
            return
        invalid = r.random() < 0.05
        self.api_request(
            t,
            client,
            "POST",
            "/api/v1/jobs",
            422 if invalid else 202,
            r.uniform(40 if burst else 15, 220 if burst else 70),
            routine=False,
        )
        if invalid or _within(t, OUTAGE):
            return

        job_id = self.uuid()
        summary, ran, waited = "", 0.0, 0.0
        if service == "csnp":
            residues = int(r.uniform(120, 4800 if burst else 1600))
            subs = int(r.uniform(1, 60 if burst else 12))
            species = r.choice(("HUMAN", "HUMAN", "MOUSE", "YEAST"))
            summary = (
                f", {species}, {residues} residues, {subs} substitution{'' if subs == 1 else 's'}"
            )
            ran = 8 + residues / 60 + r.uniform(0, 10)
            waited = r.uniform(5, 90) if burst else r.uniform(0, 0.4)
        elif service == "refmap":
            ids = int(r.uniform(1, 4000))
            summary = (
                f", {r.choice(('HUMAN', 'MOUSE', 'ARATH'))}, {ids} ID{'' if ids == 1 else 's'}"
            )
            ran = 0.05 + ids / 3000 + r.uniform(0, 0.3)
            waited = r.uniform(1, 40) if burst else r.uniform(0, 0.1)
        else:
            ran = r.uniform(0.2, 0.6)

        done = t + int((waited + ran) * 1000)
        if done >= DAY_END:
            return
        lost = done >= OUTAGE[0] and t < OUTAGE[0]
        run_start = t + int(waited * 1000)
        if not lost:
            self.runs.append((run_start, done))
        elif run_start < OOM_AT:
            self.runs.append((run_start, OOM_AT))
        self.poll(job_id, client, t, done, lost)
        if lost:
            return
        head = f"Job {job_id} {service}{summary}"
        timing = f"waited {waited:.1f} s, ran {ran:.1f} s"
        if service == "csnp" and r.random() < 0.04:
            self.api_line(
                done,
                "INFO",
                "panther_api.jobs.runner",
                f"{head}: failed 422, the engine couldn't process the input, {timing}",
            )
        else:
            self.api_line(done, "INFO", "panther_api.jobs.runner", f"{head}: succeeded, {timing}")

    def poll(self, job_id: str, client: str, submitted: int, done: int, lost: bool) -> None:
        """The site polls a job every 3 s until it's done; a job lost in the outage until a 404."""
        path = f"/api/v1/jobs/{job_id}"
        t = submitted + 1000
        for _ in range(60):
            if lost and t >= OUTAGE[1]:
                self.api_request(t, client, "GET", path, 404, self.rand.uniform(2, 6), routine=True)
                return
            self.api_request(t, client, "GET", path, 200, self.rand.uniform(2, 12), routine=True)
            if not lost and t >= done:
                return
            t += 3000 if not _within(t, OUTAGE) else 30_000


def generate_sample() -> list[tuple[str, str]]:
    """The sample files, as (name, text): the web container's log, the API's, Docker's events and
    `docker inspect`."""
    day = _Day()
    r = day.rand

    boot = DAY_START - 120_000
    for service, cid in (("api", API_ID), ("web", WEB_ID)):
        day.event(boot, "create", service, cid)
        day.event(boot + 300, "start", service, cid)
    day.startup(boot + 500)
    # The outage: out of memory, killed, and started again by hand 25 minutes later.
    day.event(OOM_AT, "oom", "api", API_ID)
    day.event(DIED_AT, "die", "api", API_ID, exitCode="137")
    day.event(RESTARTED_AT, "start", "api", API_ID)
    day.startup(OUTAGE[1] - 500)

    for minute in range(DAY_START, DAY_END, 60_000):
        hour = _dt(minute).hour
        busy = 1.0 if 14 <= hour <= 23 else 0.45
        burst = _within(minute, BURST)
        pages = round((1 + r.random() * 3) * busy)
        for _ in range(pages):
            t = minute + r.randrange(60_000)
            client = r.choice(CLIENTS)
            day.access(t, client, "GET", "/", 200, 612, r.uniform(0.0005, 0.002), "-")
            day.access(
                t + 40,
                client,
                "GET",
                "/assets/index-3f9a1c.js",
                200,
                412_331,
                r.uniform(0.002, 0.03),
                "-",
            )
            day.access(
                t + 45,
                client,
                "GET",
                "/assets/index-8b2e7d.css",
                200,
                38_120,
                r.uniform(0.001, 0.01),
                "-",
            )
            day.api_request(
                t + 300, client, "GET", "/api/v1/versions", 200, r.uniform(2, 8), routine=True
            )
        if r.random() < 0.3:
            t = minute + r.randrange(60_000)
            day.access(
                t,
                r.choice(SCANNERS),
                "GET",
                r.choice(("/wp-login.php", "/.env", "/admin/config.php")),
                404,
                153,
                r.uniform(0.0002, 0.001),
                "-",
            )
        if r.random() < 0.5:
            day.api_request(
                minute + r.randrange(60_000),
                r.choice(CLIENTS),
                "GET",
                "/api/v1/health",
                200,
                r.uniform(1, 4),
                routine=True,
            )
        jobs = round((0.6 + r.random() * 1.2) * busy) + (5 if burst else 0)
        for _ in range(jobs):
            day.submit_job(minute + r.randrange(60_000), r.choice(CLIENTS), burst)

    # One unexpected failure, with its traceback.
    day.runs.append((CRASH - 12_700, CRASH))
    day.api.append(
        _Line(
            CRASH,
            "\n".join(
                (
                    f"{_iso(CRASH)} ERROR panther_api.jobs.runner: Job {day.uuid()} csnp, HUMAN, 912 residues, "
                    "4 substitutions: failed 500, waited 0.1 s, ran 12.7 s",
                    "Traceback (most recent call last):",
                    '  File "/opt/venv/lib/python3.13/site-packages/panther_engine/csnp/psep.py", line 211, in trace_back',
                    "    node = tree.nodes[label]",
                    "KeyError: 'AN143'",
                )
            ),
        )
    )

    def text(lines: list[_Line]) -> str:
        return "\n".join(line.text for line in sorted(lines, key=lambda line: line.t)) + "\n"

    return [
        ("sample-web.log", text(day.nginx)),
        ("sample-api.log", text(day.api)),
        ("sample-events.log", text(day.events)),
        ("sample-inspect.json", json.dumps(_inspect(), indent=2)),
        ("sample-stats.log", text(_stats(day.runs))),
    ]


def _go_size(n: float, base: int, units: tuple[str, ...]) -> str:
    """Sizes as Docker prints them (go-units: `%.4g` and a unit): `412.3MiB`, `1.2MB`."""
    i = 0
    while n >= base and i < len(units) - 1:
        n /= base
        i += 1
    return f"{n:.4g}{units[i]}"


def _binary(n: float) -> str:
    return _go_size(n, 1024, ("B", "KiB", "MiB", "GiB", "TiB"))


def _decimal(n: float) -> str:
    return _go_size(n, 1000, ("B", "kB", "MB", "GB", "TB"))


def _stat_line(
    t: int, service: str, cid: str, cpu: float, mem: float, limit: int, pids: int
) -> _Line:
    """One `docker stats --format '{{json .}}'` line, with the time `record-stats` puts in front."""
    since = (t - DAY_START) / 1000
    obj = {
        "BlockIO": f"{_decimal(since * 900)} / {_decimal(since * 40)}",
        "CPUPerc": f"{cpu:.2f}%",
        "Container": cid[:12],
        "ID": cid[:12],
        "MemPerc": f"{mem / limit * 100:.2f}%",
        "MemUsage": f"{_binary(mem)} / {_binary(limit)}",
        "Name": f"panther-scoring-services-{service}-1",
        "NetIO": f"{_decimal(since * 2400)} / {_decimal(since * 9100)}",
        "PIDs": str(pids),
    }
    stamp = _dt(t).strftime("%Y-%m-%dT%H:%M:%SZ")
    return _Line(t, f"{stamp} {json.dumps(obj, separators=(',', ':'))}")


def _stats(runs: list[tuple[int, int]]) -> list[_Line]:
    """Every 30 s for both containers. The API's CPU follows the jobs running (about 65% each, on
    four cores); its memory leaks from 02:30 until the kernel kills it at the limit, and it has no
    stats while it's down."""
    r = random.Random(4112026)
    starts = sorted(a for a, _ in runs)
    ends = sorted(b for _, b in runs)
    lines: list[_Line] = []
    for t in range(DAY_START, DAY_END, STATS_EVERY_MS):
        running = bisect.bisect_right(starts, t) - bisect.bisect_right(ends, t)
        if not DIED_AT <= t < RESTARTED_AT:
            cpu = min(400.0, max(0.1, 0.8 + 65 * running + r.uniform(-4, 6)))
            base = (330 if t >= RESTARTED_AT else 400) * MIB + r.uniform(-20, 20) * MIB
            mem = base + 22 * MIB * running
            if LEAK_FROM <= t < DIED_AT:
                mem += (t - LEAK_FROM) / (OOM_AT - LEAK_FROM) * (API_LIMIT * 0.995 - mem)
            lines.append(_stat_line(t, "api", API_ID, cpu, mem, API_LIMIT, 6 + running))
        web_cpu = r.uniform(0.1, 1.2) + 0.15 * running
        web_mem = r.uniform(18, 24) * MIB
        lines.append(_stat_line(t, "web", WEB_ID, web_cpu, web_mem, WEB_LIMIT, 9))
    return lines


def _inspect() -> list[dict[str, object]]:
    def container(service: str, cid: str, started: int) -> dict[str, object]:
        return {
            "Id": cid,
            "Created": _iso(DAY_START - 120_000),
            "Name": f"/panther-scoring-services-{service}-1",
            "RestartCount": 0,
            "State": {
                "Status": "running",
                "Running": True,
                "Paused": False,
                "Restarting": False,
                "OOMKilled": False,
                "Dead": False,
                "Pid": 4242,
                "ExitCode": 0,
                "Error": "",
                "StartedAt": _iso(started),
                "FinishedAt": "0001-01-01T00:00:00Z",
            },
            "Config": {
                "Image": f"panther-scoring-services-{service}",
                "Labels": {
                    "com.docker.compose.project": "panther-scoring-services",
                    "com.docker.compose.service": service,
                },
            },
        }

    return [
        container("api", API_ID, OUTAGE[1] - 600),
        container("web", WEB_ID, DAY_START - 119_700),
    ]
