"""nginx's access and error logs.

Access: the official image's `main` format, which the scoring site's web image uses because its
server block sets no `access_log` of its own:

    $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" "$http_x_forwarded_for"

`combined` (no forwarded-for) parses too. `main` has no times, so latency can't be charted from it.
Append ` rt=$request_time urt="$upstream_response_time"` to the format and this reads them.

Error: `2026/11/06 05:00:01 [error] 29#29: *1 connect() failed (111: Connection refused) …`. Its
time has no zone; it's read as UTC, which is what the official image's containers use.
"""

import re
from datetime import UTC, datetime, timedelta

from services_dashboard.records import Level, Log, Request, to_ms

_ACCESS = re.compile(
    r'^(\S+) - (\S+) \[([^\]]+)\] "([^"]*)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"(.*)$'
)
_REQUEST = re.compile(r"^([A-Z]+) (\S+)(?: HTTP/[\d.]+)?$")
_TIME_LOCAL = re.compile(r"^(\d{2})/(\w{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$")
_REQUEST_TIME = re.compile(r"\brt=([\d.]+)")
# A retried request lists one time per upstream ("0.050, 0.120"); the first is enough here.
_UPSTREAM_TIME = re.compile(r'\burt="?([\d.]+)')
_ERROR = re.compile(
    r"^(\d{4})/(\d{2})/(\d{2}) (\d{2}):(\d{2}):(\d{2}) \[(\w+)\] \d+#\d+: (?:\*\d+ )?(.*)$"
)

# By name, not strptime's %b, which follows the machine's locale.
_MONTHS = {
    m: i + 1
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    )
}
_ERROR_LEVELS: dict[str, Level] = {
    "debug": "DEBUG",
    "info": "INFO",
    "notice": "INFO",
    "warn": "WARNING",
    "error": "ERROR",
    "crit": "CRITICAL",
    "alert": "CRITICAL",
    "emerg": "CRITICAL",
}


def parse_time_local(value: str) -> int | None:
    """`06/Nov/2026:05:00:01 +0000` as epoch milliseconds, or None."""
    m = _TIME_LOCAL.match(value)
    if not m or m[2] not in _MONTHS:
        return None
    sign = -1 if m[7] == "-" else 1
    offset = timedelta(hours=int(m[8]), minutes=int(m[9])) * sign
    local = datetime(
        int(m[3]), _MONTHS[m[2]], int(m[1]), int(m[4]), int(m[5]), int(m[6]), tzinfo=UTC
    )
    return to_ms(local - offset)


def parse_access(line: str, file_id: str) -> Request | None:
    m = _ACCESS.match(line)
    if not m:
        return None
    client, _user, time_local, request, status, size, _referer, _agent, rest = m.groups()
    t = parse_time_local(time_local)
    if t is None:
        return None
    # A malformed request, such as a TLS handshake sent to the plain port, still counts.
    req = _REQUEST.match(request)
    rt = _REQUEST_TIME.search(rest)
    urt = _UPSTREAM_TIME.search(rest)
    return Request(
        file_id=file_id,
        t=t,
        source="nginx",
        method=req[1] if req else "INVALID",
        path=req[2].split("?", 1)[0] if req else "-",
        status=int(status),
        bytes=None if size == "-" else int(size),
        duration_ms=float(rt[1]) * 1000 if rt else None,
        upstream_ms=float(urt[1]) * 1000 if urt else None,
        client=client,
    )


def parse_error(line: str, file_id: str) -> Log | None:
    m = _ERROR.match(line)
    if not m:
        return None
    y, mo, d, h, mi, s, level, message = m.groups()
    t = to_ms(datetime(int(y), int(mo), int(d), int(h), int(mi), int(s), tzinfo=UTC))
    return Log(
        file_id=file_id,
        t=t,
        source="nginx",
        level=_ERROR_LEVELS.get(level, "ERROR"),
        logger="nginx",
        message=message,
    )
