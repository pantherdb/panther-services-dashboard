# Task: Python backend that combines API, nginx and Docker logs; React displays it via the API

**Status:** ACTIVE (built and passing, redesigned, stats and heatmap added; waiting for the owner's review and first commit)
**Issue:** none yet (no remote)
**Branch:** main, no commits yet

Temporary plan. The owner moves planning to OpenSpec later; this file then goes.

## Goal

Prove the concept on exported files, locally: a FastAPI backend reads a folder of exported logs
(and files uploaded from the browser), parses the scoring API's log, nginx's logs and Docker's own
record, **joins them up**, and serves the results; the React app only displays them. If the team
likes it, the same backend later runs on the server and collects live.

## Decisions (2026-11-06, with the owner)

- **Combining the three sources is the point.** Not a generic log viewer, so not Grafana, Loki or
  ELK: they store and chart lines, but don't join a 502 to a crash to a container restart.
- **Python does the work, React displays.** The cross-source logic is written once, in Python, and
  moves to the server unchanged. A backend can also read a folder the user points it at.
- **Proof of concept first, independent.** Runs locally on exported files. No server, no backend
  on the team server, and nothing asked of Dustin until the team has seen it and wants it.
- **Same pattern as panther-scoring-services:** FastAPI, OpenAPI as the contract, TypeScript types
  generated from it (`openapi-typescript`), RTK Query in the frontend. Same pins for FastAPI,
  ruff, basedpyright, pytest (`../panther-scoring-services/api/pyproject.toml`).
- **The browser parsers go.** The TypeScript parsers and aggregation from the first plan
  (`2026-11-06-log-upload-dashboard.md`) are ported to Python and deleted from the frontend, so
  there's one implementation.

## Layout (target)

```text
backend/    Python package `services_dashboard` (uv, FastAPI), CLI `services-dashboard`
  src/services_dashboard/
    parse/        api_log, nginx, docker_events, docker_inspect, lines (classify a file)
    records.py    dataclasses for parsed records
    store.py      loaded files, in memory: from the folder, from uploads, the sample
    aggregate.py  traffic buckets, percentiles, endpoints, jobs, KPIs
    correlate.py  error origin, incidents, job stories, chart markers, timeline
    sample.py     the made-up day, now with Docker events and inspect too
    models.py     pydantic response models: the API contract
    routers/      files, overview, jobs, logs, timeline, containers
    main.py, cli.py, settings.py
  tests/
frontend/   the React app, moved from the repo root; display only
```

## Exporting files for the demo (no server needed)

From `../panther-scoring-services`, after `docker compose up --build web` and some use of the site:

```bash
docker compose logs --no-log-prefix -t api > api.log
docker compose logs --no-log-prefix -t web > web.log
docker events --since 24h --until "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --format '{{json .}}' > events.log
docker inspect $(docker compose ps -aq) > inspect.json
```

`--no-log-prefix` matters: Compose otherwise prefixes `api-1  | ` and nothing parses. Docker keeps
only recent events in memory: export soon after an incident.

## API (all under `/api/v1`)

| Method and path | Returns |
| --------------- | ------- |
| `GET /health` | ok |
| `GET /files` | loaded files and their summaries, plus the folder being read |
| `POST /files` | multipart upload of one or more files; parsed and added |
| `POST /files/sample` | loads the sample day |
| `POST /files/reload` | re-reads the folder |
| `DELETE /files/{id}`, `DELETE /files` | removes one, or all |
| `GET /overview?window=&source=` | range, bucket, KPIs, traffic points, endpoints, error origins, incidents, markers, problems |
| `GET /jobs?window=` | jobs (for the scatter), per-service stats |
| `GET /jobs/{job_id}` | the job's story: submission, polls, refusals, finish line, traceback |
| `GET /logs?window=&level=&source=&q=&page=` | log lines, paginated, newest first |
| `GET /timeline?start=&end=` | every event from all sources in a window, interleaved |
| `GET /containers` | containers from `docker inspect`, and Docker's events |

## Joining the sources (correlate.py)

1. **Error origin.** Each nginx request to `/api/` with 499 or 5xx is matched to the API's access
   line for the same method and path within 2 s:
   no API line and 502/503 → API unreachable; API line with 5xx → API error; API 503 → API
   refused (queue full); 504 → API too slow; 499 → client gave up.
2. **Incidents.** Runs of "API unreachable" requests, nginx `connect() failed` lines, container
   `die`/`oom`/`restart` events and API startup lines, merged when they're under 2 min apart, each
   with a one-line summary ("API unreachable 03:10–03:35 UTC: 41 requests failed; container
   api-1 died (exit 137), restarted").
3. **Job story.** A job id ties together its finish line, every poll of `/api/v1/jobs/{id}` in
   nginx and the API, and the submission (the POST from the same client just before its first poll).
4. **Markers.** Container events and API startups as points on every time chart; incidents as
   shaded spans.
5. **Timeline.** Everything in a window from all three sources, interleaved, for drill-down from a
   chart zoom or an incident.

## Steps

### Phase 1: Plan and layout
- [x] This plan
- [x] Move the React app to `frontend/`; root keeps README, CLAUDE.md, .plans, CI

### Phase 2: Backend
- [x] `backend/pyproject.toml` (Python 3.13, pins as scoring-services), ruff, basedpyright, pytest
- [x] Records and parsers: API log, nginx access and error, Docker `-t` prefix, untimed lines,
      tracebacks (port of the TS, with its tests), plus Docker events and Docker inspect
- [x] Store: folder at startup (`--logs DIR`), uploads, sample, remove, reload
- [x] Aggregation (port) and correlation (new)
- [x] Sample day with Docker events and inspect, matching the outage
- [x] Routers and pydantic models; `services-dashboard openapi` writes `openapi.json`
- [x] Tests: parsers, correlation, API (TestClient)

### Phase 3: Frontend, display only
- [x] `openapi-typescript` types, RTK Query endpoints, delete browser parsers and the logs slice
- [x] Files page: upload, folder upload, sample, reload folder, remove
- [x] Overview: markers and incident spans on charts, incidents panel, error origins table
- [x] Jobs: job story (`/jobs/:id`)
- [x] Timeline page (`/timeline?start&end`), opened from a chart zoom or an incident
- [x] Containers page: state table and events
- [x] Logs page on the paginated API

### Phase 4: Checks and docs
- [x] Backend: ruff, basedpyright, pytest. Frontend: type-check, lint, format, test, build, e2e
- [x] Run both together and screenshot
- [x] CLAUDE.md, README.md, CI for both

### Phase 5: Its own look, and the plan's next joins (owner, 2026-11-06: "make the UI nicer, I don't like the builder dashboard look")
- [x] New design: sidebar (drawer on phones), rounded cards on a darker plane, violet accent,
      Inter and JetBrains Mono bundled, `PageHeader` on every page; tokens renamed `--sd-*`, utilities `sd-*`
- [x] Palettes re-validated on the new surfaces; sequential ramp moved to violet and validated
- [x] KPI tiles with sparklines; incidents as cards with a mini timeline and "evidence from" badges
- [x] Backend: incidents carry `summary`, `events` (timed, with source), `sources`, `failedRequests`
- [x] Backend: `docker stats` parsing, `record-stats` CLI, sample stats, `GET /resources` with notes
      (memory climb before the OOM, CPU peak with jobs running, jobs slower under high CPU), a job
      story item for CPU and memory during the run, the memory peak as an incident event, `memPeakPct`
- [x] Backend: latency heatmap on the overview; jobs per traffic bucket for sparklines
- [x] Frontend: Resources page (container peaks, notes, CPU, memory, jobs in flight), heatmap chart
- [x] Checks: backend 60 pytest; frontend 26 vitest, build, 5 e2e; screenshots in both schemes and on a phone

### Phase 6: Docker (owner, 2026-11-06: "setup the docker for that repository")
- [x] `backend/Dockerfile`, `frontend/Dockerfile` with nginx, root `compose.yaml`, pinned as
      panther-scoring-services; UI on 127.0.0.1:4340, backend unpublished, `./exports` read-only
- [x] CI job: build, start with the sample, check the UI and the API through nginx
- [x] Built and run locally: both healthy, UI, upload, folder reload and the sample through nginx;
      the backend's port refuses connections from the host

## Recovery Checkpoint

> **⚠ UPDATE THIS AFTER EVERY CHANGE**

- **Last completed action:** phase 6 done (2026-11-06): Docker images and compose, checked
  locally. Before it, phase 5 (2026-11-06): the redesign, Docker stats and the
  Resources page, structured incidents, the latency heatmap. Backend: ruff, basedpyright (standard),
  60 pytest. Frontend: api:types:check, type-check, lint, format, 26 vitest, build, 5 e2e against the
  real backend. Screenshots of every page reviewed in both schemes and at phone width.
- **Next immediate action:** owner reviews, makes the first commit, then tries real exports from
  a local `docker compose up` of panther-scoring-services. Planning moves to OpenSpec.
- **Uncommitted changes:** everything; the repo has no commits and no remote
- **Environment state:** `backend/.venv` (uv) and `frontend/node_modules` installed; the compose
  stack (project `panther-services-dashboard`) may be running on 127.0.0.1:4340 with the sample

## Failed Approaches

| What was tried | Why it failed | Date |
| -------------- | ------------- | ---- |
| ECharts' `heatmap` series for the latency heatmap | Needs two category axes, so it can't share the time axis, zoom or crosshair with the other charts; drawn as a `custom` series instead | 2026-11-06 |
| The Mantine bridge on `:root` alone | MantineProvider injects its variables after our stylesheet and wins; `:root:root`, and Mantine's `blue` re-pointed too, since filled buttons read it | 2026-11-06 |
| Reading a zoom from `chart.getOption().dataZoom[].startValue` | The toolbox zoom leaves it unset; read the event's `batch`, then the x-axis model's extent (`EChart.tsx`) | 2026-11-06 |
| Parsing in the browser (first plan) | Works for a snapshot, but the cross-source logic would have to be rewritten in Python for the server, and a browser can't read a folder by itself | 2026-11-06 |

## Notes

- The API's log format is defined by `../panther-scoring-services/api/src/panther_api/logs.py`
  and `jobs/runner.py`; the parser follows them.
- nginx's `main` format has no request times: latency stays empty on real logs until
  `rt=$request_time urt="$upstream_response_time"` is added to the web image's `log_format`
  (panther-scoring-services `frontend/nginx/`, a separate PR). The sample has times.
- Docker `events --format '{{json .}}'`: one JSON object per line, `Type`, `Action`, `Actor.ID`,
  `Actor.Attributes` (`name`, `com.docker.compose.service`, `exitCode`, `signal`), `time`,
  `timeNano`. `docker inspect`: a JSON array; `Name`, `Config.Image`, `Config.Labels`, `State`
  (`Status`, `OOMKilled`, `ExitCode`, `StartedAt`, `FinishedAt`, `Health`), `RestartCount`.
- Logs hold client addresses: host it only where the team alone can reach it.
