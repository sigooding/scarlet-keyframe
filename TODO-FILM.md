# To do — the film

The director's notes, written down and **not yet done**. No picture has been generated, no line re-recorded and nothing
in `src/data/nobodys-witness-film.json` changed for anything on this page.

---

## 1. Scene 1 — Sakai's refusal, and the blood (5 November 2026)

The director, in their own words:

> sakai needs images to show him shaking head after sc1 beat 12. blood needs to be under maras hand on sc1 b20 and a
> stream of blood in the water on sc1 b21. and just a puddle of rain water on pavement leaking blood after sc1 b22

The numbers are scene 1's **pictures in order** (its 1st, 12th, 20th … picture), not beat ids. Read that way they land
exactly on the shooting and what follows, so that is how they are written out here. The beat each picture plays on is
`nw_b…` below; the picture number is what the director counted.

| # | Picture | Plays on | What it shows now | What is wanted |
| --- | --- | --- | --- | --- |
| 12 | `s1/09-old-man-stops.jpg` | `nw_b24` (beat 19) — "He sees it. He stops, six metres short of her. For one second his whole face changes." | Sakai stopped, seeing the red clip | — (the anchor the director counted from) |
| 13 | `s1/331-he-refuses.jpg` | `nw_b25` (beat 20) — "Then he shakes his head. Barely. A man refusing a stranger. And he turns his back on her" | the refusal, but **the head shake does not read** | **new picture(s) of Sakai shaking his head**, after picture 12. A still cannot show a shake, so it wants the half-turned head and the eyes already leaving her — or two frames, the head at one side and then away, cut together. Keep the lane's geometry (barbershop left, vending machine right, bar at the far end) and his locked face, cap and cheap raincoat. |
| 20 | `s1/14-she-kneels.jpg` | `nw_b39` (beat 34) — "Mara runs to the old man. Her bag slides off her shoulder and spills across the wet street." | Mara kneeling at Sakai | **blood under Mara's hand** |
| 21 | `s1/15-the-grip.jpg` | `nw_b42` (beat 37) — "His hand comes out of his coat with something small and brass in it. He presses it into her hand." | his hand pressing the key into hers | **a stream of blood in the water** |
| 22 → 23/24 | after `s1/16-the-key.jpg` (`nw_b46`, beat 41) — so on `s1/17-she-runs.jpg` (`nw_b47`) and/or `s1/18-the-flashlight.jpg` (`nw_b48`) | the key in her hand, then Mara running, then her purse open in the rain | **just a puddle of rainwater on the pavement, leaking blood** — no body, nothing else in frame |

Rules that still hold for any of this work: a retake is installed with
`FFMPEG=… node tools/install-film-picture.mjs <source> public/film/img/s1/<name>.jpg`, which archives the picture it
replaces under `public/film/img/archive/s1/<name>--vN.jpg` first; a picture is **never** made smaller than it came; a new
picture gets a new file name rather than overwriting a shot that still plays. A picture with people in it needs cut-outs
before it gets a depth map (`docs/depth-camera.md`).

---

## 2. Scene 70 — Mara must know the driver by his voice, not his words (5 November 2026)

The director:

> **Best next change: fix Mara recognising the driver in Scene 70.**
> Right now she reacts to "Shitsurei shimasu", which is too commonplace to identify a killer. Make her recognise the
> man's distinctive voice, not the words.
>
> Establish his flat, slightly hoarse delivery in Scene 2, then revise Scene 70:
>
> > DRIVER: Shitsurei shimasu.
> >
> > Mara stops dead. The voice from the floor of the bar. The same flat, unhurried delivery.
> >
> > MARA: That's him.
> >
> > JACK: What?
> >
> > MARA: The bar. His voice.
> >
> > The driver lifts his wrist toward his mouth.
> >
> > DRIVER: Position.
>
> Use the same voice performer for both men. This preserves the existing sequence while making Mara's recognition
> immediate, credible, and available to the audience a split second before the shooting starts.

### What that touches

**Scene 2 (`nw_s2`), to establish the voice.** The masked man says `Shitsurei shimasu. (Excuse me.)` on `nw_b58`
(`/film/voice/s2/25-maskedman-shitsurei-shimasu.mp3`) and `Second position done.` on `nw_b65`
(`27-maskedman-second-position-done.mp3`). Both are the voice the audience must remember: flat, unhurried, slightly
hoarse. If the take does not already carry that, it is re-recorded with that direction — one word of direction, which is
the standing rule for short lines — and the old take is archived before the new one goes over it.

**Scene 70 (`nw_s70`), the beats as they stand:**

| Beat | Who | Line / description now | Change |
| --- | --- | --- | --- |
| `nw_b1129` | DRIVER | "Shitsurei shimasu. (Excuse me.)" (`/film/voice/s70/239-driver-excuse-me.mp3`) | keep the words; the take must be **the same performer and the same flat delivery** as scene 2's masked man |
| `nw_b1130` | narrator | "He says it the way you would to a passenger." | keep or fold into the next line |
| `nw_b1131` | narrator | "Mara stops dead." (picture `391-mara-stops-dead.jpg`) | keep |
| `nw_b1132` | narrator | "She has heard those words before. From the floor of a bar, before two shots." | **rewrite**: "The voice from the floor of the bar. The same flat, unhurried delivery." |
| `nw_b1133` | MARA | "That's them." | **rewrite** to "That's him." — re-record |
| `nw_b1134` | JACK | "What?" | keep (the take stands) |
| `nw_b1135` | MARA | "That's what he said. Before he shot him. \"Excuse me.\"" | **rewrite** to "The bar. His voice." — re-record |
| `nw_b1136` | narrator | "The driver lifts his wrist to his mouth and murmurs into his sleeve, very quietly:" | shorten to "The driver lifts his wrist toward his mouth." |
| `nw_b1137` | DRIVER | "Position." | keep |

Both masked men and the driver then share one voice, which `voices.json` must say in as many words so nobody re-casts
them apart later. The subtitle rule for the Japanese line stays: the manifest carries `sub: "Excuse me."`, the viewer
shows it under the words.

Afterwards: the screenplay and the boards carry the new lines, the two Mara takes are recorded (old takes archived
first), and the film is re-imported into both games.

### Why it is worth doing

"Shitsurei shimasu" is what anyone says holding a door. On the page it reads as recognition; on screen it asks the
audience to believe a woman identifies a killer from a courtesy. The voice does the work the words cannot, and the
audience hears it a beat before Mara says anything — which is the only place in the scene where a beat is free.
