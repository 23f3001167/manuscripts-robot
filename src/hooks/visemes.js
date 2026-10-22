// Phoneme-based viseme model for the graduate robot's mouth.
//
// The GLB has no morph targets and no skeleton, so every viseme is expressed
// as a *shape* (open / wide / round) that the lip-sync hook applies to the
// single `GR_HERO_Smile` mesh. Keeping the model here means the animation and
// the text analysis always stay in sync.

/** Mouth shapes. Values are 0..1. */
export const VISEME_SHAPES = {
  // Resting smile — essentially the mesh's authored shape.
  REST: { open: 0.03, wide: 0.10, round: 0.0 },

  // Vowels
  AA: { open: 1.0, wide: 0.55, round: 0.0 }, // "ah"  — jaw wide open
  EE: { open: 0.55, wide: 1.0, round: 0.0 }, // "ee"  — lips spread
  OO: { open: 0.55, wide: 0.0, round: 1.0 }, // "oo"  — lips rounded/pursed

  // Consonants
  MBP: { open: 0.0, wide: 0.35, round: 0.0 }, // m / b / p — lips closed
  FV: { open: 0.2, wide: 0.55, round: 0.0 }, // f / v      — lip to teeth
  SS: { open: 0.22, wide: 0.85, round: 0.0 }, // s / z / sh — narrow, spread
  LL: { open: 0.45, wide: 0.55, round: 0.0 }, // t / d / n / l
  KK: { open: 0.35, wide: 0.55, round: 0.0 }, // k / g
  RR: { open: 0.4, wide: 0.3, round: 0.35 }, // r — slightly pursed
  NN: { open: 0.3, wide: 0.55, round: 0.0 }, // catch-all consonant
};

const VOWELS = {
  a: 'AA', á: 'AA', à: 'AA', â: 'AA', ä: 'AA', å: 'AA', ã: 'AA', æ: 'AA',
  e: 'EE', é: 'EE', è: 'EE', ê: 'EE', ë: 'EE',
  i: 'EE', í: 'EE', ì: 'EE', î: 'EE', ï: 'EE',
  o: 'OO', ó: 'OO', ò: 'OO', ô: 'OO', ö: 'OO', õ: 'OO', ø: 'OO',
  u: 'OO', ú: 'OO', ù: 'OO', û: 'OO', ü: 'OO',
  y: 'EE', ÿ: 'EE',
};

/** Map a single character to a viseme name. */
export function visemeForChar(ch) {
  const c = (ch || '').toLowerCase();
  if (VOWELS[c]) return VOWELS[c];
  if (c === 'm' || c === 'b' || c === 'p') return 'MBP';
  if (c === 'f' || c === 'v') return 'FV';
  if (c === 's' || c === 'z' || c === 'x' || c === 'j') return 'SS';
  if (c === 'c') return 'SS'; // refined with look-ahead in the builder
  if (c === 't' || c === 'd' || c === 'n' || c === 'l') return 'LL';
  if (c === 'k' || c === 'g') return 'KK';
  if (c === 'r') return 'RR';
  if (c === 'w' || c === 'q') return 'OO';
  if (c === 'h') return 'AA'; // open, breathy
  if (/[0-9]/.test(c)) return 'LL';
  return 'NN';
}

/** How long (relative) a character is held. Vowels stretch, plosives snap. */
function visemeWeight(ch) {
  const c = (ch || '').toLowerCase();
  if (VOWELS[c]) return 1.45;
  if (c === 'm' || c === 'b' || c === 'p') return 0.85;
  if (c === 's' || c === 'z' || c === 'c' || c === 'x') return 0.95;
  if (c === 't' || c === 'd' || c === 'n') return 0.8;
  if (c === 'r' || c === 'w') return 1.0;
  return 0.9;
}

/**
 * Turn text into a time-aligned viseme track that exactly fills `totalMs`.
 * Returns an ordered array of `{ viseme, start, end }` (ms).
 */
export function buildVisemeTimeline(text, totalMs) {
  const chars = Array.from(text || '');
  const seq = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      seq.push({ v: 'REST', w: 0.55 });
      continue;
    }
    if (!/[a-z0-9]/i.test(ch)) {
      seq.push({ v: 'REST', w: 0.3 });
      continue;
    }
    let v = visemeForChar(ch);
    if (ch.toLowerCase() === 'c') {
      const next = (chars[i + 1] || '').toLowerCase();
      v = 'aou'.includes(next) ? 'KK' : 'SS';
    }
    seq.push({ v, w: visemeWeight(ch) });
  }

  // Merge runs of the same viseme so short repeats read as one long shape.
  const merged = [];
  for (const e of seq) {
    const last = merged[merged.length - 1];
    if (last && last.v === e.v) last.w += e.w;
    else merged.push({ v: e.v, w: e.w });
  }

  if (!merged.length) return [{ viseme: 'REST', start: 0, end: Math.max(totalMs, 1) }];

  const totalW = merged.reduce((s, e) => s + e.w, 0) || 1;
  const scale = Math.max(totalMs, 1) / totalW;

  let t = 0;
  return merged.map((e) => {
    const start = t;
    t += e.w * scale;
    return { viseme: e.v, start, end: t };
  });
}

/** Viseme active at time `tMs`. */
export function visemeAt(timeline, tMs) {
  if (!timeline || !timeline.length) return 'REST';
  for (let i = 0; i < timeline.length; i++) {
    if (tMs < timeline[i].end) return timeline[i].viseme;
  }
  return 'REST';
}

/** Rough spoken duration of `text`, used when no audio length is available. */
export function estimateDurationMs(text) {
  const n = (text || '').length;
  return Math.min(Math.max(400 + n * 62, 600), 60000);
}
