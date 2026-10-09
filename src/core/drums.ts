// Drum / percussion kit: voices, grid hits, groove theory, and starter patterns.
// Column-aligned hits sound together — the core of drum tablature and four-limb grooves.

/** Standard drum-tab line labels (top → bottom kit order). */
export type DrumVoiceId =
  | 'CC' // crash
  | 'Rd' // ride
  | 'HH' // closed hi-hat (hand)
  | 'HO' // open hi-hat
  | 'SD' // snare
  | 'T1' // high tom
  | 'T2' // mid tom
  | 'FT' // floor tom
  | 'BD' // bass / kick
  | 'Hf'; // hi-hat foot (chick)

export type DrumArtic = 'normal' | 'ghost' | 'accent' | 'open' | 'closed';

/** One strike on a kit voice. Same `beat` across voices = play simultaneously. */
export interface DrumHit {
  voice: DrumVoiceId;
  /** Start in part-pulses (fractional when subdiv > 1). */
  beat: number;
  /** 0..1; ghost ≈ 0.28, accent ≈ 0.95. */
  vel?: number;
  artic?: DrumArtic;
}

export interface DrumVoiceDef {
  id: DrumVoiceId;
  label: string;
  short: string;
  /** Limb / role for theory UI. */
  limb: 'RH' | 'LH' | 'RF' | 'LF' | 'either';
  /** Groove function: time, backbeat, foundation, colour, crash. */
  role: 'time' | 'backbeat' | 'foundation' | 'colour' | 'crash' | 'foot-time';
  /** ASCII tab mark for a normal hit. */
  mark: string;
  theory: string;
}

/** Kit legend — order matches common ASCII drum tab (cymbals → snare/toms → kick). */
export const DRUM_VOICES: DrumVoiceDef[] = [
  { id: 'CC', label: 'Crash', short: 'CC', limb: 'either', role: 'crash', mark: 'x', theory: 'Accent / section marker — usually with a kick or snare for weight.' },
  { id: 'Rd', label: 'Ride', short: 'Rd', limb: 'RH', role: 'time', mark: 'x', theory: 'Jazz/rock timekeeper; bell accents cut through the mix.' },
  { id: 'HH', label: 'Hi-hat', short: 'HH', limb: 'RH', role: 'time', mark: 'x', theory: 'Primary rock/pop ostinato. Steady 8ths or 16ths lock the pocket.' },
  { id: 'HO', label: 'Open hat', short: 'HO', limb: 'RH', role: 'colour', mark: 'o', theory: 'Open hat = breath/release; close it cleanly on the next pulse.' },
  { id: 'SD', label: 'Snare', short: 'SD', limb: 'LH', role: 'backbeat', mark: 'o', theory: 'Backbeat on 2 & 4 in common time; ghosts chatter between accents.' },
  { id: 'T1', label: 'High tom', short: 'T1', limb: 'either', role: 'colour', mark: 'o', theory: 'Fill colour and melodic tom ostinatos (wires often off in heavy grooves).' },
  { id: 'T2', label: 'Mid tom', short: 'T2', limb: 'either', role: 'colour', mark: 'o', theory: 'Bridges high tom and floor in fills and additive grooves.' },
  { id: 'FT', label: 'Floor tom', short: 'FT', limb: 'either', role: 'colour', mark: 'o', theory: 'Low melodic weight; pairs with kick for heavy downbeats.' },
  { id: 'BD', label: 'Kick', short: 'BD', limb: 'RF', role: 'foundation', mark: 'o', theory: 'Foundation pulse. On 1 & 3 = rock; syncopation = funk/fusion push.' },
  { id: 'Hf', label: 'Hat foot', short: 'Hf', limb: 'LF', role: 'foot-time', mark: 'x', theory: 'Jazz “chick” on 2 & 4; also closes open hats and adds four-limb independence.' },
];

