"""The HTTP API the frontend reads, under /api/v1.

Local only for now: the dashboard is a proof of concept on exported files. Logs hold client
addresses; never expose this beyond the team.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, UploadFile

from services_dashboard import models, views
from services_dashboard.aggregate import WindowKey
from services_dashboard.records import Level, LogSource, Source
from services_dashboard.settings import Settings
from services_dashboard.store import Store

API_PREFIX = "/api/v1"
ALL_SOURCES: list[Source] = ["api", "nginx", "docker"]

router = APIRouter(prefix=API_PREFIX)


def _store(request: Request) -> Store:
    store: Store = request.app.state.store
    return store


@router.get("/health")
def health() -> models.Health:
    return models.Health()


@router.get("/files")
def list_files(request: Request) -> models.Files:
    """The loaded files and what each turned out to hold."""
    return views.files(_store(request))


@router.post("/files")
async def upload_files(request: Request, files: list[UploadFile]) -> models.Files:
    """Reads uploaded files. They're parsed and kept in memory; a restart forgets them."""
    store = _store(request)
    for upload in files:
        data = await upload.read()
        name = upload.filename or "upload"
        store.add(name.rsplit("/", 1)[-1], name, data, "upload")
    return views.files(store)


@router.post("/files/sample")
def add_sample(request: Request) -> models.Files:
    """Loads the made-up sample day, replacing it if it's loaded already."""
    store = _store(request)
    for f in store.files():
        if f.origin == "sample":
            store.remove(f.id)
    views.load_sample(store)
    return views.files(store)


@router.post("/files/reload")
def reload_folder(request: Request) -> models.Files:
    """Reads the folder again, for files exported since."""
    store = _store(request)
    store.load_folder()
    return views.files(store)


@router.delete("/files/{file_id}")
def remove_file(request: Request, file_id: str) -> models.Files:
    store = _store(request)
    if not store.remove(file_id):
        raise HTTPException(404, "No such file")
    return views.files(store)


@router.delete("/files")
def remove_all(request: Request) -> models.Files:
    store = _store(request)
    store.clear()
    return views.files(store)


@router.get("/span")
def span(request: Request) -> models.Span:
    return views.span(_store(request))


@router.get("/overview")
def overview(
    request: Request, window: WindowKey = "all", source: LogSource | None = None
) -> models.Overview:
    """Headline numbers, traffic over time, endpoints, error origins, incidents and markers."""
    return views.overview(_store(request), window, source)


@router.get("/jobs")
def jobs(request: Request, window: WindowKey = "all") -> models.Jobs:
    return views.jobs(_store(request), window)


@router.get("/jobs/{job_id}")
def job_story(request: Request, job_id: str) -> models.JobStory:
    """Everything known about one job, from all sources."""
    return views.job_story(_store(request), job_id)


@router.get("/logs")
def logs(
    request: Request,
    window: WindowKey = "all",
    level: Level | None = None,
    source: LogSource | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=10, le=500)] = 100,
) -> models.Logs:
    return views.logs(_store(request), window, level, source, q, page, page_size)


@router.get("/timeline")
def timeline(
    request: Request,
    start: int,
    end: int,
    problems_only: Annotated[bool, Query(alias="problemsOnly")] = False,
    sources: Annotated[list[Source] | None, Query()] = None,
) -> models.Timeline:
    """Every event from all sources between start and end (epoch ms), interleaved."""
    if end < start:
        raise HTTPException(422, "end is before start")
    return views.timeline(_store(request), start, end, problems_only, sources or ALL_SOURCES)


@router.get("/resources")
def resources(request: Request, window: WindowKey = "all") -> models.Resources:
    """CPU and memory from `docker stats`, jobs running, and what they say next to the logs."""
    return views.resources(_store(request), window)


@router.get("/containers")
def containers(request: Request) -> models.Containers:
    """Containers from `docker inspect`, and Docker's events."""
    return views.containers(_store(request))


def create_app(store: Store | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if store is None:
            app.state.store = Store(settings.logs_dir)
            app.state.store.load_folder()
            if settings.load_sample:
                views.load_sample(app.state.store)
        yield

    app = FastAPI(
        title="PANTHER services dashboard",
        version="0.1.0",
        summary="Joins the scoring services' API, nginx and Docker logs, for debugging and profiling.",
        lifespan=lifespan,
    )
    if store is not None:
        app.state.store = store
    app.include_router(router)
    return app


app = create_app()
