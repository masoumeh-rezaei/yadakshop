#!/bin/bash
set -euo pipefail
[[ ${GITHUB_SHA:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
root=${GITHUB_WORKSPACE:-$(pwd)}
output=${RUNNER_TEMP:?}
package=$(mktemp -d "$output/peik-package.XXXXXX")
backend_stage=''
trap 'rm -rf -- "$package"; if [[ -n "$backend_stage" ]]; then rm -rf -- "$backend_stage"; fi' EXIT
mkdir -p "$package/backend" "$package/panel"
for app in delivery-backend delivery-panel; do
  cd "$root/$app"
  rm -rf -- dist
  npm ci --ignore-scripts --no-audit --no-fund
  VITE_API_URL=https://peik.ydsp.ir npm run build
  if [[ "$app" == delivery-backend ]]; then
    node --test tests/*.test.cjs
  else
    node --experimental-strip-types --test tests/*.test.mjs
  fi
done
backend_ref=$(node "$root/.github/scripts/release-backend.mjs" "$root" "$GITHUB_SHA")
backend_build="$root/delivery-backend"
if [[ "$backend_ref" != "$GITHUB_SHA" ]]; then
  backend_stage=$(mktemp -d "$output/peik-backend.XXXXXX")
  git -C "$root" archive "$backend_ref" delivery-backend | tar -x -C "$backend_stage"
  backend_build="$backend_stage/delivery-backend"
  cd "$backend_build"
  npm ci --ignore-scripts --no-audit --no-fund
  npm run build
  node --test tests/*.test.cjs
fi
cd "$backend_build"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
cp -R dist node_modules package.json package-lock.json "$package/backend/"
if [[ -d migrations ]]; then cp -R migrations "$package/backend/"; fi
printf '{"backendSource":"%s","release":"%s"}\n' "$backend_ref" "$GITHUB_SHA" > "$package/backend/release-source.json"
rm -rf -- "$package/backend/node_modules/.bin"
cp -R "$root/delivery-panel/dist/." "$package/panel/"
tar -czf "$output/peik-release.tar.gz" -C "$package" backend panel
cd "$output"
sha256sum peik-release.tar.gz > peik-release.sha256
printf 'RELEASE_BUILT %s Backend=%s Node=%s\n' "$GITHUB_SHA" "$backend_ref" "$(node --version)"
