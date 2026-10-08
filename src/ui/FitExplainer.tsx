// Compact “what works & why” callout for Melody / Chords input — mirrors Guide fit section,
// but stays next to the piano/palettes so novices see it while writing.
import type { ReactNode } from 'react';
import { REL_COLORS, REL_LABEL, type RelKind, chordSymbol, keyName, type Chord, type Key } from '../core';

const REL_ORDER: RelKind[] = ['chord', 'tension', 'avoid', 'clash'];

interface Props {
  mode: 'melody' | 'chords';
  keyInfo: Key;
  /** Chord under the active melody bar (or last chord), when known. */
  underChord?: Chord | null;
}

export function FitExplainer({ mode, keyInfo, underChord }: Props): ReactNode {
  const keyLabel = keyName(keyInfo);
  if (mode === 'melody') {
    const chordBit = underChord
      ? <>Over <b>{chordSymbol(underChord, true)}</b>, tags tell you how each note sits:</>
      : <>Once a chord is under the bar, tags tell you how each note sits:</>;
    return (
      <aside className="fit-explainer" aria-label="Which notes will work">
        <p>
          <b>What works here.</b> Purple keys are in <b>{keyLabel}</b> — safest for a singable line.
          Outside keys add colour or friction on purpose. {chordBit}
        </p>
        <ul className="fit-rel">
          {REL_ORDER.map((r) => (
            <li key={r}><i style={{ background: REL_COLORS[r] }} />{REL_LABEL[r]}</li>
          ))}
        </ul>
        <p className="fit-why">
          In-chord on strong beats feels settled; colour notes add interest; rubs/clashes want to resolve.
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
