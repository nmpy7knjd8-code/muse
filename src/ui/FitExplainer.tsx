// Compact “what works & why” callout for Melody / Chords input — mirrors Guide fit section,
// but stays next to the piano/palettes so novices see it while writing.
import type { ReactNode } from 'react';
import {
  MODE_BY_ID, REL_COLORS, REL_LABEL, chordSymbol, keyName, noteName, pc, scaleNotes, spellInKey,
  type Chord, type Key, type ModeId, type RelKind,
} from '../core';

const REL_ORDER: RelKind[] = ['chord', 'tension', 'avoid', 'clash'];

interface Props {
  mode: 'melody' | 'chords';
  keyInfo: Key;
  /** Chord under the active melody bar (or last chord), when known. */
  underChord?: Chord | null;
}

/** Short how-to-play tips per mode — what to lean on, what colours the sound. */
const MELODY_TIPS: Record<ModeId, { vibe: string; lean: string; colour: string; avoid?: string }> = {
  major: {
    vibe: 'Bright, settled, singable “home” sound.',
    lean: 'Land 1–3–5 on strong beats; step between scale tones for a clear line.',
    colour: 'The major 7th and 4th add lift; approaches from below (leading tone → 1) feel like arriving home.',
  },
  minor: {
    vibe: 'Melancholy natural-minor colour — serious, introspective.',
    lean: 'Chord tones of i (1–♭3–5) feel settled; ♭6 and ♭7 colour the sad side without leaving the scale.',
    colour: 'Step ♭7→1 or ♭6→5 for soft resolutions; leaps of a minor 3rd sound vocal and folk-like.',
  },
  dorian: {
    vibe: 'Minor but hopeful — cool, soulful, a little jazz/folk.',
    lean: 'Use the raised 6th (the Dorian colour) as a target; pair it with 1 and ♭3.',
    colour: '1–2–♭3–…–6 lines sound “Dorian”; avoid flattening the 6th or it collapses to natural minor.',
  },
  phrygian: {
    vibe: 'Dark and tense — Spanish / metal / dramatic edge.',
    lean: 'Feature the ♭2 right next to 1; half-step slides into the tonic are the flavour.',
    colour: 'Ostinatos on 1–♭2–1 or descending ♭2→1 feel idiomatic; keep lines mostly stepwise.',
  },
  lydian: {
    vibe: 'Brightest major colour — floating, film-score wonder.',
    lean: 'Highlight the ♯4 against 1–3–5; don’t resolve ♯4 down to 3 too often or you lose the magic.',
    colour: 'Arpeggios 1–3–♯4–5 or pedals under a ♯4 melody sound Lydian immediately.',
  },
  mixolydian: {
    vibe: 'Major with a bluesy / rock flat 7 — confident, not yearning.',
    lean: 'Chord tones of I and the ♭7; mix steps with pentatonic-ish leaps (1–2–3–5–♭7).',
    colour: 'Land ♭7 on weak beats or as an approach to 1; avoid the major 7th or it turns Ionian.',
  },
  locrian: {
    vibe: 'Most unsettled mode — diminished tonic, rarely a true home.',
    lean: 'Treat 1 as temporary; aim phrases at ♭5 or neighbouring chords rather than sitting on the tonic.',
    colour: 'Short, angular motifs; use Locrian as colour over a stretch, then leave.',
    avoid: 'Long held tonic notes — there’s no perfect 5th to rest on.',
  },
  harmonicMinor: {
    vibe: 'Classical drama — raised leading tone over a minor 6th.',
    lean: 'The augmented 2nd (♭6→7) is the signature leap; 7→1 resolves hard to home.',
    colour: 'Over V (major/7), outline 7–2–4–5 then fall to 1; over i, favour 1–♭3–5 and tasteful ♭6.',
  },
  melodicMinor: {
    vibe: 'Smooth jazz-minor — raised 6 & 7 ascending colour.',
    lean: 'Use raised 6 and 7 for upward lines; they smooth the path to 1 without the harmonic-minor gap.',
    colour: '1–2–♭3–…–6–7–1 runs sound “jazz minor”; arpeggiate m(maj7) colours carefully.',
  },
  phrygianDominant: {
    vibe: 'Flamenco / klezmer / Middle-Eastern heat — ♭2 with a major 3rd.',
    lean: 'Ornaments around 1–♭2–3; the half-step below and major 3rd above tonic are the hooks.',
    colour: 'Trills and turns on ♭2; cadences often fall ♭2→1 or leap 3→1. Keep rhythm driving.',
  },
  lydianDominant: {
    vibe: 'Bright yet bluesy — ♯4 with ♭7 (acoustic / TV-theme colour).',
    lean: 'Combine Lydian lift (♯4) with Mixolydian swagger (♭7); both should appear in the phrase.',
    colour: 'Motifs like 1–2–3–♯4–5–♭7; don’t resolve ♯4 down immediately every time.',
  },
};

