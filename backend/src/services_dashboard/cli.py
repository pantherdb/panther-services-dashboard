"""`services-dashboard`: serve the API, record `docker stats`, or write the OpenAPI schema and the
fixtures for the frontend.

services-dashboard serve --logs ../exports          # http://localhost:8020
services-dashboard serve --sample                   # with the made-up day loaded
services-dashboard record-stats ../exports/stats.log --every 5
services-dashboard openapi ../frontend/openapi.json
"""

import argparse
import json
import os
from pathlib import Path

DEFAULT_PORT = 8020


def main() -> None:
    parser = argparse.ArgumentParser(prog="services-dashboard")
    commands = parser.add_subparsers(dest="command", required=True)

    serve = commands.add_parser("serve", help="serve the API")
    serve.add_argument(
        "--logs", type=Path, help="a folder of exported logs, read at start and on reload"
    )
    serve.add_argument("--sample", action="store_true", help="load the made-up sample day at start")
    serve.add_argument("--host", default="127.0.0.1", help="127.0.0.1 by default: local only")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    serve.add_argument("--reload", action="store_true", help="restart on code changes")

    stats = commands.add_parser(
        "record-stats", help="sample `docker stats` into a file until Ctrl+C"
    )
    stats.add_argument("out", type=Path, help="the file to append to, such as exports/stats.log")
    stats.add_argument("--every", type=float, default=5.0, help="seconds between samples")

    openapi = commands.add_parser("openapi", help="write the OpenAPI schema")
    openapi.add_argument("out", type=Path)

    fixtures = commands.add_parser("fixtures", help="write the API's answers on the sample day")
    fixtures.add_argument("out", type=Path)

    args = parser.parse_args()
    if args.command == "serve":
        _serve(args)
    elif args.command == "record-stats":
        _record_stats(args.out, args.every)
    elif args.command == "openapi":
        _openapi(args.out)
    else:
        from services_dashboard.fixtures import write_fixtures

        for path in write_fixtures(args.out):
            print(f"Wrote {path}")


def _serve(args: argparse.Namespace) -> None:
    import uvicorn

    if args.logs is not None:
        if not args.logs.is_dir():
            raise SystemExit(f"Not a folder: {args.logs}")
        os.environ["PSD_LOGS_DIR"] = str(args.logs.resolve())
    if args.sample:
        os.environ["PSD_LOAD_SAMPLE"] = "true"
    uvicorn.run("services_dashboard.main:app", host=args.host, port=args.port, reload=args.reload)


def _openapi(out: Path) -> None:
    from services_dashboard.main import create_app

    schema = create_app().openapi()
    out.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out}")


def _record_stats(out: Path, every: float) -> None:
    from services_dashboard.record_stats import record

    print(f"Recording docker stats every {every:g} s into {out}. Ctrl+C to stop.")
    try:
        record(out, every)
    except KeyboardInterrupt:
        print(f"Stopped. {out} has the samples.")
