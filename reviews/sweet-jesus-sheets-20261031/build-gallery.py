#!/usr/bin/env python3
"""Build the numbered review gallery for the Sweet Jesus location and prop sheets.

Reads prompts.json (written alongside the generated plates) and writes index.html,
which links to the single full-size copy of each plate under public/. Nothing is
duplicated, cropped or re-encoded. Usage: python3 build-gallery.py
"""
import html
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PROMPTS = HERE / "prompts.json"
GROUPS = [
    ("Locations", "locations", "png"),
    ("Props and items", "props", "png"),
    ("Scene stills", "scenes", "png"),
]


def main() -> None:
    prompts = json.loads(PROMPTS.read_text()) if PROMPTS.exists() else {}
    cards = []
    missing = []
    for index, (entry_id, entry) in enumerate(prompts.items(), start=1):
        group = entry.get("group", "locations")
        path = ROOT / "public" / "sweet-jesus" / group / f"{entry_id}.png"
        if not path.exists():
            missing.append(entry_id)
        caption = html.escape(entry.get("label", entry_id))
        prompt = html.escape(entry.get("prompt", ""))
        note = html.escape(entry.get("note", ""))
        rel = f"../../public/sweet-jesus/{group}/{entry_id}.png"
        cards.append(
            f"""      <figure class="card">
        <span class="index">{index:02d}</span>
        <a href="{rel}"><img src="{rel}" alt="{caption}" loading="lazy" /></a>
        <figcaption>
          <strong>{caption}</strong>
          <span class="group">{html.escape(group)}</span>
          {f"<em>{note}</em>" if note else ""}
          <details><summary>Prompt</summary><pre>{prompt}</pre></details>
        </figcaption>
      </figure>"""
        )
    page = f"""<!DOCTYPE html>
<meta charset="utf-8" />
<title>Sweet Jesus — reference sheets</title>
<style>
  body {{ background: #14120f; color: #e8e2d6; font: 15px/1.5 Georgia, serif; margin: 0; padding: 32px; }}
  h1 {{ font-size: 22px; letter-spacing: 0.04em; text-transform: uppercase; }}
  p.lede {{ max-width: 68ch; color: #b6ac99; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }}
  figure {{ margin: 0; background: #1c1915; border: 1px solid #2c2721; padding: 12px; }}
  figure img {{ width: 100%; display: block; background: #000; }}
  figcaption {{ padding-top: 10px; }}
  .index {{ color: #c9a227; font-variant-numeric: tabular-nums; }}
  .group {{ display: block; color: #9a8f7c; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }}
  pre {{ white-space: pre-wrap; font-size: 12px; color: #cfc6b4; background: #100e0c; padding: 8px; }}
</style>
<h1>Sweet Jesus — reference sheets</h1>
<p class="lede">{len(prompts)} generated reference plates: rooms, exteriors, vehicles and the items the
story turns on. Each links to the single full-size original under <code>public/sweet-jesus/</code>;
nothing here is a duplicate copy. Group order: locations, props, scene stills.</p>
<div class="grid">
{chr(10).join(cards)}
</div>
"""
    (HERE / "index.html").write_text(page)
    print(f"Wrote index.html with {len(cards)} sheets.")
    if missing:
        print("Missing plates: " + ", ".join(missing))


if __name__ == "__main__":
    main()
