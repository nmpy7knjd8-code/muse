// Rhythmic / percussion tension build & release — sibling to harmonyTension.ts.
// Does NOT rewrite the chord tension model. Uses the same leaky-debt integrator
// (stepDebt) so drums can “stack debt” and “spend release” across bars.
//
// Theory anchors (pedagogy, HEURISTIC scoring):
//   - Tonic beat pattern (Fink 2011; Smith 2021): home groove = backbeat / four-on-floor pocket.
//   - Departure = fill energy, syncopation, density, accent sprawl → build.
//   - Return / thin / half-time drop / crash-on-1 → release.
//   - Medium syncopation interests; extreme syncopation without a clear pulse feels chaotic (groove literature).

import {
  DrumHit, DRUM_VOICE_BY_ID, drumVel, hitsAtBeat,
} from './drums';
import { PartMeter, beatsPerBar, pulseStep, strongBeats, slotsPerPartBar } from './meter';
import { stepDebt, type BudgetStatus } from './tension';
export type { BudgetStatus };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Per-bar rhythmic feature breakdown (0..1 parts). */
export interface DrumTensionParts {
  /** Hit occupancy vs grid capacity (voices × steps). */
  density: number;
  /** Kick/snare off strong beats / backbeat expectations. */
  syncopation: number;
  /** Accent share and crash/open-hat weight. */
  accentWeight: number;
  /** Toms + crash chatter vs timekeeper-only (fill / departure). */
  fill: number;
  /** How many limbs fire on the same columns (layering). */
  layering: number;
  /** Stability of classic backbeat (snare 2&4 in 4/4) — high = “home”. */
  backbeatHome: number;
}

export interface DrumTensionPoint {
  index: number;
  /** Combined rhythmic intensity / expectancy (0..1). */
  level: number;
  debt: number;
  rolling: number;
  run: number;
  /** How much this bar releases vs the previous (0..1). */
  release: number;
  parts: DrumTensionParts;
  /** Coach chips for the Drums tab. */
  reasons: string[];
  status: BudgetStatus;
}

export interface DrumTensionState {
  points: DrumTensionPoint[];
  debt: number;
  status: BudgetStatus;
  message: string;
  /** Bar index of the most “home” groove so far (tonic beat pattern proxy). */
  homeIndex: number;
}

/** Drum-calibrated rest / leak for the shared debt integrator. HEURISTIC. */
const DRUM_DEBT = { rest: 0.32, leak: 0.72 };
const DRUM_BAND = { low: 0.22, high: 0.55 };
const DRUM_CEILING = 1.35;
const DRUM_MAX_RUN = 4;

function isStrongPulse(beat: number, strong: number[], eps = 0.12): boolean {
  return strong.some((s) => Math.abs(s - beat) < eps);
}

function isBackbeat(beat: number, beats: number): boolean {
  if (beats !== 4) return false;
  return Math.abs(beat - 1) < 0.12 || Math.abs(beat - 3) < 0.12;
}

