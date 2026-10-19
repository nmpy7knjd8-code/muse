// “Progressions that work” — collapsible explainer above Chord tips. General tips for the current key/mode,
// or the selected style's characteristic progressions realised in this key. Tap ▶ to hear, Load to use.
import type { ReactNode } from 'react';
import { GENERAL_STYLE, keyName, styleProgressions, type Chord, type Key, type MusicStyle } from '../core';
import { PlayIcon } from './icons';

interface Props {
  keyInfo: Key;
  style: MusicStyle | null;
  onPlay: (chords: Chord[]) => void;
  onLoad: (chords: Chord[], name: string) => void;
}

/** Display numerals with real accidentals (bVI → ♭VI, #IV → ♯IV). */
const prettyRoman = (r: string) => r.replace(/^b/, '♭').replace(/^#/, '♯').replace(/b(?=\d)/g, '♭');

export function ProgressionTips({ keyInfo, style, onPlay, onLoad }: Props): ReactNode {
  const s = style ?? GENERAL_STYLE;
  const progs = styleProgressions(s, keyInfo).slice(0, 6);
  const keyLabel = keyName(keyInfo);
  return (
    <details className="fit-explainer prog-tips" aria-label="Chord progressions that work">
      <summary>{style ? `${style.name} progressions` : 'Progressions that work'} · {keyLabel}</summary>
      <div className="fit-explainer-body">
        <p className="fit-why">
          {style
            ? <>{s.blurb} Played in {keyLabel}{progs.some((p) => p.borrowed) ? ' — this style mostly lives in the other mode, so these are borrowed' : ''}.</>
            : <>A progression is a loop of chords that moves away from home (I / i) and back. These shapes work in almost any style — pick a Style above for genre- or artist-specific ones.</>}
        </p>
        <ul className="prog-list">
          {progs.map((p) => (
            <li key={p.roman.join('-')}>
              <div className="prog-head">
                <b className="prog-rn">{p.roman.map(prettyRoman).join(' – ')}</b>
                <span className="prog-name muted">{p.name}</span>
              </div>
              <div className="prog-syms">{p.symbols.join(' · ')}</div>
              <p className="fit-why">{p.why}</p>
              <div className="prog-actions">
                <button type="button" className="pill" onClick={() => onPlay(p.chords)} aria-label={`Hear ${p.name}`}><PlayIcon size={11} /> Hear</button>
                <button type="button" className="pill" onClick={() => onLoad(p.chords, p.name)} aria-label={`Load ${p.name} into the bars`}>Load</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
