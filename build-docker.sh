#!/usr/bin/env bash
# build-docker.sh — Build the custom OpenCode image and push to a registry.
#
# Usage:
#   ./build-docker.sh [registry/image:tag]
#
# Examples:
#   ./build-docker.sh                                   # local image: opencode-custom:latest
#   ./build-docker.sh gcr.io/my-project/opencode:1.0.0  # push to GCR
#   ./build-docker.sh docker.io/myuser/opencode:latest   # push to Docker Hub
#
# Prerequisites:
#   - bun installed locally
#   - docker installed and logged in to the target registry

set -euo pipefail

IMAGE="${1:-opencode-custom:latest}"
PUSH="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_DIR="$SCRIPT_DIR/packages/opencode"

echo "==> Building OpenCode binary with embedded web UI..."
cd "$OPENCODE_DIR"

# Install deps if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "==> Installing dependencies..."
  bun install
fi

# Build the binary for linux/amd64 (musl, for Alpine)
# --single builds only the current platform target to speed things up
bun run script/build.ts --single

echo "==> Binary built at dist/opencode-linux-x64-baseline-musl/bin/opencode"

echo "==> Building Docker image: $IMAGE"
cd "$SCRIPT_DIR"
docker build \
  --platform linux/amd64 \
  -t "$IMAGE" \
  packages/opencode/

if [ -n "$PUSH" ] || [[ "$IMAGE" == *"/"* && "$IMAGE" != "opencode-custom"* ]]; then
  echo "==> Pushing $IMAGE..."
  docker push "$IMAGE"
  echo "==> Pushed successfully."
else
  echo "==> Image built locally. To push, run: docker push $IMAGE"
fi

echo ""
echo "Done! Image: $IMAGE"
echo ""
echo "To deploy on your GCP VM:"
echo "  1. Copy .env.example to .env and fill in your secrets"
echo "  2. DOCKER_IMAGE=<registry/image> DOCKER_TAG=<tag> docker compose up -d"