/** Feature analysis for one bar of drum hits. */
export function analyzeDrumBar(hits: DrumHit[], meter: PartMeter): DrumTensionParts & { level: number } {
  const beats = beatsPerBar(meter.timeSig);
  const step = pulseStep(meter.subdiv);
  const capacity = Math.max(1, slotsPerPartBar(meter));
  const strong = strongBeats(meter.timeSig);
  if (!hits.length) {
    return {
      density: 0, syncopation: 0, accentWeight: 0, fill: 0, layering: 0, backbeatHome: 0, level: 0,
    };
  }

  // Density: occupancy of voice-steps (cap at 1).
  const density = clamp01(hits.length / (capacity * 0.55));

  // Syncopation: kick/snare not on expected strong / backbeat seats.
  let syncNum = 0, syncDen = 0;
  for (const h of hits) {
    if (h.voice !== 'BD' && h.voice !== 'SD') continue;
    syncDen++;
    const onStrong = isStrongPulse(h.beat, strong);
    const onBack = h.voice === 'SD' && isBackbeat(h.beat, beats);
    const expected = h.voice === 'SD' ? onBack || onStrong : onStrong || h.beat < 0.12;
    if (!expected) syncNum++;
  }
  const syncopation = syncDen ? clamp01(syncNum / syncDen) : 0;

  // Accent weight: accents + crashes + open hats vs ghosts.
  let accent = 0, mass = 0;
  for (const h of hits) {
    const v = drumVel(h);
    mass += v;
    if (h.artic === 'accent' || h.voice === 'CC' || h.voice === 'HO') accent += v * 1.2;
    else if (h.artic === 'ghost') accent += v * 0.15;
    else accent += v * 0.45;
  }
  const accentWeight = clamp01(accent / Math.max(mass, 0.01) * (mass / Math.max(hits.length, 1)));

  // Fill: colour voices (toms, crash) relative to timekeepers.
  const fillHits = hits.filter((h) => {
    const role = DRUM_VOICE_BY_ID[h.voice].role;
    return role === 'colour' || role === 'crash';
  }).length;
  const fill = clamp01(fillHits / Math.max(3, hits.length * 0.45));

  // Layering: mean voices per occupied column.
  const cols = new Map<number, number>();
  for (const h of hits) {
    const key = Math.round(h.beat / step);
    cols.set(key, (cols.get(key) ?? 0) + 1);
  }
  let layerSum = 0;
  cols.forEach((n) => { layerSum += n; });
  const layering = clamp01((layerSum / Math.max(cols.size, 1) - 1) / 2);

  // Backbeat home (4/4): snare accents near 2 & 4, some kick on 1, hat/ride present.
  let backbeatHome = 0;
  if (beats === 4) {
    const snare2 = hitsAtBeat(hits, 1).some((h) => h.voice === 'SD' && h.artic !== 'ghost');
    const snare4 = hitsAtBeat(hits, 3).some((h) => h.voice === 'SD' && h.artic !== 'ghost');
    const kick1 = hitsAtBeat(hits, 0).some((h) => h.voice === 'BD');
    const time = hits.some((h) => h.voice === 'HH' || h.voice === 'Rd');
    backbeatHome = clamp01(
      (snare2 ? 0.35 : 0) + (snare4 ? 0.35 : 0) + (kick1 ? 0.2 : 0) + (time ? 0.15 : 0)
      - (fill > 0.45 ? 0.25 : 0) - (syncopation > 0.55 ? 0.2 : 0),
    );
  } else {
    // Odd meters: “home” = hat on most pulses + kick on beat 0.
    const timeShare = hits.filter((h) => h.voice === 'HH' || h.voice === 'Rd').length / Math.max(hits.length, 1);
    const kick1 = hits.some((h) => h.voice === 'BD' && h.beat < 0.12);
    backbeatHome = clamp01(timeShare * 0.7 + (kick1 ? 0.3 : 0) - fill * 0.3);
  }

  // Level: departure from home + energy. High backbeatHome lowers level (rest).
  const level = clamp01(
    0.28 * density
    + 0.22 * syncopation
    + 0.18 * accentWeight
    + 0.22 * fill
    + 0.12 * layering
    - 0.28 * backbeatHome
    + 0.18,
  );

  return { density, syncopation, accentWeight, fill, layering, backbeatHome, level };
}

/**
 * Release of bar `cur` relative to `prev` (0..1).
 * High when returning toward a pocket, thinning density, half-time drop, or crash landing on 1.
 */
