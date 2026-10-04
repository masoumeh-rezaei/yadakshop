#!/bin/bash
set -euo pipefail
[[ ${GITHUB_SHA:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
root=${GITHUB_WORKSPACE:-$(pwd)}
output=${RUNNER_TEMP:?}
package=$(mktemp -d "$output/peik-package.XXXXXX")
trap 'rm -rf -- "$package"' EXIT
mkdir -p "$package/backend" "$package/panel"
for app in delivery-backend delivery-panel; do
  cd "$root/$app"
  rm -rf -- dist
  npm ci --ignore-scripts --no-audit --no-fund
  VITE_API_URL=https://peik.ydsp.ir npm run build
done
cd "$root/delivery-backend"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
cp -R dist node_modules package.json package-lock.json "$package/backend/"
if [[ -d migrations ]]; then cp -R migrations "$package/backend/"; fi
rm -rf -- "$package/backend/node_modules/.bin"
cp -R "$root/delivery-panel/dist/." "$package/panel/"
tar -czf "$output/peik-release.tar.gz" -C "$package" backend panel
cd "$output"
sha256sum peik-release.tar.gz > peik-release.sha256
printf 'RELEASE_BUILT %s Node=%s\n' "$GITHUB_SHA" "$(node --version)"