export const DRUM_VOICE_IDS = DRUM_VOICES.map((v) => v.id);
export const DRUM_VOICE_BY_ID: Record<DrumVoiceId, DrumVoiceDef> = Object.fromEntries(
  DRUM_VOICES.map((v) => [v.id, v]),
) as Record<DrumVoiceId, DrumVoiceDef>;

/** Default velocity from articulation. */
export function drumVel(h: DrumHit): number {
  if (h.vel != null) return Math.max(0.05, Math.min(1, h.vel));
  switch (h.artic) {
    case 'ghost': return 0.28;
    case 'accent': return 0.95;
    case 'open': return 0.82;
    default: return 0.78;
  }
}

/** Tab character for a hit (ghost = g, accent = O/X, open hat = o). */
export function drumMark(h: DrumHit): string {
  const artic = h.artic ?? 'normal';
  if (artic === 'ghost') return 'g';
  if (h.voice === 'HH' || h.voice === 'Rd' || h.voice === 'CC' || h.voice === 'Hf') {
    return artic === 'accent' ? 'X' : 'x';
  }
  if (artic === 'open' || h.voice === 'HO') return 'o';
  return artic === 'accent' ? 'O' : 'o';
}

export interface DrumPatternMeta {
  id: string;
  name: string;
  /** Short pedagogy blurb shown under the pad. */
  theory: string;
  /** Feel tags for the theory strip. */
  tags: string[];
  /** Pulses per bar this pattern was written for (usually 4). */
  beats: number;
  /** Subdivision used when authoring (4 = 16ths). */
  subdiv: 1 | 2 | 4;
  hits: DrumHit[];
}

function hit(voice: DrumVoiceId, beat: number, artic: DrumArtic = 'normal'): DrumHit {
  return { voice, beat, artic };
}

/**
 * Starter grooves — original teaching cells (not song transcriptions).
 * Methodology mirrors Drumlify/Beam/Drumtabs: load a looping groove, then edit.
 */
