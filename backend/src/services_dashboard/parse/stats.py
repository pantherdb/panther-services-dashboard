"""`docker stats`, one JSON object per container per sample, recorded with a time in front:

    2026-11-04T03:00:00Z {"BlockIO":"0B / 0B","CPUPerc":"12.34%","Container":"3f1c9a0b7e2d",
     "ID":"3f1c9a0b7e2d","MemPerc":"25.10%","MemUsage":"512MiB / 2GiB",
     "Name":"panther-scoring-services-api-1","NetIO":"1.2kB / 3.4kB","PIDs":"12"}

`docker stats --no-stream --format '{{json .}}'` prints no time of its own, so a line is only
usable with the prefix `services-dashboard record-stats` (or a shell loop) puts in front; a bare
one is left unparsed, which the files page shows.
"""

import json
import re
from typing import Any

from services_dashboard.parse.docker import IGNORED, Ignored
from services_dashboard.records import Stat

_SIZE = re.compile(r"^([\d.]+)\s*([KMGTP]?i?B|kB)$")
_UNITS = {
    "B": 1,
    "kB": 1000,
    "KB": 1000,
    "MB": 1000**2,
    "GB": 1000**3,
    "TB": 1000**4,
    "PB": 1000**5,
    "KiB": 1024,
    "MiB": 1024**2,
    "GiB": 1024**3,
    "TiB": 1024**4,
    "PiB": 1024**5,
}
# Compose names containers `<project>-<service>-<n>` (v1: underscores). A service with a dash in
# its name comes out as its last part; the store fills services from inspect and events too.
_COMPOSE_NAME = re.compile(r"[-_]([A-Za-z0-9.]+)[-_]\d+$")


def parse_size(text: str) -> int | None:
    """`512MiB`, `1.953GiB`, `12.1kB` or `0B` in bytes. Docker writes memory in binary units and
    network and disk in decimal ones."""
    m = _SIZE.match(text.strip())
    if not m or m[2] not in _UNITS:
        return None
    try:
        return round(float(m[1]) * _UNITS[m[2]])
    except ValueError:
        return None


def parse_stat(line: str, file_id: str, t: int) -> Stat | Ignored | None:
    if not line.startswith("{"):
        return None
    try:
        obj: Any = json.loads(line)
    except ValueError:
        return None
    if not isinstance(obj, dict) or "CPUPerc" not in obj or "MemUsage" not in obj:
        return None
    cpu_text = str(obj.get("CPUPerc", "")).rstrip("%")
    used, _, limit = str(obj.get("MemUsage", "")).partition("/")
    mem = parse_size(used)
    try:
        cpu = float(cpu_text)
    except ValueError:
        cpu = None
    # A stopped container reads `--` for both: understood, nothing to chart.
    if cpu is None or mem is None:
        return IGNORED
    name = str(obj.get("Name") or obj.get("Container") or obj.get("ID") or "")
    service = _COMPOSE_NAME.search(name)
    return Stat(
        file_id=file_id,
        t=t,
        container_id=str(obj.get("ID") or obj.get("Container") or ""),
        container=name,
        service=service[1] if service else None,
        cpu_pct=cpu,
        mem_bytes=mem,
        mem_limit_bytes=parse_size(limit) if limit else None,
    )
