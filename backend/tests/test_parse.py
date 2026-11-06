"""The parsers, on lines in the exact shapes the programs write."""

import json
from datetime import UTC, datetime

from services_dashboard.parse.api_log import Untimed, parse_api_line
from services_dashboard.parse.docker import IGNORED, parse_event, parse_inspect
from services_dashboard.parse.lines import parse_text
from services_dashboard.parse.nginx import parse_access, parse_error, parse_time_local
from services_dashboard.parse.stats import parse_size
from services_dashboard.records import DockerEvent, Job, Log, Request, Stat


def ms(*args: int) -> int:
    return int(datetime(*args, tzinfo=UTC).timestamp() * 1000)  # pyright: ignore[reportArgumentType]


UA = "Mozilla/5.0 (X11; Linux x86_64)"


class TestApiLog:
    def test_job_that_succeeded(self) -> None:
        line = (
            "2026-11-04T17:02:54.611Z INFO panther_api.jobs.runner: Job 9c1e0d4a csnp, HUMAN, "
            "347 residues, 3 substitutions: succeeded, waited 0.0 s, ran 41.2 s"
        )
        job = parse_api_line(line, "f")
        assert isinstance(job, Job)
        assert job.t == ms(2026, 11, 4, 17, 2, 54) + 611
        assert (job.service, job.summary, job.outcome, job.status) == (
            "csnp",
            "HUMAN, 347 residues, 3 substitutions",
            "succeeded",
            None,
        )
        assert (job.waited_s, job.ran_s) == (0.0, 41.2)

    def test_job_refused_for_its_input_whose_outcome_has_a_comma(self) -> None:
        line = (
            "2026-11-04T17:03:00.000Z INFO panther_api.jobs.runner: Job ab12 refmap, HUMAN, 12 IDs: "
            "failed 422, the engine couldn't process the input, waited 0.1 s, ran 0.4 s"
        )
        job = parse_api_line(line, "f")
        assert isinstance(job, Job)
        assert job.summary == "HUMAN, 12 IDs"
        assert job.status == 422
        assert job.outcome_text == "failed 422, the engine couldn't process the input"

    def test_repeated_server_error_and_job_without_summary(self) -> None:
        repeated = parse_api_line(
            "2026-11-04T17:04:00.000Z ERROR panther_api.jobs.runner: Job cd34 csnp, HUMAN, 9 residues, "
            "1 substitution: failed 500, waited 0.0 s, ran 2.0 s (same error as job ab12, seen 3 times "
            "since 2026-11-04T17:00:00Z)",
            "f",
        )
        assert isinstance(repeated, Job)
        assert (repeated.level, repeated.status) == ("ERROR", 500)
        tools = parse_api_line(
            "2026-11-04T17:05:00.000Z INFO panther_api.jobs.runner: Job ef56 tools: succeeded, "
            "waited 0.0 s, ran 0.3 s",
            "f",
        )
        assert isinstance(tools, Job)
        assert (tools.service, tools.summary) == ("tools", "")

    def test_uvicorn_access_line_is_a_request_without_its_query(self) -> None:
        r = parse_api_line(
            "2026-11-04T17:03:10.002Z INFO uvicorn.access: 172.18.0.1:51234 - "
            '"GET /api/v1/jobs/ab12?x=1 HTTP/1.1" 404',
            "f",
        )
        assert isinstance(r, Request)
        assert (r.source, r.method, r.path, r.status, r.duration_ms) == (
            "api",
            "GET",
            "/api/v1/jobs/ab12",
            404,
            None,
        )

    def test_other_lines_and_untimed_ones(self) -> None:
        log = parse_api_line(
            "2026-11-04T17:06:00.000Z WARNING asyncio: Task exception was never retrieved", "f"
        )
        assert isinstance(log, Log)
        assert (log.level, log.logger) == ("WARNING", "asyncio")
        assert parse_api_line("INFO:     Started server process [1]", "f") == Untimed(
            "INFO", "uvicorn", "Started server process [1]"
        )
        assert parse_api_line("Traceback (most recent call last):", "f") is None


