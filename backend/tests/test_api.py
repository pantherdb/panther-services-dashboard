"""The HTTP API, end to end, on the sample day and on uploads."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from services_dashboard import views
from services_dashboard.main import create_app
from services_dashboard.parse.lines import parse_text
from services_dashboard.record_stats import record, stamp
from services_dashboard.sample import BURST, generate_sample
from services_dashboard.store import Store


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app(store=Store())) as c:
        yield c


@pytest.fixture(scope="module")
def sample_store() -> Store:
    # Loaded once: reading the sample takes seconds, and these tests only read it.
    store = Store()
    views.load_sample(store)
    return store


@pytest.fixture
def sample(sample_store: Store) -> Iterator[TestClient]:
    with TestClient(create_app(store=sample_store)) as c:
        yield c


def test_the_sample_is_read_in_full_by_the_parsers() -> None:
    # The sample is real log text, so this also checks the parsers still read every shape it writes.
    for name, text in generate_sample():
        summary = parse_text(text, name).summary
        assert summary is not None
        assert summary.unparsed == 0, name
        assert summary.parsed > 0, name
        if name == "sample-stats.log":
            assert (summary.format, summary.counts.stat) == ("stats", summary.lines)


def test_the_sample_is_the_same_every_time() -> None:
    assert generate_sample() == generate_sample()


def test_empty_before_anything_is_loaded(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/files").json() == {"folder": None, "files": [], "hasSample": False}
    overview = client.get("/api/v1/overview").json()
    assert overview["hasData"] is False
    assert overview["range"] is None


def test_overview_finds_the_outage_and_where_requests_failed(sample: TestClient) -> None:
    o = sample.get("/api/v1/overview").json()
    assert o["hasData"] and o["source"] == "nginx" and o["sources"] == ["nginx", "api"]
    assert o["hasDurations"] is True
    titles = [i["title"] for i in o["incidents"]]
    assert "API unreachable for 25 min" in titles
    assert any(t.startswith("Job queue full") for t in titles)
    origins = {r["origin"]: r["count"] for r in o["origins"]}
    assert origins["api_unreachable"] > 50
    assert origins["api_refused"] > 10
    assert "api_error" not in origins
    assert {"api ran out of memory", "api stopped (exit 137)", "API started"} <= {
        m["label"] for m in o["markers"]
    }
    assert len(o["points"]) > 50
    assert o["problemCount"] > 0
    assert sum(p["jobs"] for p in o["points"]) == o["kpis"]["jobs"]
    assert 95 < o["kpis"]["memPeakPct"] < 100
    heat = o["latencyHeatmap"]
    assert heat["bins"][0]["label"] == "under 5 ms"
    assert sum(c["count"] for c in heat["cells"]) == o["kpis"]["requests"]


def test_the_outage_is_joined_up_from_all_three_sources(sample: TestClient) -> None:
    o = sample.get("/api/v1/overview").json()
    outage = next(i for i in o["incidents"] if i["title"] == "API unreachable for 25 min")
    assert outage["sources"] == ["api", "nginx", "docker"]
    assert outage["failedRequests"] > 50
    texts = [e["text"] for e in outage["events"]]
    assert texts[0].startswith("api's memory peaked at") and "of its 2 GiB limit" in texts[0]
    assert "Container api ran out of memory" in texts
    assert any(t.startswith("First failed request: GET /api/v1/jobs/{id} → 502") for t in texts)
    assert texts[-1] == "The API started"
    assert [e["t"] for e in outage["events"]] == sorted(e["t"] for e in outage["events"])


def test_counting_requests_from_the_api_instead(sample: TestClient) -> None:
    o = sample.get("/api/v1/overview", params={"source": "api", "window": "6h"}).json()
    assert o["source"] == "api"
    assert o["hasDurations"] is False
    assert o["latencyHeatmap"] is None


def test_jobs_and_a_lost_jobs_story(sample: TestClient) -> None:
    jobs = sample.get("/api/v1/jobs").json()
    assert {s["service"] for s in jobs["services"]} == {"csnp", "refmap", "tools"}
    timeline = sample.get(
        "/api/v1/timeline", params={"start": 0, "end": 2**62, "problemsOnly": True}
    ).json()
    lost = next(
        i
        for i in timeline["items"]
        if i["kind"] == "request" and "→ 404" in i["text"] and "/jobs/" in i["text"]
    )
    job_id = lost["text"].split(" ")[1].rsplit("/", 1)[1]
    story = sample.get(f"/api/v1/jobs/{job_id}").json()
    assert story["job"] is None
    assert "the restart lost it" in story["items"][-1]["text"]


def test_a_jobs_story_has_what_the_api_container_used(sample: TestClient) -> None:
    jobs = sample.get("/api/v1/jobs").json()["jobs"]
    busy = next(j for j in jobs if BURST[0] <= j["t"] < BURST[1] and j["ranS"] > 30)
    story = sample.get(f"/api/v1/jobs/{busy['jobId']}").json()
    [used] = [i for i in story["items"] if i["source"] == "docker"]
    assert used["text"].startswith("During the run, the API container used ")


def test_resources_join_the_stats_to_the_outage_and_the_jobs(sample: TestClient) -> None:
    r = sample.get("/api/v1/resources").json()
    assert r["hasData"] and r["hasStats"]
    assert [c["service"] for c in r["containers"]] == ["api", "web"]
    buckets = len(r["concurrency"])
    assert len(r["points"]) == 2 * buckets
    assert max(p["running"] for p in r["concurrency"]) > 1
    api_points = [p for p in r["points"] if p["container"] == "panther-scoring-services-api-1"]
    assert any(p["cpuPct"] is None for p in api_points), "no stats while the API was down"
    notes = [n["text"] for n in r["notes"]]
    assert any(
        n.startswith("api's memory rose from") and "before it ran out of memory at 03:09:58" in n
        for n in notes
    )
    assert any(n.startswith("csnp jobs ran") for n in notes)
    assert any(n.startswith("CPU on api peaked") for n in notes)


def test_resources_without_stats(client: TestClient) -> None:
    assert client.get("/api/v1/resources").json()["hasData"] is False
    line = b'203.0.113.5 - - [06/Nov/2026:05:00:01 +0000] "GET / HTTP/1.1" 200 612 "-" "ua" "-"\n'
    client.post("/api/v1/files", files=[("files", ("web.log", line, "text/plain"))])
    r = client.get("/api/v1/resources").json()
    assert (r["hasData"], r["hasStats"], r["containers"], r["notes"]) == (True, False, [], [])


def test_a_stat_takes_its_service_from_dockers_labels() -> None:
    event = (
        '{"Type":"container","Action":"start","time":1,"timeNano":1000000,"Actor":{"ID":"abc",'
        '"Attributes":{"name":"proj-my-svc-1","com.docker.compose.service":"my-svc"}}}'
    )
    stat = (
        '2026-11-04T03:00:00Z {"CPUPerc":"1.00%","MemUsage":"10MiB / 1GiB",'
        '"Name":"proj-my-svc-1","ID":"abc"}'
    )
    store = Store()
    store.add("events.log", "events.log", event.encode(), "upload")
    store.add("stats.log", "stats.log", stat.encode(), "upload")
    [s] = store.snapshot().stats
    assert s.service == "my-svc"


def test_record_stats_stamps_each_line(tmp_path_factory: pytest.TempPathFactory) -> None:
    moment = datetime(2026, 11, 4, 3, 0, 5, 123000, tzinfo=UTC)
    assert stamp('{"a":1}\r\n\n{"b":2}\n', moment) == [
        '2026-11-04T03:00:05Z {"a":1}',
        '2026-11-04T03:00:05Z {"b":2}',
    ]
    out = tmp_path_factory.mktemp("stats") / "stats.log"
    slept: list[float] = []
    written = record(
        out,
        5,
        runner=lambda: '{"CPUPerc":"1.00%","MemUsage":"10MiB / 1GiB","Name":"p-api-1"}\n',
        clock=lambda: moment,
        sleep=slept.append,
        rounds=2,
    )
    assert written == 2
    assert len(slept) == 1
    lines = out.read_text(encoding="utf-8").splitlines()
    assert lines == [f"2026-11-04T03:00:05Z {lines[0].split(' ', 1)[1]}"] * 2
    assert parse_text(out.read_text(encoding="utf-8"), "f").summary.counts.stat == 2  # pyright: ignore[reportOptionalMemberAccess]


def test_logs_filter_and_page(sample: TestClient) -> None:
    page = sample.get(
        "/api/v1/logs", params={"level": "ERROR", "q": "connect() failed", "pageSize": 10}
    ).json()
    assert page["total"] > 10
    assert page["pages"] == -(-page["total"] // 10)
    assert all("connect() failed" in ln["message"] for ln in page["lines"])
    assert len(page["lines"]) == 10


def test_timeline_rejects_a_backwards_window(sample: TestClient) -> None:
    assert sample.get("/api/v1/timeline", params={"start": 10, "end": 5}).status_code == 422


def test_containers(sample: TestClient) -> None:
    c = sample.get("/api/v1/containers").json()
    assert [x["service"] for x in c["containers"]] == ["api", "web"]
    assert any(e["text"] == "api ran out of memory" and e["tone"] == "fail" for e in c["events"])


def test_upload_remove_and_clear(client: TestClient) -> None:
    line = b'203.0.113.5 - - [06/Nov/2026:05:00:01 +0000] "GET / HTTP/1.1" 200 612 "-" "ua" "-"\n'
    files = client.post("/api/v1/files", files=[("files", ("web.log", line, "text/plain"))]).json()[
        "files"
    ]
    assert [(f["name"], f["status"], f["summary"]["format"]) for f in files] == [
        ("web.log", "ready", "nginx")
    ]
    assert client.delete(f"/api/v1/files/{files[0]['id']}").json()["files"] == []
    assert client.delete("/api/v1/files/nope").status_code == 404
    client.post("/api/v1/files/sample")
    assert client.delete("/api/v1/files").json()["files"] == []


def test_folder_is_read_and_reloaded(tmp_path_factory: pytest.TempPathFactory) -> None:
    folder = tmp_path_factory.mktemp("exports")
    (folder / "api.log").write_text(
        "2026-11-06T05:00:01.000Z WARNING asyncio: x\n", encoding="utf-8"
    )
    store = Store(folder)
    store.load_folder()
    with TestClient(create_app(store=store)) as c:
        assert [f["path"] for f in c.get("/api/v1/files").json()["files"]] == ["api.log"]
        (folder / "nested").mkdir()
        (folder / "nested" / "web.log").write_text("", encoding="utf-8")
        reloaded = c.post("/api/v1/files/reload").json()
        assert [f["path"] for f in reloaded["files"]] == ["api.log", "nested/web.log"]
        assert reloaded["folder"] == str(folder)
