# CI/HA helper images are built from the exact upstream source releases.
# MinIO Community no longer publishes precompiled server images; never fall back
# to a mutable or third-party mirror for these runtime evidence drills.
FROM golang:1.24.2-bookworm AS go-build-base
ENV GOTOOLCHAIN=local
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

FROM go-build-base AS minio-builder
ARG MINIO_REF=RELEASE.2025-04-22T22-12-26Z
ARG MINIO_COMMIT=0d7408fc9969caf07de6a8c3a84f9fbb10a6739e
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN git clone --depth 1 --branch "${MINIO_REF}" https://github.com/minio/minio.git /src \
 && test "$(git -C /src rev-parse HEAD)" = "${MINIO_COMMIT}"
WORKDIR /src
RUN mkdir -p /out \
 && CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build -trimpath \
      -ldflags="$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "${MINIO_REF#RELEASE.}")" \
      -o /out/minio .

FROM debian:bookworm-slim AS minio-runtime
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 minio \
 && useradd --system --uid 10001 --gid 10001 --home-dir /home/minio --create-home minio \
 && mkdir -p /data \
 && chown 10001:10001 /data /home/minio
COPY --from=minio-builder /out/minio /usr/local/bin/minio
COPY --from=minio-builder /src/LICENSE /licenses/minio/LICENSE
ENV HOME=/home/minio
USER 10001:10001
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]

FROM go-build-base AS mc-builder
ARG MC_REF=RELEASE.2025-04-16T18-13-26Z
ARG MC_COMMIT=b00526b153a31b36767991a4f5ce2cced435ee8e
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN git clone --depth 1 --branch "${MC_REF}" https://github.com/minio/mc.git /src \
 && test "$(git -C /src rev-parse HEAD)" = "${MC_COMMIT}"
WORKDIR /src
RUN mkdir -p /out \
 && CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build -trimpath \
      -ldflags="$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "${MC_REF#RELEASE.}")" \
      -o /out/mc .

FROM debian:bookworm-slim AS mc-runtime
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=mc-builder /out/mc /usr/local/bin/mc
COPY --from=mc-builder /src/LICENSE /licenses/mc/LICENSE
ENTRYPOINT ["/usr/local/bin/mc"]