export const DRUM_PATTERNS: DrumPatternMeta[] = [
  {
    id: 'backbeat-rock',
    name: 'Backbeat rock',
    theory: 'Home-base pocket: 8th-note hat ostinato, snare on 2 & 4, kick on 1 & 3. Everything else is variation on this wheel.',
    tags: ['pocket', 'backbeat', 'ostinato', '4/4'],
    beats: 4,
    subdiv: 2,
    hits: [
      hit('HH', 0), hit('HH', 0.5), hit('HH', 1), hit('HH', 1.5),
      hit('HH', 2), hit('HH', 2.5), hit('HH', 3), hit('HH', 3.5),
      hit('SD', 1, 'accent'), hit('SD', 3, 'accent'),
      hit('BD', 0, 'accent'), hit('BD', 2),
    ],
  },
  {
    id: 'four-floor',
    name: 'Four on the floor',
    theory: 'Kick every quarter = dance foundation. Hats keep time; snare backbeat still marks 2 & 4 so the body knows where “two” is.',
    tags: ['foundation', 'dance', 'quarter-pulse'],
    beats: 4,
    subdiv: 2,
    hits: [
      hit('HH', 0), hit('HH', 0.5), hit('HH', 1), hit('HH', 1.5),
      hit('HH', 2), hit('HH', 2.5), hit('HH', 3), hit('HH', 3.5),
      hit('SD', 1, 'accent'), hit('SD', 3, 'accent'),
      hit('BD', 0), hit('BD', 1), hit('BD', 2), hit('BD', 3),
    ],
  },
  {
    id: 'half-time',
    name: 'Half-time',
    theory: 'Snare only on beat 3 makes the bar feel twice as long — same tempo, heavier gait. Common in bridges and heavy choruses.',
    tags: ['half-time', 'weight', 'space'],
    beats: 4,
    subdiv: 2,
    hits: [
      hit('HH', 0), hit('HH', 0.5), hit('HH', 1), hit('HH', 1.5),
      hit('HH', 2), hit('HH', 2.5), hit('HH', 3), hit('HH', 3.5),
      hit('SD', 2, 'accent'),
      hit('BD', 0, 'accent'), hit('BD', 1.5), hit('BD', 3),
    ],
  },
  {
    id: 'funk-ghost',
    name: 'Funk ghosts',
    theory: 'Soft snare “chatter” (ghosts) between accented backbeats. Dynamic contrast — not more notes — is what makes funk sit.',
    tags: ['ghost-notes', 'dynamics', '16ths', 'funk'],
    beats: 4,
    subdiv: 4,
    hits: [
      hit('HH', 0), hit('HH', 0.5), hit('HH', 1), hit('HH', 1.5),
      hit('HH', 2), hit('HH', 2.5), hit('HH', 3), hit('HH', 3.5),
      hit('SD', 1, 'accent'), hit('SD', 3, 'accent'),
      hit('SD', 0.75, 'ghost'), hit('SD', 1.25, 'ghost'),
      hit('SD', 2.75, 'ghost'), hit('SD', 3.25, 'ghost'),
      hit('BD', 0), hit('BD', 0.5), hit('BD', 2), hit('BD', 2.75),
    ],
  },
  {
    id: 'linear-16',
    name: 'Linear 16ths',
    theory: 'Linear = one voice at a time (no stacked limbs). Forces clean subdivision and dynamic contrast; great independence drill.',
    tags: ['linear', 'independence', '16ths'],
    beats: 4,
    subdiv: 4,
    hits: [
      hit('HH', 0), hit('SD', 0.25, 'ghost'), hit('HH', 0.5), hit('BD', 0.75),
      hit('SD', 1, 'accent'), hit('HH', 1.25), hit('BD', 1.5), hit('HH', 1.75),
      hit('HH', 2), hit('SD', 2.25, 'ghost'), hit('HH', 2.5), hit('BD', 2.75),
      hit('SD', 3, 'accent'), hit('HH', 3.25), hit('BD', 3.5), hit('HH', 3.75),
    ],
  },
  {
    id: 'hat-ostinato-kick-grid',
    name: 'Hat ostinato + kick grid',
    theory: 'Keep the hat frozen; move the kick through 8th-note partials. Classic coordination: isolate limbs, then combine.',
    tags: ['ostinato', 'coordination', 'kick-grid'],
    beats: 4,
    subdiv: 2,
    hits: [
      hit('HH', 0), hit('HH', 0.5), hit('HH', 1), hit('HH', 1.5),
      hit('HH', 2), hit('HH', 2.5), hit('HH', 3), hit('HH', 3.5),
      hit('SD', 1, 'accent'), hit('SD', 3, 'accent'),
      hit('BD', 0), hit('BD', 0.5), hit('BD', 2.5),
    ],
  },
  {
    id: 'odd-5-cell',
    name: 'Additive 5-pulse cell',
    theory: 'Count 2+3 (or 3+2) inside five pulses. Additive meter is how odd grooves stay memorable — group, don’t just count to five.',
    tags: ['additive', 'odd-meter', '5'],
    beats: 5,
    subdiv: 1,
    hits: [
      hit('HH', 0), hit('HH', 1), hit('HH', 2), hit('HH', 3), hit('HH', 4),
      hit('SD', 2, 'accent'),
      hit('BD', 0, 'accent'), hit('BD', 3),
    ],
  },
  {
    id: 'poly-hat-threes',
    name: 'Hat groups of three',
    theory: 'Hi-hat in 3-note 16th groups over a 4/4 backbeat = 4-over-3 feel. Layers meet again when the cycle closes — hear the convergence.',
    tags: ['polyrhythm', '4-over-3', 'hemiola'],
    beats: 4,
    subdiv: 4,
    hits: [
      // groups of three 16ths across the bar
      hit('HH', 0), hit('HH', 0.75), hit('HH', 1.5), hit('HH', 2.25), hit('HH', 3), hit('HH', 3.75),
      hit('SD', 1, 'accent'), hit('SD', 3, 'accent'),
      hit('BD', 0), hit('BD', 2),
    ],
  },
  {
    id: 'build-fill',
    name: 'Build fill (departure)',
    theory: 'Leave the tonic pocket: toms + crash raise fill energy and density. Stack this bar before a pocket bar to feel build → release.',
    tags: ['build', 'fill', 'departure', 'tension'],
    beats: 4,
    subdiv: 4,
    hits: [
      hit('HH', 0), hit('T1', 0.5), hit('T1', 0.75), hit('T2', 1), hit('T2', 1.25),
      hit('FT', 1.5), hit('FT', 1.75), hit('SD', 2, 'accent'), hit('T1', 2.5), hit('T2', 2.75),
      hit('FT', 3), hit('SD', 3.25, 'ghost'), hit('BD', 3.5), hit('CC', 3.75, 'accent'),
      hit('BD', 0), hit('BD', 2),
    ],
  },
  {
    id: 'release-crash-one',
    name: 'Release crash on 1',
    theory: 'Arrival marker: crash + kick on beat 1, backbeat restored, density down. Spends the debt a fill bar stacked.',
    tags: ['release', 'arrival', 'crash', 'pocket'],
    beats: 4,
    subdiv: 2,
    hits: [
      hit('CC', 0, 'accent'), hit('HH', 0.5), hit('HH', 1), hit('HH', 1.5),
      hit('HH', 2), hit('HH', 2.5), hit('HH', 3), hit('HH', 3.5),
      hit('SD', 1, 'accent'), hit('SD', 3, 'accent'),
      hit('BD', 0, 'accent'), hit('BD', 2),
    ],
  },
];