export function drumRelease(
  prev: ReturnType<typeof analyzeDrumBar> | null,
  cur: ReturnType<typeof analyzeDrumBar>,
  curHits: DrumHit[],
): number {
  if (!prev) return 0;
  let r = 0;
  // Return toward tonic pocket
  if (cur.backbeatHome > prev.backbeatHome + 0.12) r += 0.35 * (cur.backbeatHome - prev.backbeatHome);
  // Density / fill drop (arrival / space)
  if (prev.density - cur.density > 0.12) r += 0.28 * (prev.density - cur.density);
  if (prev.fill - cur.fill > 0.15) r += 0.3 * (prev.fill - cur.fill);
  // Syncopation resolving into the grid
  if (prev.syncopation - cur.syncopation > 0.15) r += 0.22 * (prev.syncopation - cur.syncopation);
  // Crash (or open-hat close narrative) on downbeat as sectional marker
  const crashOne = curHits.some((h) => (h.voice === 'CC' || h.voice === 'HO') && h.beat < 0.12);
  if (crashOne && prev.fill > 0.25) r += 0.25;
  // Half-time feel: snare mainly on 3, fewer hats — weight drop as release of drive
  const snares = curHits.filter((h) => h.voice === 'SD' && h.artic !== 'ghost');
  if (snares.length === 1 && Math.abs(snares[0]!.beat - 2) < 0.12 && prev.backbeatHome > 0.45) r += 0.2;
  return clamp01(r);
}

function statusFor(point: { debt: number; rolling: number; run: number; level: number }): BudgetStatus {
  if (point.debt > DRUM_CEILING) return 'over-budget';
  if (point.debt > 0.75 * DRUM_CEILING || point.run >= DRUM_MAX_RUN) return 'resolve-soon';
  if (point.rolling < DRUM_BAND.low && point.level < DRUM_BAND.low) return 'too-static';
  if (point.rolling >= DRUM_BAND.low && point.rolling <= DRUM_BAND.high) return 'sweet-spot';
  return 'building';
}

const STATUS_MSG: Record<BudgetStatus, string> = {
  'over-budget': 'Drum debt is high — return to the pocket, thin the grid, or crash on 1 to release.',
  'resolve-soon': 'Groove tension is stacking — one more push, then land the tonic beat pattern.',
  'too-static': 'Very settled pocket — displace a kick, add ghosts, or a one-bar fill to build.',
  'sweet-spot': 'Rhythmic tension and rest are balanced — good cell to loop.',
  building: 'Building away from the home groove — keep going or aim back at the backbeat.',
};

function reasonsFor(
  parts: DrumTensionParts,
  release: number,
  status: BudgetStatus,
): string[] {
  const out: string[] = [];
  if (parts.backbeatHome >= 0.55) out.push('tonic pocket (backbeat home)');
  if (parts.fill >= 0.4) out.push('fill / colour departure');
  if (parts.syncopation >= 0.45) out.push('syncopation builds expectancy');
  if (parts.density >= 0.55) out.push('dense grid (energy up)');
  if (parts.accentWeight >= 0.55) out.push('accent / crash weight');
  if (release >= 0.35) out.push('release toward home / space');
  if (status === 'too-static') out.push('needs a build lever');
  if (status === 'resolve-soon' || status === 'over-budget') out.push('wants a release landing');
  return out.slice(0, 4);
}

/** Curve of rhythmic tension across timeline bars that have (or may have) drums. */
export function progressionDrumTension(
  bars: DrumHit[][],
  meter: PartMeter,
): DrumTensionState {
  const points: DrumTensionPoint[] = [];
  let debt = 0;
  let run = 0;
  const hist: number[] = [];
  let homeIndex = 0;
  let bestHome = -1;
  let prevAnal: ReturnType<typeof analyzeDrumBar> | null = null;

  bars.forEach((hits, i) => {
    const anal = analyzeDrumBar(hits, meter);
    const release = drumRelease(prevAnal, anal, hits);
    debt = stepDebt(debt, anal.level, release, DRUM_DEBT);
    run = anal.level >= DRUM_DEBT.rest ? run + 1 : 0;
    hist.push(anal.level);
    const rolling = hist.slice(-4).reduce((a, b) => a + b, 0) / Math.min(hist.length, 4);
    const proto = { debt, rolling, run, level: anal.level };
    const status = statusFor(proto);
    const reasons = reasonsFor(anal, release, status);
    points.push({
      index: i,
      level: anal.level,
      debt,
      rolling,
      run,
      release,
      parts: {
        density: anal.density,
        syncopation: anal.syncopation,
        accentWeight: anal.accentWeight,
        fill: anal.fill,
        layering: anal.layering,
        backbeatHome: anal.backbeatHome,
      },
      reasons,
      status,
    });
    if (anal.backbeatHome > bestHome) {
      bestHome = anal.backbeatHome;
      homeIndex = i;
    }
    prevAnal = anal;
  });

  const last = points[points.length - 1];
  const status = last?.status ?? 'building';
  return {
    points,
    debt: last?.debt ?? 0,
    status,
    message: last ? STATUS_MSG[status] : 'Add a groove cell to track rhythmic build & release.',
    homeIndex,
  };
}

