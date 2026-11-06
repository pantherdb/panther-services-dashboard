# Task: Boilerplate and first working dashboard: upload logs, see failures and latency

**Status:** COMPLETE (superseded by 2026-11-06-python-backend-and-correlation.md: parsing moves to a Python backend)
**Issue:** none yet (no remote)
**Branch:** main, no commits yet

Temporary plan. The owner moves planning to OpenSpec later; this file then goes.

## Goal

A React app on the team's stack (RTK, Mantine, Tailwind v4) that takes log files or a folder,
parses them in the browser, and shows failures, latency and job run times as linked time-series
charts, for debugging and profiling the scoring services. Live updates come later.

## Context

- **Triggered by:** owner's request, 2026-11-06. Look and theme from `../panther_builder_dashboard`;
  toolchain from `../panther-scoring-services/frontend`.
- **Log formats:** `../panther-scoring-services/api/src/panther_api/logs.py` (API) and
  `jobs/runner.py` (job lines); nginx `main` format from the official image (the web image's
  `frontend/nginx/default.conf.template` sets no access_log of its own).
- **Data source decided:** manual upload of files or a folder. No backend yet.

## Steps

### Phase 1: Shell

- [x] Config: package.json (pinned), Vite, Vitest, ESLint flat, tsconfigs, Prettier, env example
- [x] Theme: builder's token layer (`src/index.css`), `mantineTheme.ts`, `tokens.ts`
- [x] Store, typed hooks, ui slice (colour scheme, persisted), router, layout, error pages

### Phase 2: Logs

- [x] Record types, API log and nginx parsers, line classifier with Docker `-t` prefix
- [x] logs slice (files + records), thunks to read files (gzip too), folder input, drag and drop
- [x] Sample data generator, run through the same parsers, marked as sample
- [x] Selectors and aggregation: time window, buckets, percentiles, endpoints, jobs, errors

### Phase 3: Views

- [x] ECharts wrapper (token resolution, linked crosshair and zoom, resize), chart/table toggle
- [x] Overview: filter row, KPI tiles, requests, 5xx rate, 4xx rate, latency, endpoints, errors
- [x] Jobs: run-time scatter by service, per-service table
- [x] Logs: level/source/text filters, paginated table, tracebacks
- [x] Files: upload, list with format, counts, unparsed samples, remove

### Phase 4: Checks and docs

- [x] Tests: parsers, aggregation, app flow (upload → charts), e2e smoke
- [x] type-check, lint, format, test, build, e2e all pass
- [x] CLAUDE.md, README.md, CI workflow

## Recovery Checkpoint

> **⚠ UPDATE THIS AFTER EVERY CHANGE**

- **Last completed action:** every phase done. type-check, lint, format, 44 unit tests, build and
  3 e2e tests pass (2026-11-06). Screenshots checked in both schemes and at phone width; fixed the
  bare day label on the time axis ("4" → "Nov 4") and the scatter legend's missing keys.
- **Next immediate action:** owner reviews, makes the first commit, and moves planning to
  OpenSpec. Then try it on real `docker logs` output from the server.
- **Uncommitted changes:** everything; the repo has no commits and no remote
- **Environment state:** `node_modules` installed; nothing running

## Failed Approaches

| What was tried                                               | Why it failed                                                                                                                                                                                    | Date       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| One stacked chart of 2xx / 3xx / 4xx / 5xx in status colours | Palette validator: amber 4xx vs red 5xx ΔE 3.2 under deuteranopia (light), grey below chroma floor, dark lightness band. Replaced by small multiples: volume, 5xx %, 4xx %, each a single series | 2026-11-06 |

## Notes

- **Charts: Apache ECharts, not `@mantine/charts`.** Debugging needs zoom into a time window,
  crosshairs linked across panels, latency heatmaps later, and tens of thousands of points.
  Recharts (under `@mantine/charts`) is SVG and has none of the first three built in.
- **ECharts draws on canvas, which can't read CSS variables.** Options are written with
  `var(--pb-*)` refs from `tokens.ts`; the wrapper resolves them with `getComputedStyle` and again
  when the colour scheme flips. `index.css` stays the only file with a colour literal.
- **Validated:** latency p50/p95/p99 on ordinal steps 1/3/5 and the job scatter on series 1-3
  (all pairs) pass the dataviz validator in both schemes.
- **Records live in Redux** with the immutable and serializable checks skipped for the records
  path only; 100k+ objects would make both checks crawl in development.
- **nginx `main` has no timings.** Latency needs ` rt=$request_time urt="$upstream_response_time"`
  in the web image's log_format: a change in panther-scoring-services, the owner's call.

## Additional Context (Claude)

- Parsing runs on the main thread. Past ~50 MB it will block for seconds; a Web Worker (and maybe
  DuckDB-wasm) is the next step if that hurts.
- Live updates later: a small collector next to the containers that tails `docker logs` and serves
  the same records over an API; the parsers here can move to it or stay as they are.
