#!/usr/bin/env bash

set -Eeuo pipefail

readonly APP_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ENV_FILE="${APP_DIRECTORY}/env.production"
readonly RELEASE_FILE="${APP_DIRECTORY}/.release.env"
readonly CANDIDATE_FILE="${APP_DIRECTORY}/.candidate.env"
readonly IMAGE_TAG="${1:-}"
shift || true
readonly SERVICES=("$@")

if [[ ! "${IMAGE_TAG}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "Usage: $0 IMAGE_TAG SERVICE..." >&2
  exit 64
fi

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  echo "At least one service is required." >&2
  exit 64
fi

for service in "${SERVICES[@]}"; do
  case "${service}" in
    api|worker|business-system|platform|widget) ;;
    *) echo "Unknown service: ${service}" >&2; exit 64 ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy env.production.example and add production secrets." >&2
  exit 66
fi

cd "${APP_DIRECTORY}"
exec 9>"${APP_DIRECTORY}/.deploy.lock"
flock -n 9 || { echo "Another deployment is already running." >&2; exit 75; }

umask 077
printf 'IMAGE_TAG=%s\n' "${IMAGE_TAG}" > "${CANDIDATE_FILE}"
trap 'rm -f "${CANDIDATE_FILE}"' EXIT

compose=(
  docker compose
  --env-file "${ENV_FILE}"
  --env-file "${CANDIDATE_FILE}"
  -f "${APP_DIRECTORY}/compose.prod.yaml"
)

echo "Validating release ${IMAGE_TAG}..."
"${compose[@]}" config --quiet

echo "Pulling immutable application images..."
"${compose[@]}" pull "${SERVICES[@]}"

if [[ " ${SERVICES[*]} " == *" api "* ]]; then
  echo "Applying database migrations..."
  "${compose[@]}" up -d postgres
  "${compose[@]}" run --rm migrate
fi

echo "Starting application services..."
if ! "${compose[@]}" up -d --no-deps --remove-orphans --wait --wait-timeout 180 "${SERVICES[@]}"; then
  "${compose[@]}" ps
  "${compose[@]}" logs --tail=150 "${SERVICES[@]}"
  echo "Deployment failed. Re-run this script with the previous commit SHA to roll back the images." >&2
  exit 1
fi

"${compose[@]}" ps
docker image prune --all --force \
  --filter "label=org.opencontainers.image.source=https://github.com/azarnuzy/supports-ops" \
  || echo "Image cleanup failed; deployment remains healthy." >&2
mv "${CANDIDATE_FILE}" "${RELEASE_FILE}"
trap - EXIT
echo "Release ${IMAGE_TAG} is healthy."
