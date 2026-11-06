"""`services-dashboard record-stats OUT`: samples `docker stats` every few seconds into a file the
dashboard reads.

`docker stats --no-stream` prints each container's CPU and memory once, with no time, so each line
is written with the current UTC time in front, the shape `docker logs -t` uses. Runs until Ctrl+C.
Docker runs from PATH with an argument list, never through a shell.
"""

import subprocess
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

COMMAND = ("docker", "stats", "--no-stream", "--format", "{{json .}}")

type Runner = Callable[[], str]
type Clock = Callable[[], datetime]


def stamp(output: str, moment: datetime) -> list[str]:
    """Each non-empty line of `docker stats` output with the time in front."""
    prefix = moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [f"{prefix} {line.strip()}" for line in output.splitlines() if line.strip()]


def run_docker_stats() -> str:
    try:
        done = subprocess.run(COMMAND, capture_output=True, text=True, check=False)  # noqa: S603
    except FileNotFoundError as error:
        raise SystemExit(
            "docker isn't on PATH: install Docker or open a shell that has it"
        ) from error
    if done.returncode != 0:
        raise SystemExit(f"docker stats failed: {done.stderr.strip() or done.returncode}")
    return done.stdout


def record(
    out: Path,
    every_s: float,
    runner: Runner = run_docker_stats,
    clock: Clock = lambda: datetime.now(UTC),
    sleep: Callable[[float], None] = time.sleep,
    rounds: int | None = None,
) -> int:
    """Appends samples to `out` until interrupted (or `rounds` samples, for tests). Returns the
    number of lines written."""
    written = 0
    done = 0
    with out.open("a", encoding="utf-8") as f:
        while rounds is None or done < rounds:
            started = time.monotonic()
            lines = stamp(runner(), clock())
            f.writelines(line + "\n" for line in lines)
            # Flushed every sample, so the dashboard can read the file while this runs.
            f.flush()
            written += len(lines)
            done += 1
            if rounds is None or done < rounds:
                # `docker stats --no-stream` itself takes a second or two; keep the period steady.
                sleep(max(0.0, every_s - (time.monotonic() - started)))
    return written
