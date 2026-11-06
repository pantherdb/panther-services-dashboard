# The dashboard's UI, built and served by nginx, so a machine needs no Node. Build context:
# frontend/. Stages, from one build:
#   build  npm ci and npm run build
#   web    nginx serving the build on port 8080, forwarding /api/ to the backend (the default)
#
# Base images are pinned by digest, the same pins as panther-scoring-services' frontend image
# (multi-platform index digests, read with `docker buildx imagetools inspect` on 2026-11-04).
ARG NODE_IMAGE=node:24.22.2-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.1-alpine@sha256:acc3239879a65d9e3d250b21847ec3f34f33367017394d22830242af15cf1cb0

# The built files are the same on every platform, so build on the machine's own.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /work
# The dependencies first, so a change to the source alone doesn't reinstall them. A network that
# re-signs TLS needs its CA certificate, which Node doesn't otherwise trust: pass it as a build
# secret, `--secret id=ca,src=<the CA's .pem>`. A secret isn't kept in any layer.
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
# The path the UI is served under; the API is always /api/v1 on the same address.
ARG BASE_PATH=/
RUN npm run build

# nginx as a user other than root, on port 8080. Its entrypoint fills templates/*.template from
# the environment, replacing only the variables that are set, so nginx's own $host and the like
# stay. API_UPSTREAM is where /api/ goes: compose's api service by default. With
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS set, the entrypoint also fills NGINX_LOCAL_RESOLVERS from the
# container's DNS, so a restarted api container, with a new address, is found again.
FROM ${NGINX_IMAGE} AS web
ENV API_UPSTREAM=http://api:8020 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --chmod=0755 nginx/05-api-upstream.envsh /docker-entrypoint.d/05-api-upstream.envsh
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /work/dist/ /srv/site/
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
