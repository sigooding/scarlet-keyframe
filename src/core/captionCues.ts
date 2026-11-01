// Proper closed-caption cues: a beat's text becomes short cues instead of one massive paragraph.
//
// Rules (standard subtitle practice): at most 2 lines of 42 characters per cue; break at sentence ends first, then at
// clause marks (; : dash, comma before a conjunction), then at the word nearest the middle; never split a word; keep
// short sentences together while they still fit; time the cues across the span where the words are spoken (or read),
// in proportion to their length with a pause after each sentence, each held long enough to read.
// Nothing is lost: joining the cues with spaces gives the original text (whitespace collapsed).

export const CUE_MAX_LINE_CHARS = 42;
export const CUE_MAX_LINES = 2;
export const CUE_MAX_CHARS = CUE_MAX_LINE_CHARS * CUE_MAX_LINES - 4; // 80: room for the break
const FRAME_RATE = 24;
const READ_CPS = 17;

export interface TimedCue {
  text: string;
  inFrame: number;
  outFrame: number;
}

const ABBREVIATIONS = /^(?:mr|mrs|ms|dr|st|no|jr|sr|vs|etc|inc|co|mt|a\.m|p\.m)$/i;
// a cue should not end on one of these: the sentence has not arrived anywhere yet
const DANGLING = /^(?:a|an|the|of|to|in|on|at|for|with|by|from|named|called|as|than|his|her|their|its|my|your|our|and|but|or|so|that|who|which|was|were|is|are)$/i;
const CONJUNCTIONS = /^(?:and|but|or|so|then|while|because|as|when|which|who|where|if|that|until|though|although|before|after)$/i;