/** One-bar coach when editing the active drum grid (no multi-bar debt yet). */
export function coachDrumBar(hits: DrumHit[], meter: PartMeter, prevHits?: DrumHit[]): {
  level: number;
  release: number;
  parts: DrumTensionParts;
  status: BudgetStatus;
  message: string;
  reasons: string[];
  levers: Array<{ name: string; detail: string }>;
} {
  const cur = analyzeDrumBar(hits, meter);
  const prev = prevHits ? analyzeDrumBar(prevHits, meter) : null;
  const release = drumRelease(prev, cur, hits);
  const status = statusFor({ debt: Math.max(0, cur.level - DRUM_DEBT.rest), rolling: cur.level, run: cur.level >= DRUM_DEBT.rest ? 1 : 0, level: cur.level });
  const levers: Array<{ name: string; detail: string }> = [
    { name: 'Build — densify', detail: 'Add 16th hats or ghost snares between backbeats to raise expectancy without leaving the pocket.' },
    { name: 'Build — displace', detail: 'Move a kick off 1/3 or snare off 2/4 (syncopation). Keep the hat steady so the pulse stays clear.' },
    { name: 'Build — fill', detail: 'One bar of toms/crash departs the tonic beat pattern — classic pre-chorus push.' },
    { name: 'Release — home', detail: 'Return snare to 2 & 4 with kick on 1; thin extras. Landing the pocket spends drum debt.' },
    { name: 'Release — space', detail: 'Half-time (snare on 3) or drop to hats + kick only. Less density reads as arrival.' },
    { name: 'Release — marker', detail: 'Crash on beat 1 after a busy bar marks the sectional downbeat (initiation → arrival).' },
  ];
  return {
    level: cur.level,
    release,
    parts: {
      density: cur.density,
      syncopation: cur.syncopation,
      accentWeight: cur.accentWeight,
      fill: cur.fill,
      layering: cur.layering,
      backbeatHome: cur.backbeatHome,
    },
    status,
    message: STATUS_MSG[status],
    reasons: reasonsFor(
      {
        density: cur.density,
        syncopation: cur.syncopation,
        accentWeight: cur.accentWeight,
        fill: cur.fill,
        layering: cur.layering,
        backbeatHome: cur.backbeatHome,
      },
      release,
      status,
    ),
    levers,
  };
}

/** Human labels for budget chips (drums). */
export const DRUM_BUDGET_LABEL: Record<BudgetStatus, string> = {
  'too-static': 'Settled pocket',
  building: 'Building',
  'sweet-spot': 'In the pocket',
  'resolve-soon': 'Release soon',
  'over-budget': 'Needs release',
};

export const DRUM_TENSION_THEORY: Array<{ name: string; detail: string }> = [
  {
    name: 'Tonic beat pattern',
    detail: 'The groove that feels like home (often backbeat rock or four-on-the-floor). Leaving it builds tension; returning releases — same story as harmonic tonic, on the kit.',
  },
  {
    name: 'Build levers',
    detail: 'Density, syncopation, fills, and accents raise expectancy. Medium syncopation grooves; extreme syncopation without a clear pulse feels chaotic.',
  },
  {
    name: 'Release landings',
    detail: 'Crash on 1, half-time drop, thinned hats, or a clean 2-and-4 backbeat spends the debt the busy bars stacked.',
  },
  {
    name: 'Loop to feel debt',
    detail: 'A cell that never leaves home stays static; a cell that never returns feels over-budget. Alternate build bars and pocket bars across the timeline.',
  },
];
