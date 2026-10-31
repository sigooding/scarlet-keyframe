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

count=0
for source in public/sweet-jesus/locations/*.png; do
  [ -e "$source" ] || continue
  plate "$source" "$locations/$(basename "${source%.png}").jpg"
  count=$((count + 1))
done

# Prop sheets are kept with transparency, like the selected recorder reference,
# so they can be read against any background in the gallery.
pcount=0
for source in public/sweet-jesus/props/*.png; do
  [ -e "$source" ] || continue
  convert "$source" -resize '1000x1000>' -strip "$props/$(basename "$source")"
  pcount=$((pcount + 1))
done

printf 'Built %s Sweet Jesus location plates and %s prop sheets from the preserved originals.\n' "$count" "$pcount"
