"""Writes the API's answers on the sample day as JSON files, for the frontend's tests to serve.

The frontend's tests mock the backend at the network (MSW); serving what the backend really
answers keeps those mocks honest. Run it again whenever a response model changes:

    uv run services-dashboard fixtures ../frontend/tests/fixtures
"""

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from services_dashboard.main import create_app
from services_dashboard.sample import BURST, OUTAGE
from services_dashboard.store import Store


def write_fixtures(out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    with TestClient(create_app(store=Store())) as client:
        client.post("/api/v1/files/sample")

        def save(name: str, path: str, params: dict[str, Any] | None = None) -> Any:
            response = client.get(path, params=params)
            response.raise_for_status()
            data = response.json()
            target = out / f"{name}.json"
            target.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
            written.append(target)
            return data

        save("files", "/api/v1/files")
        save("span", "/api/v1/span")
        save("overview", "/api/v1/overview", {"window": "24h"})
        save("jobs", "/api/v1/jobs", {"window": "1h"})
        save("logs", "/api/v1/logs", {"level": "ERROR", "pageSize": 20})
        save("containers", "/api/v1/containers")
        save("resources", "/api/v1/resources")
        timeline = save(
            "timeline",
            "/api/v1/timeline",
            {"start": OUTAGE[1] - 60_000, "end": OUTAGE[1] + 120_000},
        )

        lost = next(
            i["text"]
            for i in timeline["items"]
            if i["kind"] == "request" and "→ 404" in i["text"] and "/jobs/" in i["text"]
        )
        job_id = lost.split(" ")[1].rsplit("/", 1)[1]
        save("job-story-lost", f"/api/v1/jobs/{job_id}")

        # A job that ran during the queue-full burst: its story has the API container's CPU too.
        jobs = client.get("/api/v1/jobs", params={"window": "all"}).json()["jobs"]
        busy = next(
            j
            for j in jobs
            if BURST[0] <= j["t"] < BURST[1] and j["service"] == "csnp" and j["ranS"] > 30
        )
        save("job-story-finished", f"/api/v1/jobs/{busy['jobId']}")
    return written
