"""Docker's own record of the containers: its events, and `docker inspect`.

Events, one JSON object per line (`docker events --format '{{json .}}'`):

    {"Type":"container","Action":"die","Actor":{"ID":"…","Attributes":{"name":"…-api-1",
     "com.docker.compose.service":"api","exitCode":"137","image":"…"}},"time":…,"timeNano":…}

Only container events are kept, and of those not the ones a health check or `docker exec` makes
every few seconds (`exec_create`, `exec_start`, `exec_die`), which would bury the rest.

Inspect: a JSON array, one object per container, with `Name`, `Config`, `State`, `RestartCount`.
"""

import json
from typing import Any

from services_dashboard.records import Container, DockerEvent, iso_ms


class Ignored:
    """A line that was understood but isn't worth keeping, such as a network event."""


IGNORED = Ignored()

_NOISE = ("exec_create", "exec_start", "exec_die", "attach", "detach", "resize", "top", "copy")


def parse_event(line: str, file_id: str) -> DockerEvent | Ignored | None:
    if not line.startswith("{"):
        return None
    try:
        obj: Any = json.loads(line)
    except ValueError:
        return None
    if not isinstance(obj, dict):
        return None
    kind = obj.get("Type") or obj.get("type")
    action = obj.get("Action") or obj.get("status")
    if not isinstance(kind, str) or not isinstance(action, str):
        return None
    if kind != "container" or action.startswith(_NOISE):
        return IGNORED

    actor: Any = obj.get("Actor")
    if not isinstance(actor, dict):
        actor = {}
    attrs: Any = actor.get("Attributes")
    if not isinstance(attrs, dict):
        attrs = {}
    container_id = str(actor.get("ID") or obj.get("id") or "")
    t = _event_time(obj)
    if t is None:
        return None
    exit_code = attrs.get("exitCode")
    return DockerEvent(
        file_id=file_id,
        t=t,
        container_id=container_id,
        container=str(attrs.get("name") or container_id[:12]),
        service=_str_or_none(attrs.get("com.docker.compose.service")),
        action=action,
        exit_code=int(exit_code)
        if isinstance(exit_code, str) and exit_code.lstrip("-").isdigit()
        else None,
        signal=_str_or_none(attrs.get("signal")),
        image=_str_or_none(attrs.get("image")),
    )


def _event_time(obj: dict[str, Any]) -> int | None:
    nano = obj.get("timeNano")
    if isinstance(nano, int):
        return nano // 1_000_000
    seconds = obj.get("time")
    if isinstance(seconds, int | float):
        return int(seconds * 1000)
    return None


def _str_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def parse_inspect(text: str, file_id: str) -> list[Container] | None:
    """The containers in `docker inspect` output, or None if it isn't that."""
    try:
        data: Any = json.loads(text)
    except ValueError:
        return None
    if not isinstance(data, list) or not data:
        return None
    containers: list[Container] = []
    for item in data:
        if not isinstance(item, dict) or "State" not in item or "Name" not in item:
            return None
        state: dict[str, Any] = item.get("State") or {}
        config: dict[str, Any] = item.get("Config") or {}
        labels: dict[str, Any] = config.get("Labels") or {}
        health: Any = state.get("Health")
        containers.append(
            Container(
                file_id=file_id,
                container_id=str(item.get("Id", "")),
                name=str(item["Name"]).lstrip("/"),
                service=_str_or_none(labels.get("com.docker.compose.service")),
                image=_str_or_none(config.get("Image")),
                status=str(state.get("Status", "unknown")),
                oom_killed=bool(state.get("OOMKilled")),
                exit_code=state.get("ExitCode") if isinstance(state.get("ExitCode"), int) else None,
                restart_count=int(item.get("RestartCount") or 0),
                created=_docker_time(item.get("Created")),
                started_at=_docker_time(state.get("StartedAt")),
                finished_at=_docker_time(state.get("FinishedAt")),
                health=_str_or_none(health.get("Status")) if isinstance(health, dict) else None,
                error=_str_or_none(state.get("Error")),
            )
        )
    return containers


def _docker_time(value: Any) -> int | None:
    """Docker writes year 1 for a time that never happened, such as a running container's finish."""
    if not isinstance(value, str) or value.startswith("0001-"):
        return None
    return iso_ms(value)