export function drumPatternById(id: string): DrumPatternMeta | undefined {
  return DRUM_PATTERNS.find((p) => p.id === id);
}

/** Hits sounding exactly on a pulse (for grid UI). */
export function hitsAtBeat(hits: DrumHit[], beat: number, eps = 1e-6): DrumHit[] {
  return hits.filter((h) => Math.abs(h.beat - beat) < eps);
}

/** Toggle a voice on a beat: add normal hit, or remove if present. */
export function toggleDrumHit(
  hits: DrumHit[],
  voice: DrumVoiceId,
  beat: number,
  artic: DrumArtic = 'normal',
): DrumHit[] {
  const i = hits.findIndex((h) => h.voice === voice && Math.abs(h.beat - beat) < 1e-6);
  if (i >= 0) return hits.filter((_, j) => j !== i);
  return [...hits, { voice, beat, artic }].sort((a, b) => a.beat - b.beat || a.voice.localeCompare(b.voice));
}

/** Cycle articulation for an existing hit (normal → ghost → accent → remove). */
export function cycleDrumArtic(hits: DrumHit[], voice: DrumVoiceId, beat: number): DrumHit[] {
  const i = hits.findIndex((h) => h.voice === voice && Math.abs(h.beat - beat) < 1e-6);
  if (i < 0) {
    const add: DrumHit = { voice, beat, artic: 'normal' };
    return [...hits, add].sort((a, b) => a.beat - b.beat);
  }
  const cur = hits[i]!.artic ?? 'normal';
  const next: DrumArtic | 'off' =
    cur === 'normal' ? 'ghost' : cur === 'ghost' ? 'accent' : 'off';
  if (next === 'off') return hits.filter((_, j) => j !== i);
  return hits.map((h, j) => (j === i ? { ...h, artic: next } : h));
}

/** Clone hits into a fresh array (immutable edits). */
export function cloneHits(hits: DrumHit[]): DrumHit[] {
  return hits.map((h) => ({ ...h }));
}

/**
 * Render ASCII drum tab for one bar — same column = simultaneous.
 * Empty subdivisions use `-`.
 */