/** Greedy wrap with the same rule the viewer uses (explicit breaks are not expected inside a cue). */
export function wrapLines(text: string, maxChars = CUE_MAX_LINE_CHARS): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= maxChars) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Two lines of similar length instead of a long first line and a stub (only when the text needs two lines). */
export function balanceLines(text: string, maxChars = CUE_MAX_LINE_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const greedy = wrapLines(clean, maxChars);
  if (greedy.length !== 2) return greedy;
  const words = clean.split(" ");
  let best = greedy;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (a.length > maxChars || b.length > maxChars) continue;
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

const fits = (text: string): boolean => text.length <= CUE_MAX_CHARS + 4 && wrapLines(text).length <= CUE_MAX_LINES;

/** Splits into sentences, keeping closing quotes and brackets with their sentence and not breaking after "Mrs." etc. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let start = 0;
  const re = /([.!?…]+["'”’)\]]*)\s+(?=["“'‘(\[]?[A-Z0-9])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean))) {
    const end = match.index + match[1].length;
    const before = clean.slice(start, match.index + 1);
    const lastWord = (before.match(/([A-Za-z.]+)\.$/)?.[1] ?? "").replace(/\.$/, "");
    const initial = /(?:^|\s)[A-Z]\.$/.test(before); // "J." in "J. K. Smith"
    if (match[1] === "." && (ABBREVIATIONS.test(lastWord) || initial)) continue;
    out.push(clean.slice(start, end).trim());
    start = end + 1;
  }
  const tail = clean.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Splits one over-long sentence at the best clause mark, else at the word nearest the middle, until every part fits. */
function splitLong(text: string): string[] {
  if (fits(text)) return [text];
  const words = text.split(" ");
  const total = text.length;
  let bestIndex = -1;
  let bestScore = Infinity;
  let offset = 0;
  for (let i = 0; i < words.length - 1; i += 1) {
    offset += words[i].length + 1;
    const left = offset - 1;
    const right = total - offset;
    if (left < 12 || right < 12) continue;
    const word = words[i];
    const next = words[i + 1].replace(/[^A-Za-z]/g, "");
    let bonus = 0;
    if (/[;:—–]$/.test(word)) bonus = 30;
    else if (/,$/.test(word) && CONJUNCTIONS.test(next)) bonus = 22;
    else if (/,$/.test(word)) bonus = 14;
    else if (/^[—–]/.test(words[i + 1])) bonus = 12;
    const overflow = Math.max(0, left - CUE_MAX_CHARS) + Math.max(0, right - CUE_MAX_CHARS);
    const dangling = DANGLING.test(word.replace(/[^A-Za-z]/g, "")) && !/[;:,—–.!?]$/.test(word) ? 25 : 0;
    const splitsAName = /^[A-Z][a-z]/.test(word) && /^[A-Z][a-z]/.test(words[i + 1]) && !/[.!?,;:]$/.test(word) ? 25 : 0; // not between "Daniel" and "Voss"
    const score = Math.abs(left - right) - bonus + overflow * 3 + dangling + splitsAName;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) bestIndex = Math.floor(words.length / 2) - 1;
  const a = words.slice(0, bestIndex + 1).join(" ");
  const b = words.slice(bestIndex + 1).join(" ");
  return [...splitLong(a), ...splitLong(b)];
}

/** The cue texts for a beat's text. */
export function splitCaptionText(text: string): string[] {
  const sentences = splitSentences(text).flatMap((s) => splitLong(s));
  const cues: string[] = [];
  for (const sentence of sentences) {
    const last = cues[cues.length - 1];
    // keep short neighbours together: "Rain. Not a storm." is one cue; a long one starts its own
    if (last && last.length + 1 + sentence.length <= CUE_MAX_CHARS - 12 && fits(`${last} ${sentence}`)) {
      cues[cues.length - 1] = `${last} ${sentence}`;
    } else {
      cues.push(sentence);
    }
  }
  return cues;
}

function weightOf(text: string): number {
  const pause = /[.!?…]["'”’)\]]*$/.test(text) ? 6 : /[;:,—–]$/.test(text) ? 2 : 0;
  return Math.max(4, text.length) + pause;
}

/** Spreads cues over `[startFrame, endFrame)`: in proportion to length, each held long enough to read when it can. */
export function timeCues(texts: readonly string[], startFrame: number, endFrame: number): TimedCue[] {
  const n = texts.length;
  if (!n) return [];
  const span = Math.max(n, Math.round(endFrame) - Math.round(startFrame));
  const weights = texts.map(weightOf);
  const sum = weights.reduce((a, b) => a + b, 0);
  const mins = texts.map((t) => Math.min(36, Math.max(14, Math.ceil((t.length / READ_CPS) * FRAME_RATE))));
  let d = weights.map((w, i) => Math.max(mins[i], (span * w) / sum));
  const over = d.reduce((a, b) => a + b, 0) - span;
  if (over > 0.5) {
    const slack = d.map((v, i) => Math.max(0, v - mins[i]));
    const slackSum = slack.reduce((a, b) => a + b, 0);
    if (slackSum >= over) d = d.map((v, i) => v - (slack[i] / slackSum) * over);
    else d = weights.map((w) => (span * w) / sum); // too short to give everything its reading time: plain proportion
  }
  const out: TimedCue[] = [];
  let cursor = Math.round(startFrame);
  let acc = 0;
  texts.forEach((text, i) => {
    acc += d[i];
    const end = i === n - 1 ? Math.round(startFrame) + span : Math.max(cursor + 1, Math.round(Math.round(startFrame) + acc));
    out.push({ text, inFrame: cursor, outFrame: end });
    cursor = end;
  });
  return out;
}

/** Cues for a beat's text over a span. */
export function cuesForText(text: string, startFrame: number, endFrame: number): TimedCue[] {
  return timeCues(splitCaptionText(text), startFrame, endFrame);
}

/** Splits one cue that is too long for the screen into several across its own span. A short cue is returned as is. */
export function splitLongCue(cue: TimedCue): TimedCue[] {
  if (fits(cue.text.replace(/\s+/g, " ").trim()) && cue.text.length <= CUE_MAX_CHARS + 4) return [cue];
  const parts = splitCaptionText(cue.text);
  if (parts.length < 2) return [cue];
  return timeCues(parts, cue.inFrame, cue.outFrame);
}
