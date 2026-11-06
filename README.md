# PANTHER Services Dashboard

Joins up the PANTHER scoring services' three records of what happened, the API's log, nginx's
logs and Docker's own record, for debugging and profiling: where a failed request failed, what an
incident was made of, what happened to one job, and whether the machine was the reason a job was
slow.

A proof of concept. It runs on your machine and reads exported log files; nothing is sent
anywhere else.

## Try It

You need Docker. From the repository root:

```bash
PSD_LOAD_SAMPLE=true docker compose up --build    # then open http://localhost:4340
```

That loads a made-up day: an out-of-memory crash at 03:10 and a burst of jobs at 08:00 that fills
the queue. Every page says when sample data is loaded. `docker compose down` stops it.

To read real logs instead, put the exported files in `exports/` and run `docker compose up --build`
without `PSD_LOAD_SAMPLE`, or upload them on the Files page. `PSD_LOGS=<folder>` reads another
folder, and `PSD_PORT` changes the port.

## Export Real Logs

Wherever the scoring services run (a server, or `docker compose up --build web` in
panther-scoring-services on your machine), after some use of the site:

```bash
docker compose logs --no-log-prefix -t api > api.log
docker compose logs --no-log-prefix -t web > web.log
docker events --since 24h --until "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --format '{{json .}}' > events.log
docker inspect $(docker compose ps -aq) > inspect.json
```

- Keep `--no-log-prefix`: without it, Compose starts every line with `api-1 |`.
- Docker keeps only recent events, so export them soon after an incident.
- Without Compose, `docker logs -t <container>` gives the same as the first two lines.

**CPU and memory.** `docker stats` keeps no history, so record it while the site is in use and stop
it with Ctrl+C. Either of these works; the second needs only a shell:

```bash
# from backend/ of this repository, with uv
uv run services-dashboard record-stats ../exports/stats.log --every 5

# anywhere with Docker and a POSIX shell
while true; do docker stats --no-stream --format '{{json .}}' | sed "s/^/$(date -u +%Y-%m-%dT%H:%M:%SZ) /"; sleep 5; done >> stats.log
```

**Latency.** nginx's default `main` log format has no request times, so the latency charts stay
empty until `rt=$request_time urt="$upstream_response_time"` is added to the end of the web
image's `log_format` in panther-scoring-services.

**Privacy.** The logs hold client IP addresses. Keep them on your machine: `exports/` is ignored by
git, the dashboard is published on 127.0.0.1 only, and its backend isn't published at all.

## What to Look At

- **Overview:** headline numbers with their trends, then incidents, each told as a short story
  from all three sources. Below them, request volume, error rates, latency and a latency heatmap on
  one time axis, with container events marked and incidents shaded; drag across a chart to zoom
  them all, and open those minutes in the timeline. Then where failed requests failed, endpoints,
  warnings and errors.
- **Timeline:** everything from all three sources in a window, interleaved.
- **Jobs:** run and wait times per job; click one for its whole story.
- **Resources:** CPU and memory per container, the jobs in flight, and what they mean together
  (memory climbing before an out-of-memory kill, jobs slower while CPU was high).
- **Containers:** each container's state from `docker inspect`, and Docker's events.
- **Logs:** every line, filtered by level, source and text.
- **Files:** what's loaded, what each file turned out to hold, and any lines nothing understood.

## When Testing

Useful things to send back:

- **Lines not understood.** The Files page lists them per file. Each is a log format the
  dashboard doesn't read yet; a few lines are enough to add it.
- **A wrong story.** An incident, error origin or job story that says something the logs don't
  support, with the time it happened.
- **Anything slow or confusing,** with a screenshot.

The sample's IP addresses are documentation-only ranges (RFC 5737); share screenshots of real
logs only with the team.

## Develop

```bash
# terminal 1: the backend, with the sample day
cd backend
uv sync
uv run services-dashboard serve --sample      # http://localhost:8020

# terminal 2: the UI
cd frontend
npm install
npm run dev                                    # http://localhost:4320
```

Python 3.13 with uv for the backend, Node 24 for the UI. Checks, conventions and architecture are
in [CLAUDE.md](CLAUDE.md).
