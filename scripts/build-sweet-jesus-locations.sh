#!/usr/bin/env bash
# Build the editor's small, offline-friendly location and prop sheets from the
# generated originals. Requires ImageMagick's `convert`. Never modifies the
# originals in public/, which stay the full-size reference plates.
set -euo pipefail
cd "$(dirname "$0")/.."
locations="src/assets/sweet-jesus/locations"
props="src/assets/sweet-jesus/props"
mkdir -p "$locations" "$props"

# A letterboxed 1280x720 canvas keeps the whole plate: no stretching, cropping
# or reframing of a location master.
plate() {
  convert "$1" -resize '1280x720' -background '#14120f' -gravity center \
    -extent 1280x720 -strip -quality 84 "$2"
}

# Scene keyframes are inline assets in the built editor, so they are previewed at
# 1024x576: a third of the bytes of a 1280x720 plate, and still full-frame sharp
# in the cinematic preview.
scenes="src/assets/sweet-jesus/scenes"
mkdir -p "$scenes"
keyframe() {
  convert "$1" -resize '1024x576' -background '#14120f' -gravity center \
    -extent 1024x576 -strip -quality 80 "$2"
}

count=0
for source in public/sweet-jesus/locations/*.png; do
  [ -e "$source" ] || continue
  plate "$source" "$locations/$(basename "${source%.png}").jpg"
  count=$((count + 1))
done

# Prop sheets stay on their neutral seamless ground, so, unlike the transparent
# recorder cutout, they are previewed as compact letterboxed JPEGs.
pcount=0
for source in public/sweet-jesus/props/*.png; do
  [ -e "$source" ] || continue
  convert "$source" -resize '960x540' -background '#14120f' -gravity center \
    -extent 960x540 -strip -quality 84 "$props/$(basename "${source%.png}").jpg"
  pcount=$((pcount + 1))
done

kcount=0
for source in public/sweet-jesus/scenes/*.png; do
  [ -e "$source" ] || continue
  keyframe "$source" "$scenes/$(basename "${source%.png}").jpg"
  kcount=$((kcount + 1))
done

printf 'Built %s location plates, %s prop sheets and %s scene keyframes from the preserved originals.\n' \
  "$count" "$pcount" "$kcount"
