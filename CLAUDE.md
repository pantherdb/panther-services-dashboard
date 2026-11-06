# CLAUDE.md

## Project

`panther-services-dashboard` joins up the PANTHER scoring services' three sources of evidence, the
API's log, nginx's logs and Docker's own record, and shows what they mean together: where a failed
request failed, what an incident was made of, what happened to one job. For debugging and
profiling. Not a generic log viewer: the joining-up is the point, which is why Grafana, Loki and
ELK were set aside (they store and chart lines, but don't connect a 502 to a crash to a restart).

**Status: a proof of concept, local only.** It reads exported files. No server, nothing deployed,
nothing asked of the team's server admin until the team has seen it and wants it. Then the same
backend can run on the server and collect live. The plan, with a recovery checkpoint, is
`.plans/feature/2026-11-06-python-backend-and-correlation.md`; planning moves to OpenSpec later.

| Folder | What | Stack |
| ------ | ---- | ----- |
| `backend/` | Reads, parses and joins the logs; serves the results | Python 3.13, FastAPI, uv |
| `frontend/` | Displays them | React 19, TypeScript, Vite 7, Mantine 9, Tailwind v4, RTK Query, ECharts 6, Inter and JetBrains Mono (bundled, no font CDN) |

The backend does all the work; the frontend only displays what the API returns. The OpenAPI schema
is the contract: the frontend's types are generated from it.

## Commands

```bash
# backend/
uv sync
uv run services-dashboard serve --sample            # http://localhost:8020, the made-up day
uv run services-dashboard serve --logs ../exports   # a folder of exported logs
uv run services-dashboard record-stats ../exports/stats.log --every 5   # docker stats over time; Ctrl+C stops
uv run ruff format && uv run ruff check && uv run basedpyright && uv run pytest

# frontend/  (with the backend running)
npm install
npm run dev                  # http://localhost:4320, /api proxied to :8020
npm run type-check && npm run lint && npm run format:check && npm test
npm run test:e2e             # starts its own backend (:8030, sample) and frontend (:4330)

# repository root: both in Docker, nginx serving the build on 127.0.0.1:4340
docker compose up --build                       # reads ./exports (git-ignored)
PSD_LOAD_SAMPLE=true docker compose up --build  # with the sample day; PSD_LOGS=<dir> for another folder
```

**After changing a response model** (`backend/src/services_dashboard/models.py`):

```bash
cd backend
uv run services-dashboard openapi ../frontend/openapi.json
uv run services-dashboard fixtures ../frontend/tests/fixtures
cd ../frontend && npm run api:types
```

## What It Reads

| Source | Written by | Gives |
| ------ | ---------- | ----- |
| The scoring API's log | `../panther-scoring-services/api/src/panther_api/logs.py`, `jobs/runner.py` | One line per finished job (service, input size, outcome, wait and run time), warnings and errors with tracebacks, Uvicorn's access log (not routine 2xx polls) |
| nginx's access log | the scoring site's `web` image, official `main` format | Every request: status, path, size, client. With `rt=$request_time urt="$upstream_response_time"` appended to its `log_format`, latency too |
| nginx's error log | the same | `connect() failed` and other upstream failures |
| Docker's events | `docker events --format '{{json .}}'` | Container start, stop (exit code), kill, out of memory, health |
| `docker inspect` | `docker inspect $(docker compose ps -aq)` | Each container's state, restarts, out-of-memory flag |
| `docker stats` | `services-dashboard record-stats`, or a loop prefixing each `docker stats --no-stream --format '{{json .}}'` line with an ISO UTC time | CPU and memory per container over time. A line without the time is unparsed: `docker stats` has no history |

`docker compose logs --no-log-prefix -t` output works as is (keep `--no-log-prefix`). `.gz` files
are unzipped. The Files page shows the export commands and any lines nothing understood.

## Layout

```text
backend/src/services_dashboard/
  parse/          one module per format (api_log, nginx, docker, stats) + lines.py, which classifies a file
  records.py      slotted dataclasses for parsed records; times are epoch ms, UTC
  store.py        loaded files in memory: the folder, uploads, the sample; a cached merged view
  aggregate.py    windows, buckets, percentiles, endpoints, jobs, KPIs
  correlate.py    THE POINT: error origin, incidents, markers, job story, timeline
  sample.py       the made-up day (an out-of-memory outage, a queue-full burst), as real log text
  models.py       pydantic response models: the API contract (camelCase on the wire)
  views.py        builds each response; main.py routes stay thin
  record_stats.py the `record-stats` loop around `docker stats` (argument list, never a shell)
  cli.py, fixtures.py, settings.py
backend/Dockerfile   python slim + uv, non-root, `serve --host 0.0.0.0`, logs read-only at /logs
frontend/Dockerfile  npm ci and build, then nginx-unprivileged on 8080 forwarding /api/ (frontend/nginx/)
compose.yaml         api (no published port) and web (127.0.0.1 only); base images pinned by digest,
                     the same pins as panther-scoring-services
frontend/src/
  @panther.core/  reusable, no feature knowledge: theme/, components/, charts/, format.ts
  app/            shell: store, api/ (RTK Query + generated schema), routes, nav, layout/
  features/       overview, timeline, jobs (+ job story), resources, containers, explorer (logs), files, shared
```

## Rules

**Backend**

- **Parsers are pure, one module per format,** tested with lines in the exact shape the program
  writes. A new format: a parser, a branch in `parse/lines.py`'s `_classify_bare`, tests.
- **The API's log format belongs to panther-scoring-services.** When its `logs.py` or the runner's
  job line changes, `parse/api_log.py` and its tests change here.
- **Joining-up lives in `correlate.py`, nowhere else.** The frontend never infers a relationship.
- **Matching nginx to the API** is by method and path within 2 s, preferring an API line with the
  same status (every `POST /jobs` shares a path; the nearest line can be someone else's 202).
- **The sample is real log text** through the same parsers. `test_the_sample_is_read_in_full`
  fails if a parser and the generator drift apart.
- **Never log or serve more than the logs hold.** Logs hold client addresses: bind to 127.0.0.1
  (the default) and never expose the backend beyond the team. In Docker the backend has no
  published port and the UI is published on 127.0.0.1; `exports/` is git-ignored.

**Frontend**

- **Every call goes through RTK Query** (`app/api/api.ts`). Every query provides the `Data` tag and
  every file change invalidates it.
- **Types come from `openapi.json`** (`npm run api:types`). Never hand-write one; `app/api/types.ts`
  only gives them short names.
- **Show what's true:** loading only when there's no data; a clear message when the backend is down;
  a refetch keeps the old render at reduced opacity (`Refreshing`). Sample data always has its banner.
- **Its own look,** not the builder dashboard's: a sidebar, rounded cards (`Panel`, `StatTile`) on a
  darker plane, one violet accent for interaction, sentence-case headings, Inter and JetBrains Mono.
  Every page starts with `PageHeader` (title, one line of purpose, the controls that scope it).
- **Mantine for controls, Tailwind for layout,** colours only as tokens. `src/index.css` is the only
  file with a colour literal; tokens are `--sd-*`, utilities `sd-*` (never `pb-*`: that's
  padding-bottom). ECharts gets `var(--sd-*)` refs, and `alpha(token, a)` for a fading fill, which
  `EChart` resolves for the canvas. The Mantine bridge in `index.css` uses `:root:root` because
  MantineProvider injects its own variables after our stylesheet.

**Charts** (checked with the dataviz palette validator)

- One axis per chart; two measures are two charts on a shared time axis (`group`), never a dual axis.
- Status colours only for good/bad; categorical slots bound to a fixed entity order; the ordinal ramp
  for ordered things (p50/p95/p99). A scatter caps at three categorical colours; the rest are "Other".
- Stacking 2xx/4xx/5xx in status colours failed the validator (amber vs red ΔE 3.2 under
  deuteranopia): hence small multiples.
- Every chart has a table view; a status never rests on colour alone (chips carry an icon and a
  word; failed jobs are triangles). Event lines are solid, never dashed.
- The sequential ramp is violet, one hue, its low end at least 2:1 against the surface (validated in
  both schemes). The latency heatmap uses it on log-spaced steps, as a `custom` series on the shared
  time axis: ECharts' own heatmap needs two category axes and couldn't zoom with the others.
- Containers take categorical slots by Compose service (api, web, then the rest), so the API is the
  same blue on the Resources page as on its source badge.

**Code**

- Comments say why, not what: a short block at the top of a module, inline only where the reason
  isn't obvious.
- No AI attribution in commits, pull requests or docs.

## Tests

- Backend: pytest on parsers, aggregation, correlation and the API (FastAPI's TestClient).
- Frontend: Vitest collects only `tests/**/*.test.{ts,tsx}`. MSW serves `tests/fixtures/*.json`,
  which the backend writes, so the mocks match the real contract. `tests/setup.ts` replaces
  `EChart` with its labelled box (jsdom has no canvas); charts are tested through their option
  builders, and drawn for real in e2e.
- `tests/utils/render.tsx` imports `RouterProvider` from `react-router`, not `react-router/dom`:
  under Vitest the `/dom` entry loads a different build and nested routes render empty.
- e2e (Playwright) runs the real backend with the sample and the real frontend.

## Next

- **Show it to the team**, on real exports from a local `docker compose up`.
- **Latency on real logs** needs nginx timings: append `rt=$request_time urt="$upstream_response_time"`
  to the web image's `log_format` in panther-scoring-services (`frontend/nginx/`), a separate PR.
- **If the team wants it:** run the backend on the server, collecting live (`docker logs -f`,
  `docker events`, `docker stats` through a read-only socket proxy), with retention on disk.
- **More joining-up:** per-route latency against container CPU; a job's run time against the jobs
  running beside it, on the job story.
- `basedpyright` runs in standard mode; strict is a follow-up.
