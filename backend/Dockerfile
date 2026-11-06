# The dashboard's backend, so a machine needs no Python or uv. Build context: backend/.
# compose.yaml at the repository root runs it beside the web image, which is the only way in.
#
# Base images are pinned by digest, the same pins as panther-scoring-services' root Dockerfile
# (multi-platform index digests, read with `docker buildx imagetools inspect` on 2026-11-04):
# changing a pin is a change to this file.
ARG PYTHON_IMAGE=python:3.13-slim-trixie@sha256:2d44738ebf4ce5f63b9d9ea871e9c7cfdc0426f7b0c97cac915fd88ded1d86bb
# Keep the uv version in step with required-version in pyproject.toml and with ci.yml.
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0

# COPY --from can't take an ARG, so the uv image gets a stage name.
FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS api
COPY --from=uv /uv /usr/local/bin/
RUN useradd --create-home --uid 1000 --user-group dashboard \
    && mkdir -p /opt/venv /work /logs \
    && chown dashboard:dashboard /opt/venv /work
USER dashboard
WORKDIR /work
# uv uses the image's Python and never downloads one. The environment lives outside the source,
# and its bytecode is compiled now rather than on the first request.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1
# The dependencies first, so a change to the source alone doesn't reinstall them. An out-of-date
# uv.lock fails the build rather than being rewritten.
COPY --chown=dashboard:dashboard pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-cache --no-install-project
COPY --chown=dashboard:dashboard src/ ./src/
RUN uv sync --locked --no-dev --no-cache --no-editable

# The folder compose mounts read-only. Empty, the dashboard starts with nothing loaded, and files
# can still be uploaded or the sample loaded from the Files page.
ENV PSD_LOGS_DIR=/logs
EXPOSE 8020
# Loading a large folder, or the sample, happens before the first answer: a long start period.
HEALTHCHECK --interval=5s --timeout=3s --start-period=120s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8020/api/v1/health', timeout=2)"]
# 0.0.0.0 inside the container, so the web container can reach it. Nothing else can: compose
# publishes no port for it, and publishes the web container's on 127.0.0.1 alone.
CMD ["services-dashboard", "serve", "--host", "0.0.0.0", "--port", "8020"]
