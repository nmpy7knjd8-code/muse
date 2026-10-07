// Mood vocabulary helpers: colours, similarity, mood-shift description.
import type { KbMood, TheoryKB } from './kb';

export interface MoodWeight {
  id: string;
  weight: number;
}

/** Fallback palette (tuned for a dark UI) for when the KB has no colour for a mood. */
const FALLBACK: Record<string, string> = {
  resolved: '#4CAF50', bright: '#FFD54F', triumphant: '#FF9800', epic: '#FF7043', hopeful: '#AED581',
  warm: '#FFAB91', romantic: '#F06292', nostalgic: '#BCAAA4', bittersweet: '#CE93D8', melancholy: '#7986CB',
  yearning: '#9575CD', dark: '#78909C', ominous: '#E53935', tense: '#F44336', dramatic: '#EC407A',
  uncanny: '#26A69A', mystical: '#9C7CF4', dreamy: '#81D4FA', wonder: '#4FC3F7', floating: '#B2EBF2',
  surprising: '#FFEB3B', bluesy: '#42A5F5', jazzy: '#A1887F', earthy: '#A1887F', playful: '#C6FF00',
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Lighten very dark colours so they stay legible on a dark background. */
export function legibleOnDark(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let c = rgb;
  let guard = 0;
  while (luminance(c) < 0.38 && guard++ < 10) c = [c[0] + (255 - c[0]) * 0.18, c[1] + (255 - c[1]) * 0.18, c[2] + (255 - c[2]) * 0.18];
  return rgbToHex(c);
}

export class MoodLexicon {
  private byId = new Map<string, KbMood>();
  private synonyms = new Map<string, string>();

  constructor(kb?: TheoryKB) {
    for (const m of kb?.moodVocabulary ?? []) {
      this.byId.set(m.id, m);
      for (const s of m.synonyms ?? []) if (!this.synonyms.has(s.toLowerCase())) this.synonyms.set(s.toLowerCase(), m.id);
    }
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }

  get(id: string): KbMood | undefined {
    return this.byId.get(this.canonical(id));
  }

  canonical(id: string): string {
    const k = id.trim().toLowerCase();
    if (this.byId.has(k)) return k;
    return this.synonyms.get(k) ?? k;
  }

  label(id: string): string {
    const m = this.get(id);
    if (!m) return id.charAt(0).toUpperCase() + id.slice(1);
    // KB labels look like "Sad / Melancholy": show the part that matches the id (else the last part)
    const parts = m.label.split('/').map((x) => x.trim()).filter(Boolean);
    return parts.find((x) => x.toLowerCase() === m.id) ?? parts[parts.length - 1] ?? m.id;
  }

  color(id: string): string {
    const c = this.canonical(id);
    const raw = this.byId.get(c)?.color ?? FALLBACK[c] ?? '#9E9E9E';
    return legibleOnDark(raw);
  }

  /** 0..1 similarity from the valence/arousal plane (1 = same mood). */
  similarity(a: string, b: string): number {
    const ca = this.canonical(a), cb = this.canonical(b);
    if (ca === cb) return 1;
    const ma = this.byId.get(ca), mb = this.byId.get(cb);
    if (!ma || !mb || ma.valence == null || mb.valence == null) return 0;
    const dv = (ma.valence - mb.valence) / 2; // valence spans -1..1
    const da = (ma.arousal ?? 0.5) - (mb.arousal ?? 0.5);
    // when the KB supplies brightness/tension, use them as extra (lighter) axes
    const db = ma.brightness != null && mb.brightness != null ? (ma.brightness - mb.brightness) / 2 : 0;
    const dt = ma.tension != null && mb.tension != null ? ma.tension - mb.tension : 0;
    return Math.max(0, 1 - Math.sqrt(dv * dv + da * da + 0.5 * (db * db + dt * dt)) * 1.6);
  }

  /** Weighted mean valence/arousal of a mood set. */
  centroid(moods: MoodWeight[]): { valence: number; arousal: number; brightness: number; tension?: number } | null {
    let v = 0, a = 0, b = 0, w = 0, t = 0, tw = 0;
    for (const m of moods) {
      const def = this.get(m.id);
      if (!def || def.valence == null) continue;
      v += def.valence * m.weight;
      a += (def.arousal ?? 0.5) * m.weight;
      b += (def.brightness ?? def.valence) * m.weight;
      w += m.weight;
      if (def.tension != null) { t += def.tension * m.weight; tw += m.weight; }
    }
    return w ? { valence: v / w, arousal: a / w, brightness: b / w, tension: tw ? t / tw : undefined } : null;
  }

  /** A short arrow phrase describing how the mood shifts, e.g. "↘ darker, calmer". */
  shift(from: MoodWeight[], to: MoodWeight[]): { arrow: string; text: string } | null {
    const a = this.centroid(from), b = this.centroid(to);
    if (!a || !b) return null;
    const dv = b.valence - a.valence, da = b.arousal - a.arousal;
    const parts: string[] = [];
    if (dv > 0.15) parts.push('brighter');
    else if (dv < -0.15) parts.push('darker');
    if (da > 0.15) parts.push('more intense');
    else if (da < -0.15) parts.push('calmer');
    if (!parts.length) return { arrow: '→', text: 'similar mood' };
    // Arrow reflects brightness first (↗ brighter, ↘ darker), then intensity (↑ / ↓).
    const brightArrow = dv > 0.15 ? '↗' : dv < -0.15 ? '↘' : da > 0.15 ? '↑' : '↓';
    return { arrow: brightArrow, text: parts.join(', ') };
  }
}

/** Merge mood weight lists, summing weights per canonical id, sorted by weight desc. */
export function mergeMoods(lists: MoodWeight[][], lex?: MoodLexicon): MoodWeight[] {
  const acc = new Map<string, number>();
  for (const list of lists) for (const m of list) {
    const id = lex ? lex.canonical(m.id) : m.id;
    acc.set(id, (acc.get(id) ?? 0) + m.weight);
  }
  return [...acc.entries()].map(([id, weight]) => ({ id, weight })).sort((a, b) => b.weight - a.weight);
}
