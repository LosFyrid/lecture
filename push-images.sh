#!/usr/bin/env bash

set -euo pipefail

# Default settings
REGISTRY_HOST="harbor.pic-aichem.online"
BACKEND_REPO="lecture-api"
FRONTEND_REPO="lecture-web"

# Optional first argument: image tag (default: latest)
TAG="${1:-latest}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_IMAGE="${REGISTRY_HOST}/sunyk/${BACKEND_REPO}:${TAG}"
FRONTEND_IMAGE="${REGISTRY_HOST}/sunyk/${FRONTEND_REPO}:${TAG}"

echo "Using registry: ${REGISTRY_HOST}"
echo "Backend image:  ${BACKEND_IMAGE}"
echo "Frontend image: ${FRONTEND_IMAGE}"

echo
echo "Building backend image..."
docker build -t "${BACKEND_IMAGE}" "${ROOT_DIR}/api"

echo
echo "Building frontend image..."
docker build -t "${FRONTEND_IMAGE}" -f "${ROOT_DIR}/web/Dockerfile" "${ROOT_DIR}"

echo
echo "Pushing backend image..."
docker push "${BACKEND_IMAGE}"

echo
echo "Pushing frontend image..."
docker push "${FRONTEND_IMAGE}"

echo
echo "Done."
