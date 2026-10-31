#!/usr/bin/env bash
# Build the editor's small, offline-friendly images from the voted originals.
# Requires ImageMagick's `convert`. Never modifies the selected originals.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
style="src/assets/sweet-jesus/launderette"
opening="src/assets/sweet-jesus/opening"
mkdir -p "$style" "$opening"

# A letterboxed 1280x720 canvas retains the entire source, including the unusually
# wide newspaper vote; no stretching or cropping away the recorder or towels.
frame() {
  convert "$1" -resize '1280x720' -background '#14120f' -gravity center \
    -extent 1280x720 -strip -quality 84 "$2"
}
frame public/sweet-jesus/launderette/interior.webp "$style/interior.jpg"
frame public/sweet-jesus/launderette/exterior.webp "$style/exterior.jpg"
frame public/sweet-jesus/launderette/folding-table.webp "$style/folding-table.jpg"
convert public/sweet-jesus/launderette/cassette-with-mic.png -resize '1000x1000>' \
  -strip "$style/cassette-with-mic.png"

# The original selected two-shot did not show Bug's recorder. For the opening
# reference only, composite the selected recorder on the washer and suggest the
# mic cable. This derivative is explicitly described as a composite in the UI.
convert scripts/assets/sweet-jesus-recorder-mask.png -background black -alpha remove -alpha off "$tmp/mask.png"
convert public/sweet-jesus/launderette/cassette-with-mic.png -alpha extract \
  "$tmp/mask.png" -compose multiply -composite "$tmp/alpha.png"
convert public/sweet-jesus/launderette/cassette-with-mic.png "$tmp/alpha.png" \
  -alpha off -compose copyopacity -composite -trim +repage "$tmp/device.png"
convert "$tmp/device.png" -background none -rotate -10 -resize 145x \
  -modulate 82,85,100 -blur 0x0.45 "$tmp/device-in-scene.png"
convert public/sweet-jesus/opening/brothers-washer-voted.png \
  -fill 'rgba(11,12,10,0.32)' -stroke none -draw 'ellipse 220,319 68,3 0,360' \
  -stroke 'rgba(19,20,17,0.8)' -strokewidth 2 -fill none \
  -draw 'path "M 280,315 C 315,318 355,319 386,320"' \
  "$tmp/device-in-scene.png" -geometry +150+252 -compose over -composite "$tmp/brothers.png"
frame "$tmp/brothers.png" "$opening/brothers-washer.jpg"
for pair in \
  'brothers-newspaper-169.png brothers-newspaper.jpg' \
  'brothers-quarters.png brothers-quarters.jpg' \
  'peanut-exits-169.png peanut-exits.jpg' \
  'bug-recording-169.png bug-recording.jpg' \
  'pinky-ring-169.png pinky-ring.jpg' \
  'bug-labels-tape-169.png bug-labels-tape.jpg'; do
  read -r source target <<< "$pair"
  frame "public/sweet-jesus/opening/$source" "$opening/$target"
done
printf 'Built Sweet Jesus 16:9 previews from the preserved selected originals.\n'
