#!/usr/bin/env bash
# Build the editor's small, offline-friendly cast portraits from the generated
# originals. Requires ImageMagick's `convert`. Never modifies the originals.
set -euo pipefail
cd "$(dirname "$0")/.."
out="src/assets/miami-vice/portraits"
mkdir -p "$out"

# The generated cast plates are 1408x768. A letterboxed 1024x576 canvas keeps the
# whole frame and matches the 16:9 keyframe size used for scene stills.
count=0
for source in public/miami-vice/characters/*.png; do
  target="$out/$(basename "${source%.png}").jpg"
  convert "$source" -resize '1024x576' -background '#0b0f14' -gravity center \
    -extent 1024x576 -strip -quality 80 "$target"
  count=$((count + 1))
done
printf 'Built %s Miami Vice cast portraits from the preserved originals.\n' "$count"