class TestNginx:
    def test_time_local_with_its_offset(self) -> None:
        assert parse_time_local("06/Nov/2026:05:00:01 +0000") == ms(2026, 11, 6, 5, 0, 1)
        assert parse_time_local("05/Nov/2026:21:00:01 -0800") == ms(2026, 11, 6, 5, 0, 1)
        assert parse_time_local("06/Foo/2026:05:00:01 +0000") is None

    def test_main_format_has_no_times(self) -> None:
        r = parse_access(
            f'203.0.113.5 - - [06/Nov/2026:05:00:01 +0000] "GET /api/v1/jobs/ab12?poll=1 HTTP/1.1" '
            f'200 512 "-" "{UA}" "-"',
            "f",
        )
        assert r is not None
        assert (r.path, r.status, r.bytes, r.duration_ms, r.client) == (
            "/api/v1/jobs/ab12",
            200,
            512,
            None,
            "203.0.113.5",
        )

    def test_combined_and_appended_times(self) -> None:
        combined = parse_access(
            f'203.0.113.5 - - [06/Nov/2026:05:00:01 +0000] "GET / HTTP/1.1" 304 0 "-" "{UA}"', "f"
        )
        assert combined is not None and combined.status == 304
        timed = parse_access(
            f'203.0.113.5 - - [06/Nov/2026:05:00:01 +0000] "POST /api/v1/jobs HTTP/1.1" 202 88 '
            f'"-" "{UA}" "-" rt=0.125 urt="0.050, 0.070"',
            "f",
        )
        assert timed is not None and (timed.duration_ms, timed.upstream_ms) == (125.0, 50.0)

    def test_malformed_request_still_counts(self) -> None:
        r = parse_access(
            '198.51.100.9 - - [06/Nov/2026:05:00:01 +0000] "\\x16\\x03\\x01" 400 157 "-" "-"', "f"
        )
        assert r is not None and (r.method, r.path, r.status) == ("INVALID", "-", 400)

    def test_error_log(self) -> None:
        log = parse_error(
            "2026/11/06 05:00:01 [error] 29#29: *1 connect() failed (111: Connection refused)", "f"
        )
        assert log is not None
        assert (log.t, log.level, log.source, log.message) == (
            ms(2026, 11, 6, 5, 0, 1),
            "ERROR",
            "nginx",
            "connect() failed (111: Connection refused)",
        )
        warn = parse_error("2026/11/06 05:00:01 [warn] 29#29: x", "f")
        assert warn is not None and warn.level == "WARNING"


def _event(action: str, **attrs: str) -> str:
    return json.dumps(
        {
            "Type": "container",
            "Action": action,
            "time": 1,
            "timeNano": 1_762_405_201_123_456_789,
            "Actor": {
                "ID": "abc123",
                "Attributes": {"name": "proj-api-1", "com.docker.compose.service": "api", **attrs},
            },
        }
    )


class TestDocker:
    def test_container_event(self) -> None:
        e = parse_event(_event("die", exitCode="137"), "f")
        assert isinstance(e, DockerEvent)
        assert (e.t, e.container, e.service, e.action, e.exit_code) == (
            1_762_405_201_123,
            "proj-api-1",
            "api",
            "die",
            137,
        )

    def test_noise_and_other_types_are_ignored_not_unparsed(self) -> None:
        assert parse_event(_event("exec_start: curl -f localhost"), "f") is IGNORED
        assert (
            parse_event(json.dumps({"Type": "network", "Action": "connect", "time": 1}), "f")
            is IGNORED
        )
        assert parse_event("{not json", "f") is None

    def test_inspect(self) -> None:
        text = json.dumps(
            [
                {
                    "Id": "abc",
                    "Name": "/proj-api-1",
                    "RestartCount": 2,
                    "Created": "2026-11-04T00:00:00.123456789Z",
                    "State": {
                        "Status": "exited",
                        "OOMKilled": True,
                        "ExitCode": 137,
                        "StartedAt": "2026-11-04T01:00:00Z",
                        "FinishedAt": "0001-01-01T00:00:00Z",
                        "Health": {"Status": "unhealthy"},
                    },
                    "Config": {
                        "Image": "proj-api",
                        "Labels": {"com.docker.compose.service": "api"},
                    },
                }
            ]
        )
        [c] = parse_inspect(text, "f") or []
        assert (
            c.name,
            c.service,
            c.status,
            c.oom_killed,
            c.exit_code,
            c.restart_count,
            c.health,
        ) == ("proj-api-1", "api", "exited", True, 137, 2, "unhealthy")
        assert c.created == ms(2026, 11, 4) + 123
        assert c.finished_at is None
        assert parse_inspect("[1, 2]", "f") is None


def _stat(mem: str = "512MiB / 2GiB", cpu: str = "12.34%") -> str:
    return json.dumps(
        {
            "BlockIO": "0B / 0B",
            "CPUPerc": cpu,
            "Container": "3f1c9a0b7e2d",
            "ID": "3f1c9a0b7e2d",
            "MemPerc": "25.00%",
            "MemUsage": mem,
            "Name": "panther-scoring-services-api-1",
            "NetIO": "1.2kB / 3.4kB",
            "PIDs": "12",
        },
        separators=(",", ":"),
    )


