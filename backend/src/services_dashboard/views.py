"""Builds each response from the store: the glue between the records, the aggregation, the
correlation and the API's models. Routes stay thin."""

import math
from collections.abc import Sequence

from services_dashboard import aggregate, correlate, models
from services_dashboard.aggregate import WindowKey
from services_dashboard.records import (
    LEVEL_RANK,
    DockerEvent,
    Job,
    Level,
    Log,
    LogSource,
    Source,
    Stat,
)
from services_dashboard.sample import generate_sample
from services_dashboard.store import LoadedFile, Store

PROBLEM_LIMIT = 100
TIMELINE_LIMIT = 2000


def files(store: Store) -> models.Files:
    return models.Files(
        folder=str(store.folder) if store.folder else None,
        files=[_file(f) for f in store.files()],
        has_sample=any(f.origin == "sample" for f in store.files()),
    )


def _file(f: LoadedFile) -> models.LoadedFile:
    return models.LoadedFile.model_validate(f)


def load_sample(store: Store) -> None:
    for name, text in generate_sample():
        store.add(name, name, text.encode(), "sample")


def span(store: Store) -> models.Span:
    s = store.snapshot().span
    return models.Span(range=models.Range(start=s[0], end=s[1]) if s else None)


def _range(r: tuple[int, int]) -> models.Range:
    return models.Range(start=r[0], end=r[1])


def _lines(logs: Sequence[Log], jobs: Sequence[Job]) -> list[models.Line]:
    """Log and job records as readable lines, newest first. A job line reads as the API wrote it."""
    lines = [
        models.Line(
            key=f"l-{log.file_id}-{log.t}-{i}",
            t=log.t,
            level=log.level,
            source=log.source,
            logger=log.logger,
            message=log.message,
            detail=log.detail,
        )
        for i, log in enumerate(logs)
    ]
    for i, j in enumerate(jobs):
        summary = f", {j.summary}" if j.summary else ""
        lines.append(
            models.Line(
                key=f"j-{j.file_id}-{j.t}-{i}",
                t=j.t,
                level=j.level,
                source="api",
                logger="panther_api.jobs.runner",
                message=f"Job {j.job_id} {j.service}{summary}: {j.outcome_text}, "
                f"waited {j.waited_s:.1f} s, ran {j.ran_s:.1f} s",
                detail=j.detail,
            )
        )
    return sorted(lines, key=lambda line: -line.t)


def _empty_kpis() -> models.Kpis:
    return models.Kpis(
        requests=0,
        server_error_pct=None,
        client_error_pct=None,
        p95_ms=None,
        jobs=0,
        failed_jobs=0,
        container_events=0,
        mem_peak_pct=None,
    )


def overview(store: Store, window: WindowKey, source: LogSource | None) -> models.Overview:
    snap = store.snapshot()
    if snap.span is None:
        return models.Overview(
            has_data=False,
            window=window,
            range=None,
            bucket_ms=60_000,
            source=None,
            sources=[],
            has_durations=False,
            kpis=_empty_kpis(),
            points=[],
            latency_heatmap=None,
            endpoints=[],
            origins=[],
            incidents=[],
            markers=[],
            problems=[],
            problem_count=0,
        )

    rng = aggregate.window_range(window, snap.span)
    s = aggregate.slice_records(snap.records, rng)
    stats = aggregate.slice_stats(snap.stats, rng)
    sources: list[LogSource] = [src for src in ("nginx", "api") if s.requests[src]]
    chosen: LogSource | None = source if source in sources else (sources[0] if sources else None)
    requests = s.requests[chosen] if chosen else []
    bucket = aggregate.pick_bucket_ms(rng[1] - rng[0])
    failures = correlate.classify_failures(s.requests["nginx"], s.requests["api"])
    problems = [
        ln for ln in _lines(s.logs, s.jobs) if LEVEL_RANK[ln.level] >= LEVEL_RANK["WARNING"]
    ]
    heatmap = aggregate.latency_heatmap(requests, rng[0], rng[1], bucket)

    return models.Overview(
        has_data=True,
        window=window,
        range=_range(rng),
        bucket_ms=bucket,
        source=chosen,
        sources=sources,
        has_durations=any(r.duration_ms is not None for r in requests),
        kpis=models.Kpis.model_validate(aggregate.kpis(requests, s.jobs, s.events, stats)),
        points=[
            models.TrafficPoint.model_validate(p)
            for p in aggregate.traffic_series(requests, rng[0], rng[1], bucket, s.jobs)
        ],
        latency_heatmap=models.LatencyHeatmap.model_validate(heatmap) if heatmap else None,
        endpoints=[
            models.EndpointRow.model_validate(e) for e in aggregate.endpoint_stats(requests)
        ],
        origins=[models.OriginRow.model_validate(o) for o in correlate.origin_rows(failures)],
        incidents=_incidents(s, stats, failures),
        markers=[models.Marker.model_validate(m) for m in correlate.markers(s.events, s.logs)],
        problems=problems[:PROBLEM_LIMIT],
        problem_count=len(problems),
    )


def jobs(store: Store, window: WindowKey) -> models.Jobs:
    snap = store.snapshot()
    if snap.span is None:
        return models.Jobs(
            has_data=False,
            window=window,
            range=None,
            jobs=[],
            services=[],
            markers=[],
            incidents=[],
        )
    rng = aggregate.window_range(window, snap.span)
    s = aggregate.slice_records(snap.records, rng)
    return models.Jobs(
        has_data=True,
        window=window,
        range=_range(rng),
        jobs=[models.JobOut.model_validate(j) for j in s.jobs],
        services=[models.JobServiceRow.model_validate(r) for r in aggregate.job_stats(s.jobs)],
        markers=[models.Marker.model_validate(m) for m in correlate.markers(s.events, s.logs)],
        incidents=_incidents(s, aggregate.slice_stats(snap.stats, rng)),
    )