export function drumTabAscii(
  hits: DrumHit[],
  beats: number,
  subdiv: 1 | 2 | 4 = 4,
  voices: DrumVoiceId[] = ['CC', 'Rd', 'HH', 'HO', 'SD', 'T1', 'T2', 'FT', 'BD', 'Hf'],
): string {
  const steps = Math.max(1, Math.round(beats * subdiv));
  const step = 1 / subdiv;
  const used = voices.filter((v) => hits.some((h) => h.voice === v));
  const lines = (used.length ? used : (['HH', 'SD', 'BD'] as DrumVoiceId[])).map((v) => {
    const cells: string[] = [];
    for (let i = 0; i < steps; i++) {
      const beat = i * step;
      const h = hits.find((x) => x.voice === v && Math.abs(x.beat - beat) < 1e-6);
      cells.push(h ? drumMark(h) : '-');
    }
    // Group in beats for readability
    const grouped: string[] = [];
    for (let b = 0; b < beats; b++) {
      grouped.push(cells.slice(b * subdiv, (b + 1) * subdiv).join(''));
    }
    return `${v.padEnd(2)}|${grouped.join('|')}|`;
  });
  const count: string[] = [];
  for (let b = 0; b < beats; b++) {
    const parts: string[] = [];
    for (let s = 0; s < subdiv; s++) {
      if (s === 0) parts.push(String((b % 9) + 1));
      else if (subdiv === 2) parts.push('+');
      else if (subdiv === 4) parts.push(s === 1 ? 'e' : s === 2 ? '+' : 'a');
      else parts.push('-');
    }
    count.push(parts.join(''));
  }
  return [...lines, `  |${count.join('|')}|`].join('\n');
}

/** Strong-beat preference for kick / snare role hints. */
export function drumRoleHint(voice: DrumVoiceId, beat: number, beatsPerBar: number): string {
  const def = DRUM_VOICE_BY_ID[voice];
  const strong = beat === 0 || (beatsPerBar % 2 === 0 && Math.abs(beat - beatsPerBar / 2) < 1e-6);
  const backbeat =
    beatsPerBar === 4 && (Math.abs(beat - 1) < 1e-6 || Math.abs(beat - 3) < 1e-6);
  if (voice === 'SD' && backbeat) return 'Classic backbeat — accent here for rock/pop pocket.';
  if (voice === 'BD' && beat === 0) return 'Downbeat foundation — kick on 1 anchors the bar.';
  if (voice === 'HH' || voice === 'Rd') return def.theory;
  if (strong && (voice === 'BD' || voice === 'SD')) return `${def.label} on a strong beat adds weight.`;
  return def.theory;
}

/** Theory strip copy for the Drums tab. */
export const DRUM_THEORY_PILLARS: Array<{ name: string; detail: string }> = [
  {
    name: 'Simultaneous columns',
    detail: 'Anything stacked in the same subdivision plays together. A groove is coordinated limbs, not a single melody line.',
  },
  {
    name: 'Ostinato first',
    detail: 'Lock the timekeeper (hat/ride), then add snare, then kick. Isolate limbs when coordination breaks.',
  },
  {
    name: 'Backbeat vs foundation',
    detail: 'Snare on 2 & 4 (backbeat) + kick on strong beats (foundation) is the rock/pop pocket. Move either for style.',
  },
  {
    name: 'Ghost notes',
    detail: 'Very soft snare between accents. They add propulsion without stealing the backbeat — dynamics are the point.',
  },
  {
    name: 'Linear vs layered',
    detail: 'Linear = one limb at a time. Layered = stacks (kick+hat). Both need clear subdivision; linear demands stricter timing.',
  },
  {
    name: 'Loop the cell',
    detail: 'If a one-bar groove does not feel good looping, it is not ready to expand. Muse Loop is the practice room.',
  },
  {
    name: 'Build & release',
    detail: 'The pocket is a rhythmic tonic. Fills, syncopation, and density leave home (build); crash-on-1, half-time, or a clean backbeat return (release).',
  },
];
