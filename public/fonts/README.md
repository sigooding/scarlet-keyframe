# Self-hosted fonts

These original WOFF2 binaries are shipped locally so Studio, offline use and packaged builds do not depend on Google Fonts. Per-family SIL Open Font License notices are included beside the files. The font binaries have not been modified.

Sources (Fontsource npm distributions):

| Package | Version | Files used |
|---|---|---|
| `@fontsource/alfa-slab-one` | 5.3.0 | Latin regular 400 |
| `@fontsource/bebas-neue` | 5.3.0 | Latin regular 400 |
| `@fontsource-variable/newsreader` | 5.3.0 | Latin weight axis, normal and italic |
| `@fontsource-variable/oswald` | 5.3.0 | Latin weight axis |
| `@fontsource-variable/playfair-display` | 5.3.0 | Latin weight axis, normal and italic |
| `@fontsource-variable/cinzel` | 5.3.0 | Latin weight axis |
| `@fontsource-variable/josefin-sans` | 5.3.0 | Latin weight axis, normal and italic |
| `@fontsource-variable/noto-emoji` | 5.3.1 | Ten Unicode subsets, weight axis |

Face declarations and Noto Emoji Unicode ranges are in `src/fonts.css`. Text uses system-font fallbacks for characters outside the shipped Latin subsets. Vite rewrites the public font URLs to relative paths in the single-file production build; distribute this directory alongside `dist/index.html`, just like story assets.