def _incidents(
    s: aggregate.Slice,
    stats: Sequence[Stat],
    failures: Sequence[correlate.Failure] | None = None,
) -> list[models.Incident]:
    if failures is None:
        failures = correlate.classify_failures(s.requests["nginx"], s.requests["api"])
    return [
        models.Incident.model_validate(i)
        for i in correlate.incidents(failures, s.jobs, s.logs, s.events, stats)
    ]


def job_story(store: Store, job_id: str) -> models.JobStory:
    snap = store.snapshot()
    story = correlate.job_story(snap.records, job_id, snap.stats)
    return models.JobStory(
        job_id=job_id,
        job=models.JobOut.model_validate(story.job) if story.job else None,
        items=[models.StoryItem.model_validate(i) for i in story.items],
        clients=story.clients,
    )


def logs(
    store: Store,
    window: WindowKey,
    level: Level | None,
    source: LogSource | None,
    q: str | None,
    page: int,
    page_size: int,
) -> models.Logs:
    snap = store.snapshot()
    if snap.span is None:
        return models.Logs(has_data=False, range=None, total=0, page=1, pages=1, lines=[])
    rng = aggregate.window_range(window, snap.span)
    s = aggregate.slice_records(snap.records, rng)
    needle = (q or "").strip().lower()
    lines = [
        ln
        for ln in _lines(s.logs, s.jobs)
        if (level is None or LEVEL_RANK[ln.level] >= LEVEL_RANK[level])
        and (source is None or ln.source == source)
        and (
            not needle
            or needle in ln.message.lower()
            or needle in ln.logger.lower()
            or (ln.detail is not None and needle in ln.detail.lower())
        )
    ]
    pages = max(1, math.ceil(len(lines) / page_size))
    page = min(max(1, page), pages)
    return models.Logs(
        has_data=True,
        range=_range(rng),
        total=len(lines),
        page=page,
        pages=pages,
        lines=lines[(page - 1) * page_size : page * page_size],
    )


def timeline(
    store: Store, start: int, end: int, problems_only: bool, sources: Sequence[Source]
) -> models.Timeline:
    items: list[models.TimelineItem] = []
    total = 0
    for i, r in enumerate(store.snapshot().records):
        if r.t < start or r.t > end:
            continue
        item = correlate.timeline_item(r, i)
        if (
            item is None
            or item.source not in sources
            or (problems_only and not correlate.is_problem(item))
        ):
            continue
        total += 1
        if len(items) < TIMELINE_LIMIT:
            items.append(models.TimelineItem.model_validate(item))
    return models.Timeline(start=start, end=end, total=total, shown=len(items), items=items)


def containers(store: Store) -> models.Containers:
    snap = store.snapshot()
    events: list[models.ContainerEvent] = []
    for r in snap.records:
        if not isinstance(r, DockerEvent):
            continue
        described = correlate.event_text(r)
        if described:
            events.append(
                models.ContainerEvent(
                    t=r.t,
                    container=r.container,
                    service=r.service,
                    action=r.action,
                    text=described[0],
                    tone=described[1],
                    exit_code=r.exit_code,
                )
            )
    # The newest snapshot of each container wins when several inspect files are loaded.
    latest: dict[str, models.ContainerOut] = {}
    for c in snap.containers:
        latest[c.container_id or c.name] = models.ContainerOut.model_validate(c)
    return models.Containers(
        containers=list(latest.values()), events=sorted(events, key=lambda e: -e.t)
    )


def resources(store: Store, window: WindowKey) -> models.Resources:
    snap = store.snapshot()
    if snap.span is None:
        return models.Resources(
            has_data=False,
            has_stats=False,
            window=window,
            range=None,
            bucket_ms=60_000,
            containers=[],
            points=[],
            concurrency=[],
            notes=[],
            markers=[],
            incidents=[],
        )
    rng = aggregate.window_range(window, snap.span)
    bucket = aggregate.pick_bucket_ms(rng[1] - rng[0])
    s = aggregate.slice_records(snap.records, rng)
    stats = aggregate.slice_stats(snap.stats, rng)
    containers = aggregate.resource_containers(stats)
    # A job that finished after the window still ran inside it.
    jobs = [r for r in snap.records if isinstance(r, Job)]
    return models.Resources(
        has_data=True,
        has_stats=bool(stats),
        window=window,
        range=_range(rng),
        bucket_ms=bucket,
        containers=[models.ResourceContainer.model_validate(c) for c in containers],
        points=[
            models.ResourcePoint.model_validate(p)
            for p in aggregate.resource_series(
                stats, [c.name for c in containers], rng[0], rng[1], bucket
            )
        ],
        concurrency=[
            models.ConcurrencyPoint.model_validate(p)
            for p in aggregate.concurrency_series(jobs, rng[0], rng[1], bucket)
        ],
        notes=[
            models.ResourceNote.model_validate(n)
            for n in correlate.resource_notes(stats, jobs, s.events)
        ],
        markers=[models.Marker.model_validate(m) for m in correlate.markers(s.events, s.logs)],
        incidents=_incidents(s, stats),
    )
