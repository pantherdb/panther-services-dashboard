"""Aggregation and the joining of sources, on small hand-made records."""

from services_dashboard.aggregate import (
    concurrency_series,
    endpoint_stats,
    job_stats,
    latency_heatmap,
    pick_bucket_ms,
    quantile,
    resource_series,
    route_of,
    traffic_series,
    window_range,
)
from services_dashboard.correlate import (
    classify_failures,
    incidents,
    job_story,
    markers,
    origin_rows,
    resource_notes,
)
from services_dashboard.records import DockerEvent, Job, Log, LogSource, Request, Stat


def req(
    t: int,
    status: int,
    path: str = "/api/v1/jobs",
    method: str = "POST",
    source: LogSource = "nginx",
    duration: float | None = None,
    client: str | None = "203.0.113.5",
) -> Request:
    return Request("f", t, source, method, path, status, 0, duration, None, client)


def job(service: str, ran: float, status: int | None = None, job_id: str = "j1", t: int = 0) -> Job:
    return Job(
        "f",
        t,
        "INFO" if status is None or status < 500 else "ERROR",
        job_id,
        service,
        "",
        "succeeded" if status is None else "failed",
        status,
        "succeeded" if status is None else f"failed {status}",
        1.0,
        ran,
    )


def event(t: int, action: str, exit_code: int | None = None) -> DockerEvent:
    return DockerEvent("f", t, "abc", "proj-api-1", "api", action, exit_code, None, None)


MIB = 1024**2


def stat(t: int, mem_mib: float, cpu: float = 10.0, service: str = "api") -> Stat:
    return Stat("f", t, "abc", f"proj-{service}-1", service, cpu, int(mem_mib * MIB), 2048 * MIB)


class TestAggregate:
    def test_quantile_and_buckets(self) -> None:
        assert quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5) == 5
        assert quantile([], 0.5) is None
        assert pick_bucket_ms(3_600_000) == 30_000
        assert window_range("1h", (0, 10_000_000)) == (6_400_000, 10_000_000)
        assert window_range("all", (5, 10)) == (5, 10)

    def test_every_bucket_is_present_with_null_rates_when_empty(self) -> None:
        points = traffic_series(
            [req(0, 200, duration=10), req(1_000, 500, duration=30), req(25_000, 404)],
            0,
            29_999,
            10_000,
        )
        assert [p.total for p in points] == [2, 0, 1]
        assert (points[0].server_error_pct, points[0].p50, points[0].p95) == (50.0, 10, 30)
        assert (points[1].server_error_pct, points[1].p50) == (None, None)

    def test_jobs_are_counted_in_the_bucket_they_finished(self) -> None:
        points = traffic_series(
            [], 0, 29_999, 10_000, [job("csnp", 1, t=500), job("csnp", 1, 500, t=21_000)]
        )
        assert [(p.jobs, p.failed_jobs) for p in points] == [(1, 0), (0, 0), (1, 1)]

    def test_latency_heatmap_bins_are_trimmed_to_what_was_seen(self) -> None:
        heat = latency_heatmap(
            [
                req(0, 200, duration=3),
                req(1, 200, duration=7),
                req(2, 200, duration=7),
                req(10_000, 200, duration=120),
                req(10_001, 200),
            ],
            0,
            19_999,
            10_000,
        )
        assert heat is not None
        assert [b.label for b in heat.bins] == [
            "under 5 ms",
            "5 to 10 ms",
            "10 to 25 ms",
            "25 to 50 ms",
            "50 to 100 ms",
            "100 to 250 ms",
        ]
        assert [(c.t, c.bin, c.count) for c in heat.cells] == [(0, 0, 1), (0, 1, 2), (10_000, 5, 1)]
        assert heat.max_count == 2

        slow = latency_heatmap(
            [req(0, 200, duration=d) for d in (700, 1_500, 12_000)], 0, 9_999, 10_000
        )
        assert slow is not None
        assert [(b.label, b.lo_ms, b.hi_ms) for b in slow.bins] == [
            ("500 ms to 1 s", 500, 1000),
            ("1 to 2.5 s", 1000, 2500),
            ("2.5 to 5 s", 2500, 5000),
            ("5 to 10 s", 5000, 10000),
            ("over 10 s", 10000, None),
        ]
        assert latency_heatmap([req(0, 200)], 0, 9_999, 10_000) is None

    def test_jobs_running_and_waiting_are_averaged_over_each_bucket(self) -> None:
        # Waited 1 s, ran 30 s, finished at 60 s: waiting 29 to 30 s, running 30 to 60 s.
        [first, second] = concurrency_series([job("csnp", 30, t=60_000)], 0, 119_999, 60_000)
        assert (first.running, first.waiting) == (0.5, round(1 / 60, 3))
        assert (second.running, second.waiting) == (0.0, 0.0)

    def test_resource_series_leaves_gaps_where_there_are_no_stats(self) -> None:
        points = resource_series(
            [stat(0, 100, cpu=5), stat(5_000, 300, cpu=50)], ["proj-api-1"], 0, 29_999, 10_000
        )
        assert [(p.cpu_pct, p.mem_bytes) for p in points] == [
            (50, 300 * MIB),
            (None, None),
            (None, None),
        ]

    def test_routes_group_ids_and_assets(self) -> None:
        assert route_of("/api/v1/jobs/9c1e0d4a-1111-2222-3333-444455556666") == "/api/v1/jobs/{id}"
        assert route_of("/assets/index-3f9a1c.js") == "/assets/*"
        rows = endpoint_stats(
            [
                req(0, 200, "/api/v1/jobs/9c1e0d4a-1111-2222-3333-444455556666", "GET"),
                req(0, 404, "/api/v1/jobs/0f2e0d4a-1111-2222-3333-444455556666", "GET"),
            ]
        )
        assert (rows[0].route, rows[0].requests, rows[0].error_pct) == (
            "/api/v1/jobs/{id}",
            2,
            50.0,
        )

    def test_job_stats_split_failures(self) -> None:
        [row] = job_stats([job("csnp", 10), job("csnp", 20, 422), job("csnp", 30, 500)])
        assert (row.jobs, row.succeeded, row.input_errors, row.server_errors, row.ran_p50) == (
            3,
            1,
            1,
            1,
            20,
        )


