#!/usr/bin/env node
// Compile the editable Fountain screenplay into a straight-through Frame/24 storyboard.
// `[[CC: ...]]` is an authored sound cue; `[[HOLD: seconds]]` sets a deliberate visual hold.
// No pictures or audio are implied by these notes: the resulting film is a production draft.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/data/miami-vice.fountain");
const output = resolve(root, "src/data/miami-vice-film.json");
const FPS = 24;

function prettyName(speaker) {
  return speaker
    .split(/(\s*\([^)]*\)\s*)/)
    .map((part) => {
      if (!part) return "";
      if (part.trim().startsWith("(")) return part.trim().toUpperCase();
      return part
        .split(/(\s+)/)
        .map((word) => (/\s/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
        .join("");
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Wrap by words in the same 42-character lines as the editor. Prefix each dialogue
// cue itself, rather than relying on a viewer-only speaker label, so SRT/VTT exports
// remain accessible even for off-screen voices and cassette playback.
function wrapWords(text, firstPrefix = "") {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result = [];
  let lines = [firstPrefix];
  for (const word of words) {
    const current = lines[lines.length - 1];
    const joined = current && !current.endsWith(" ") ? `${current} ${word}` : `${current}${word}`;
    if (joined.length <= 42 || !current) {
      lines[lines.length - 1] = joined;
    } else if (lines.length < 2) {
      lines.push(word);
    } else {
      result.push(lines.join("\n").trim());
      lines = [firstPrefix ? `${firstPrefix}${word}` : word];
    }
  }
  if (lines.some((line) => line.trim())) result.push(lines.join("\n").trim());
  return result;
}

function makeCaptions(text, speaker = "", isSound = false) {
  const prefix = speaker ? `${speaker}: ` : "";
  const chunks = wrapWords(text, prefix);
  let cursor = 4;
  const captions = chunks.map((chunk) => {
    const visibleChars = chunk.replace(/\s+/g, " ").length;
    // Rough edit timing, not claimed to be synchronized to a recording.
    const length = Math.ceil(Math.max(2, visibleChars / 14) * FPS);
    const cue = { text: chunk, inFrame: cursor, outFrame: cursor + length, speaker: "", isNarration: false };
    cursor += length + 3;
    return cue;
  });
  return { captions, durationFrames: cursor + (isSound ? 8 : 12) };
}

export function compileScreenplay(text) {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const characters = new Map();
  const scenes = [];
  let scene;
  let lastVisual = "";

  for (const block of blocks) {
    if (/^(?:Title|Credit|Draft):/i.test(block) || block === "FADE IN:") continue;
    if (/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s/i.test(block)) {
      const index = scenes.length + 1;
      const id = `mv_s${String(index).padStart(2, "0")}`;
      scene = {
        id,
        title: block,
        animaticMark: String(index).padStart(2, "0"),
        nodeType: "cutscene",
        prose: block,
        dialogueBeats: [],
        choices: [],
      };
      scenes.push(scene);
      lastVisual = "";
      continue;
    }
    if (!scene) throw new Error(`Content outside a scene: ${block.slice(0, 80)}`);
    const id = `${scene.id}_b${String(scene.dialogueBeats.length + 1).padStart(3, "0")}`;
    if (block.startsWith("@")) {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const speaker = lines.shift().slice(1).trim();
      const parentheticals = [];
      while (lines[0]?.startsWith("(") && lines[0]?.endsWith(")")) parentheticals.push(lines.shift());
      const dialogue = lines.join(" ").replace(/\s+/g, " ").trim();
      if (!dialogue) throw new Error(`Empty dialogue in ${id}`);
      const charId = `mv_${slug(speaker)}`;
      if (!characters.has(charId)) characters.set(charId, { id: charId, name: prettyName(speaker), role: "Miami Vice", avatarUrl: "" });
      const { captions, durationFrames } = makeCaptions(dialogue, speaker);
      scene.dialogueBeats.push({
        id,
        characterId: charId,
        text: dialogue,
        shotDescription: `${speaker}${parentheticals.length ? ` ${parentheticals.join(" ")}` : ""}. ${lastVisual}`.trim(),
        backgroundHold: false,
        durationFrames,
        captions,
      });
      continue;
    }

    const sounds = [...block.matchAll(/\[\[CC:\s*([^\]]+)\]\]/gi)].map((match) => match[1].trim());
    const holdMatch = block.match(/\[\[HOLD:\s*(\d+(?:\.\d+)?)\s*\]\]/i);
    const holdSeconds = holdMatch ? Number(holdMatch[1]) : 0;
    if (holdMatch && (holdSeconds <= 0 || holdSeconds > 120)) throw new Error(`Invalid hold in ${id}`);
    const action = block.replace(/\s*\[\[(?:CC|HOLD):\s*[^\]]+\]\]/gi, "").replace(/\s*\n\s*/g, " ").trim();
    if (!action) throw new Error(`A sound cue has no visual action in ${id}`);
    lastVisual = action;
    const sound = sounds.length ? makeCaptions(`[${sounds.join(" ")}]`, "", true) : { captions: [], durationFrames: 0 };
    const visualFrames = Math.ceil((holdSeconds || Math.max(2.5, Math.min(9, 1.5 + action.length / 28))) * FPS);
    const beat = {
      id,
      characterId: "mv_stage",
      text: "",
      shotDescription: action,
      backgroundHold: false,
      durationFrames: Math.max(visualFrames, sound.durationFrames),
      captions: sound.captions,
    };
    if (/TITLE:\s*SWEET JESUS/i.test(action)) beat.titleCard = { title: "SWEET JESUS", align: "center" };
    if (/^SMASH TO BLACK\.?$/i.test(action)) beat.gap = true;
    scene.dialogueBeats.push(beat);
  }

  if (!scenes.length || scenes.some((item) => !item.dialogueBeats.length)) throw new Error("Every scene must have at least one beat.");
  scenes.forEach((item, index) => {
    if (scenes[index + 1]) item.autoAdvanceTargetSceneId = scenes[index + 1].id;
  });
  return {
    id: "miami-vice-film",
    title: "Miami Vice - Salt Water",
    tagline: "The city does not keep the receipts.",
    gameKind: "storyboard",
    startSceneId: scenes[0].id,
    characters: [{ id: "mv_stage", name: "Action", role: "Visual and sound directions", avatarUrl: "" }, ...characters.values()],
    captionStyle: { position: "bottom", size: "M", backgroundBox: true, showSpeaker: true, italicNarration: false },
    cutOptions: { aspectFraming: "16:9" },
    productionStatus: "Storyboard draft: blank pictures and planned audio/captions",
    independentStoryboardPictures: true,
    scenes,
  };
}

// Also export the compiler for tests without touching the checked-in output on import.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const compiled = `${JSON.stringify(compileScreenplay(readFileSync(source, "utf8")), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(output, "utf8") !== compiled) {
      console.error("Miami Vice storyboard is stale. Run npm run build:miami-vice.");
      process.exitCode = 1;
    } else {
      console.log("Miami Vice storyboard matches the screenplay.");
    }
  } else {
    writeFileSync(output, compiled);
    const film = JSON.parse(compiled);
    const beats = film.scenes.flatMap((item) => item.dialogueBeats);
    console.log(`Built ${film.scenes.length} scenes, ${beats.length} storyboard beats, ${beats.reduce((n, b) => n + b.captions.length, 0)} caption cues.`);
  }
}
