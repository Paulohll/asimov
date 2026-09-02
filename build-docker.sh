#!/usr/bin/env bash
# build-docker.sh — Build the custom OpenCode image and push to a registry.
#
# Usage:
#   ./build-docker.sh [registry/image:tag]
#
# Examples:
#   ./build-docker.sh                                                              # push to the default asimov Artifact Registry, tag "latest"
#   ./build-docker.sh europe-west1-docker.pkg.dev/affiliatteaccess/asimov/opencode:1.0.0  # push a specific tag
#   ./build-docker.sh docker.io/myuser/opencode:latest                             # push to a different registry
#
# Prerequisites:
#   - bun installed locally
#   - docker installed and logged in to the target registry

set -euo pipefail

DEFAULT_IMAGE="europe-west1-docker.pkg.dev/affiliatteaccess/asimov/opencode:latest"
IMAGE="${1:-$DEFAULT_IMAGE}"
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

# Build the binary for linux/amd64 (glibc, for the debian-slim base image)
# --single builds only the current platform target to speed things up
bun run script/build.ts --single

echo "==> Binary built at dist/opencode-linux-x64/bin/opencode"

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
echo "To deploy on the GCP VM:"
echo "  1. On the VM, copy deploy/.env.example to /opt/asimov/.env and fill in secrets"
echo "  2. DOCKER_IMAGE=<registry/image> DOCKER_TAG=<tag> docker compose -f /opt/asimov/docker-compose.yml up -d"