class TestErrorOrigin:
    def test_where_each_failure_came_from(self) -> None:
        nginx = [
            req(1_000, 502),  # no API line: unreachable
            req(10_000, 503),  # API answered 503: refused
            req(20_000, 500, "/api/v1/versions", "GET"),  # API answered 500: API error
            req(30_000, 504),  # timeout
            req(40_000, 499),  # client gave up
            req(50_000, 500, "/index.html", "GET"),  # not the API
        ]
        api = [req(10_001, 503, source="api"), req(20_001, 500, "/api/v1/versions", "GET", "api")]
        assert [f.origin for f in classify_failures(nginx, api)] == [
            "api_unreachable",
            "api_refused",
            "api_error",
            "api_slow",
            "client_gave_up",
            "site_error",
        ]

    def test_another_requests_success_on_the_same_path_is_not_a_match(self) -> None:
        # Every POST /jobs shares a path: the 202 next to it is someone else's.
        nginx = [req(10_000, 503)]
        api = [req(9_999, 202, source="api"), req(10_500, 503, source="api")]
        assert [f.origin for f in classify_failures(nginx, api)] == ["api_refused"]

    def test_rows_count_and_give_an_example(self) -> None:
        rows = origin_rows(classify_failures([req(1_000, 502), req(2_000, 502)], []))
        assert (rows[0].label, rows[0].count) == ("API unreachable", 2)
        assert rows[0].example == "POST /api/v1/jobs → 502 at 00:00:01 UTC"


class TestIncidents:
    def test_close_signals_merge_into_one_incident_with_the_container_story(self) -> None:
        failures = classify_failures([req(60_000, 502), req(120_000, 502)], [])
        logs = [
            Log("f", 61_000, "nginx", "ERROR", "nginx", "connect() failed"),
            Log("f", 400_000, "api", "INFO", "uvicorn.error", "Application startup complete."),
        ]
        found = incidents(failures, [], logs, [event(59_000, "oom"), event(59_500, "die", 137)])
        [incident] = found
        assert incident.title == "API unreachable for 6 min"
        assert incident.tone == "fail"
        assert incident.summary == [
            "2 requests failed through nginx: 2 API unreachable.",
            "nginx logged 1 error.",
        ]
        assert incident.failed_requests == 2
        assert incident.sources == ["api", "nginx", "docker"]
        assert [(e.t, e.source, e.text) for e in incident.events] == [
            (59_000, "docker", "Container api ran out of memory"),
            (59_500, "docker", "Container api stopped (exit 137)"),
            (60_000, "nginx", "First failed request: POST /api/v1/jobs → 502, API unreachable"),
            (61_000, "nginx", "nginx logged: connect() failed"),
            (400_000, "api", "The API started"),
        ]

    def test_the_memory_peak_before_a_container_died_is_evidence(self) -> None:
        stats = [stat(i * 60_000, 400 + i * 150) for i in range(10)]
        [incident] = incidents(
            [], [], [], [event(600_000, "oom"), event(600_500, "die", 137)], stats
        )
        assert incident.title.startswith("Container stopped")
        assert incident.sources == ["docker"]
        peak = next(e for e in incident.events if "peaked" in e.text)
        assert (peak.t, peak.text, peak.tone) == (
            540_000,
            "api's memory peaked at 1.71 GiB, 85% of its 2 GiB limit",
            "warn",
        )

    def test_far_apart_signals_are_separate_and_restarts_alone_are_not_incidents(self) -> None:
        failures = classify_failures([req(0, 502), req(3_600_000, 502)], [])
        logs = [
            Log("f", 7_200_000, "api", "INFO", "uvicorn.error", "Application startup complete.")
        ]
        assert len(incidents(failures, [], logs, [])) == 2

    def test_markers(self) -> None:
        found = markers(
            [event(1, "die", 137), event(2, "create")],
            [Log("f", 3, "api", "INFO", "uvicorn.error", "Application startup complete.")],
        )
        assert [(m.label, m.tone) for m in found] == [
            ("api stopped (exit 137)", "fail"),
            ("API started", "active"),
        ]


