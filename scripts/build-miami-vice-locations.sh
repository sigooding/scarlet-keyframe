#!/usr/bin/env bash
# Build the editor's small, offline-friendly location plates from the generated
# originals. Requires ImageMagick's `convert`. Never modifies the originals.
set -euo pipefail
cd "$(dirname "$0")/.."
out="src/assets/miami-vice/locations"
mkdir -p "$out"

# A letterboxed 1280x720 canvas retains the whole generated plate; no cropping away
# the crate numbers or the skyline.
count=0
for source in public/miami-vice/locations/*.png; do
  target="$out/$(basename "${source%.png}").jpg"
  convert "$source" -resize '1280x720' -background '#0b0f14' -gravity center \
    -extent 1280x720 -strip -quality 84 "$target"
  count=$((count + 1))
done
printf 'Built %s Miami Vice location plates from the preserved originals.\n' "$count"