class TestStats:
    def test_sizes_in_binary_and_decimal_units(self) -> None:
        assert parse_size("512MiB") == 512 * 1024**2
        assert parse_size("1.953GiB") == round(1.953 * 1024**3)
        assert parse_size("12.1kB") == 12_100
        assert parse_size("3MB") == 3_000_000
        assert parse_size("0B") == 0
        assert parse_size("--") is None

    def test_a_recorded_line(self) -> None:
        parsed = parse_text(f"2026-11-04T03:00:00Z {_stat()}", "f")
        [s] = parsed.stats
        assert isinstance(s, Stat)
        assert (s.t, s.container, s.container_id, s.service, s.cpu_pct) == (
            ms(2026, 11, 4, 3),
            "panther-scoring-services-api-1",
            "3f1c9a0b7e2d",
            "api",
            12.34,
        )
        assert (s.mem_bytes, s.mem_limit_bytes) == (512 * 1024**2, 2 * 1024**3)
        assert parsed.records == []
        assert parsed.summary is not None
        assert (parsed.summary.format, parsed.summary.counts.stat, parsed.summary.first_t) == (
            "stats",
            1,
            ms(2026, 11, 4, 3),
        )

    def test_without_a_time_it_is_unparsed(self) -> None:
        parsed = parse_text(_stat(), "f")
        assert parsed.stats == []
        assert parsed.summary is not None
        assert (parsed.summary.format, parsed.summary.unparsed) == ("unknown", 1)

    def test_a_stopped_container_is_understood_but_not_kept(self) -> None:
        parsed = parse_text(f"2026-11-04T03:00:00Z {_stat('-- / --', '--')}", "f")
        assert parsed.stats == []
        assert parsed.summary is not None and parsed.summary.unparsed == 0


class TestParseText:
    def test_mixed_web_container_log(self) -> None:
        text = "\n".join(
            [
                '203.0.113.5 - - [06/Nov/2026:05:00:01 +0000] "GET / HTTP/1.1" 200 2 "-" "ua" "-"',
                "2026/11/06 05:00:02 [error] 29#29: *2 connect() failed",
                '203.0.113.5 - - [06/Nov/2026:05:00:03 +0000] "GET /api/v1/health HTTP/1.1" 502 2 "-" "ua" "-"',
            ]
        )
        parsed = parse_text(text, "f")
        assert [type(r).__name__ for r in parsed.records] == ["Request", "Log", "Request"]
        assert parsed.summary is not None
        assert (parsed.summary.format, parsed.summary.unparsed, parsed.summary.counts.request) == (
            "nginx",
            0,
            2,
        )

    def test_docker_timestamps_are_stripped_and_date_untimed_lines(self) -> None:
        text = (
            "2026-11-06T05:00:00.123456789Z INFO:     Started server process [1]\r\n"
            "2026-11-06T05:00:01.000000000Z 2026-11-06T05:00:01.000Z INFO uvicorn.error: Application startup complete."
        )
        records = parse_text(text, "f").records
        assert [r.t for r in records] == [ms(2026, 11, 6, 5, 0, 0) + 123, ms(2026, 11, 6, 5, 0, 1)]

    def test_untimed_lines_take_the_next_time(self) -> None:
        text = (
            "INFO:     Started server process [1]\nINFO:     Waiting for application startup.\n"
            "2026-11-06T05:00:01.000Z INFO uvicorn.error: Application startup complete."
        )
        parsed = parse_text(text, "f")
        assert [r.t for r in parsed.records] == [ms(2026, 11, 6, 5, 0, 1)] * 3

    def test_traceback_attaches_to_the_error_before_it(self) -> None:
        text = (
            "2026-11-06T05:00:01.000Z ERROR panther_api.jobs.runner: Job ab12 csnp, HUMAN, 9 residues, "
            "1 substitution: failed 500, waited 0.0 s, ran 1.0 s\nTraceback (most recent call last):\n"
            "KeyError: 'AN143'"
        )
        parsed = parse_text(text, "f")
        [job] = parsed.records
        assert isinstance(job, Job)
        assert job.detail == "Traceback (most recent call last):\nKeyError: 'AN143'"
        assert parsed.summary is not None and parsed.summary.unparsed == 0

    def test_unparsed_lines_are_counted_and_sampled(self) -> None:
        parsed = parse_text("hello\nworld", "f")
        assert parsed.summary is not None
        assert (
            parsed.summary.format,
            parsed.summary.unparsed,
            parsed.summary.unparsed_samples,
        ) == ("unknown", 2, ["hello", "world"])


def test_the_fastapi_banner_and_blank_lines_are_understood():
    # The start of a real `docker logs -t` of the scoring API's container (fastapi run, 0.162).
    text = "\n".join(
        (
            "2026-10-31T04:14:39.060994041Z ",
            "2026-10-31T04:14:39.087541115Z  ⚡️ Starting FastAPI in production mode",
            "2026-10-31T04:14:39.116110576Z  ",
            "2026-10-31T04:14:39.118629541Z  🐍 Using import string: panther_api.main:app",
            "2026-10-31T04:14:39.122413640Z  🌐 Server started at http://0.0.0.0:8000",
            "2026-10-31T04:14:39.123430167Z     Documentation at http://0.0.0.0:8000/docs",
            "2026-10-31T04:14:39.124584242Z   Logs:",
            "2026-10-31T04:14:39.976704716Z INFO:     Started server process [1]",
            "2026-10-31T04:14:53.982920932Z INFO:     Shutting down",
        )
    )
    parsed = parse_text(text, "f1")
    assert parsed.summary is not None
    assert parsed.summary.unparsed == 0
    assert parsed.summary.format == "api"
    assert [r.message for r in parsed.records if isinstance(r, Log)] == [
        "Started server process [1]",
        "Shutting down",
    ]
