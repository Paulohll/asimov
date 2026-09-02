FROM debian:12-slim AS base

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep git bash curl ca-certificates nodejs npm \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build-amd64
COPY dist/opencode-linux-x64/bin/opencode /usr/local/bin/opencode

FROM base AS build-arm64
COPY dist/opencode-linux-arm64-musl/bin/opencode /usr/local/bin/opencode

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN opencode --version

# Working directory for projects mounted at runtime
WORKDIR /workspace

ENTRYPOINT ["opencode"]
CMD ["web", "--hostname", "0.0.0.0", "--port", "4000"]