class TestResourceNotes:
    def test_memory_climbing_before_an_out_of_memory_kill(self) -> None:
        stats = [stat(i * 60_000, 400) for i in range(5)] + [
            stat((5 + i) * 60_000, 400 + i * 200) for i in range(9)
        ]
        notes = resource_notes(
            stats, [], [event(14 * 60_000, "oom"), event(14 * 60_000 + 500, "die", 137)]
        )
        memory = next(n for n in notes if "memory rose" in n.text)
        assert memory.tone == "fail"
        assert memory.text == (
            "api's memory rose from 400 MiB to 1.95 GiB, 98% of its 2 GiB limit, in the "
            "8 min before it ran out of memory at 00:14:00."
        )

    def test_jobs_slower_while_the_cpu_was_busy(self) -> None:
        calm = [stat(i * 60_000, 400, cpu=40) for i in range(10)]
        busy = [stat((10 + i) * 60_000, 400, cpu=380) for i in range(10)]
        jobs = [job("csnp", 10, job_id=f"c{i}", t=i * 60_000 + 20_000) for i in range(1, 9)] + [
            job("csnp", 40, job_id=f"b{i}", t=(10 + i) * 60_000 + 50_000) for i in range(1, 9)
        ]
        notes = resource_notes(calm + busy, jobs, [])
        assert (
            "csnp jobs ran 4.0 times longer while api's CPU was above 150%: median 40 s "
            "against 10 s, over 8 and 8 jobs."
        ) in [n.text for n in notes]
        peak = next(n for n in notes if n.text.startswith("CPU on api"))
        assert (
            peak.text == "CPU on api peaked at 380% (3.8 cores) at 00:10:00, with 0 jobs running."
        )


class TestJobStory:
    def test_a_job_lost_in_a_restart(self) -> None:
        path = "/api/v1/jobs/j1"
        records = [
            req(0, 202),
            req(1_000, 200, path, "GET"),
            event(2_000, "die", 137),
            Log("f", 60_000, "api", "INFO", "uvicorn.error", "Application startup complete."),
            req(61_000, 404, path, "GET"),
        ]
        story = job_story(records, "j1")
        assert story.job is None
        assert story.clients == ["203.0.113.5"]
        texts = [i.text for i in story.items]
        assert texts[0].startswith("Submitted: POST /api/v1/jobs → 202")
        assert "Container api stopped (exit 137)" in texts
        assert "the restart lost it" in texts[-1]

    def test_runs_of_the_same_poll_answer_are_one_line(self) -> None:
        path = "/api/v1/jobs/j1"
        records = [
            req(0, 202),
            *(req(1_000 + i * 3_000, 200, path, "GET", duration=5 + i) for i in range(4)),
            req(20_000, 404, path, "GET"),
        ]
        texts = [i.text for i in job_story(records, "j1").items if i.text.startswith("Polled")]
        assert texts == [
            "Polled 4 times until 00:00:10: 200 each in 5 to 8 ms, logged by nginx",
            "Polled: 404, logged by nginx",
        ]

    def test_a_finished_job(self) -> None:
        records = [
            req(0, 202),
            req(1_000, 200, "/api/v1/jobs/j1", "GET"),
            job("csnp", 41.2, t=2_000),
        ]
        story = job_story(records, "j1")
        assert story.job is not None
        assert story.items[-1].text == "Finished: succeeded, waited 1.0 s, ran 41.2 s"

    def test_what_the_api_container_used_while_the_job_ran(self) -> None:
        records = [job("csnp", 40, t=60_000)]
        stats = [stat(25_000, 900, cpu=95), stat(45_000, 1024, cpu=130), stat(90_000, 400, cpu=2)]
        [used] = [i for i in job_story(records, "j1", stats).items if i.source == "docker"]
        assert (used.t, used.text) == (
            20_000,
            "During the run, the API container used 95 to 130% CPU and 1 GiB of memory, "
            "50% of its limit.",
        )
