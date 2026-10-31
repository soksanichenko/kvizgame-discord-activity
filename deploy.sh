#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# The AlmaLinux mirrorlist points dnf at portal.zelgray.cherkasy.ua. Containers
# do not read this machine's /etc/hosts and use public DNS, where that host
# answers 401, so pass the address this machine resolves it to into the build.
MIRROR_HOST="portal.zelgray.cherkasy.ua"
BUILD_ARGS=()
mirror_ip="$(getent ahostsv4 "${MIRROR_HOST}" | awk 'NR==1 {print $1}')"
if [[ -n "$mirror_ip" ]]; then
  BUILD_ARGS+=(--add-host "${MIRROR_HOST}:${mirror_ip}")
fi

REGISTRY="ghcr.io/soksanichenko/kvizgame-discord-activity"
IMAGE_TAG="dev"
LOCAL_TRANSFER=false
INVENTORY="inventories/zelgray.work"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_TRANSFER=true; shift;;
    -i|--inventory) INVENTORY="$2"; shift 2;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

echo "=== Building Docker image ==="
docker build "${BUILD_ARGS[@]}" -t "${REGISTRY}:${IMAGE_TAG}" "${PROJECT_DIR}"

if [[ "$LOCAL_TRANSFER" == true ]]; then
  echo "=== Transferring image directly to remote (skipping GHCR push) ==="
  SSH_TARGET=$(cd "${PROJECT_DIR}/ansible" && \
    ansible-inventory -i "${INVENTORY}" --list | \
    python3 -c "import sys,json; h=json.load(sys.stdin)['_meta']['hostvars']; v=list(h.values())[0]; print(v['ansible_user']+'@'+v['ansible_host'])")
  docker save "${REGISTRY}:${IMAGE_TAG}" | ssh "${SSH_TARGET}" docker load
  EXTRA_VARS="-e kvizgame_image_tag=${IMAGE_TAG} -e kvizgame_image_pull=never"
else
  echo "=== Pushing Docker image to GHCR ==="
  docker push "${REGISTRY}:${IMAGE_TAG}"
  EXTRA_VARS="-e kvizgame_image_tag=${IMAGE_TAG}"
fi

echo "=== Deploying ==="
pushd "${PROJECT_DIR}/ansible" || exit 1
# EXTRA_VARS holds several words (-e a -e b) and must be split on purpose;
# quoting it would hand ansible-playbook a single argument.
# shellcheck disable=SC2086
ansible-playbook -i "${INVENTORY}" -vv "playbooks/deploy.yml" ${EXTRA_VARS}
popd || exit 1