function degreeLabels(k: Key): string[] {
  const notes = scaleNotes(k);
  return notes.map((n, i) => {
    const name = noteName(n, true);
    const deg = i + 1;
    return `${name} (${deg})`;
  });
}

function characteristicNames(k: Key): string[] {
  const md = MODE_BY_ID[k.mode];
  const parent = md.family === 'major'
    ? [0, 2, 4, 5, 7, 9, 11]
    : [0, 2, 3, 5, 7, 8, 10];
  const offs = md.intervals.filter((iv) => !parent.includes(iv));
  // Major/minor have no “foreign” degrees vs parent — use documented characteristic string instead.
  if (!offs.length) {
    return md.characteristic.split(/&|,/).map((s) => s.trim()).filter(Boolean);
  }
  return offs.map((iv) => noteName(spellInKey(k, pc(k.tonic) + iv), true));
}

export function FitExplainer({ mode, keyInfo, underChord }: Props): ReactNode {
  const keyLabel = keyName(keyInfo);
  const md = MODE_BY_ID[keyInfo.mode];
  const tip = MELODY_TIPS[keyInfo.mode];
  const scale = degreeLabels(keyInfo);
  const chars = characteristicNames(keyInfo);

  if (mode === 'melody') {
    const chordBit = underChord
      ? <>Over <b>{chordSymbol(underChord, true)}</b>, note tags show how each pitch sits on that harmony:</>
      : <>Once a chord is under the bar, note tags show how each pitch sits on that harmony:</>;
    return (
      <aside className="fit-explainer" aria-label="How to play melodies in this key">
        <p>
          <b>Melody in {keyLabel}.</b> {tip.vibe}
        </p>
        <p className="fit-scale">
          <span className="fit-label">Scale</span>
          {scale.map((s) => (
            <span key={s} className="fit-deg">{s}</span>
          ))}
        </p>
        <p className="fit-chars">
          <span className="fit-label">Lean on</span>
          {chars.map((c) => (
            <span key={c} className="fit-chip">{c}</span>
          ))}
          <span className="muted"> — {md.characteristic}</span>
        </p>
        <p><b>How to play it.</b> {tip.lean}</p>
        <p className="fit-why">{tip.colour}{tip.avoid ? ` ${tip.avoid}` : ''}</p>
        <p>
          Purple keys are in <b>{keyLabel}</b> (safest for a singable line). Outside keys add colour or friction on purpose.
          {' '}{chordBit}
        </p>
        <ul className="fit-rel">
          {REL_ORDER.map((r) => (
            <li key={r}><i style={{ background: REL_COLORS[r] }} />{REL_LABEL[r]}</li>
          ))}
        </ul>
        <p className="fit-why">
          On strong beats, prefer in-chord notes; use colour on weak beats; resolve rubs/clashes by step.
          Ranked suggestions put the best fit first — your ear still picks.
        </p>
      </aside>
    );
  }
  return (
    <aside className="fit-explainer" aria-label="Which chords will work">
      <p>
        <b>What works here.</b> <b>In this key</b> = family chords in <b>{keyLabel}</b> (home / builds / pulls home).
        <b> 7ths</b> = same family, richer colour. <b>Extra colour</b> = borrowed or secondary moves for surprise.
      </p>
      <p className="fit-why">
        Muse ranks next chords by key fit, voice-leading from where you are, mood, and (when harmonizing) how well they sit under your melody.
        Safe ↔ Adventurous nudges common vs rarer picks — orange/red melody tags are allowed if you resolve them.
      </p>
    </aside>
  );
}
