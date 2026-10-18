// Idea 3 — paste a chord sheet: key, moods, tension curve and the closest Artist Lens artists.
import { useEffect, useMemo, useState } from 'react';
import { analyzeSong, chordSymbol, keyName, noteName, parseChordSheet, type Key } from '../../core';
import { ChordChips, Meter, ToolActions, ToolIntro } from './common';
import type { ToolProps } from './types';

const EXAMPLES: Array<{ label: string; text: string }> = [
  { label: 'Pop ballad', text: `[Verse]\nC          G\nWhen the night comes falling down\nAm              F\nI keep a light on in the hall\nC          G         F    C\nAnd every road still leads back home\n\n[Chorus]\nF     G     Em    Am\nHold on, hold on, hold on\nF     G     C\nAll the way home` },
  { label: 'Jazz turn', text: '| Dm7 | G7 | Cmaj7 | A7 |\n| Dm7 | G7 | Em7 A7 | Dm7 G7 |\n| Cmaj7 | Fm7 Bb7 | Cmaj7 | % |' },
  { label: 'Dark minor', text: '[Am]Down by the [F]water the [C]lanterns go [E7]out\n[Am]Nobody [Dm]answers, [E7]nobody [Am]shouts\n[F]Bells in the [G]fog and the [E7]tide coming [Am]in' },
];

const W = 320, H = 92, PAD = 10;

export default function SongTool(p: ToolProps) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [keyPick, setKeyPick] = useState<string>('auto');
  useEffect(() => { const id = window.setTimeout(() => setDebounced(text), 250); return () => window.clearTimeout(id); }, [text]);
  const sheet = useMemo(() => parseChordSheet(debounced), [debounced]);
  const auto = useMemo(() => analyzeSong(p.engine, sheet.chords, p.artists, { style: p.tStyle }), [p.engine, sheet, p.artists, p.tStyle]);
  const keyOptions: Key[] = auto ? [auto.key, ...auto.alternatives.map((a) => a.key)] : [];
  const chosen = keyPick === 'auto' ? null : keyOptions.find((kk) => keyName(kk) === keyPick) ?? null;
  const a = useMemo(() => (chosen ? analyzeSong(p.engine, sheet.chords, p.artists, { key: chosen, style: p.tStyle }) : auto), [chosen, auto, p.engine, sheet, p.artists, p.tStyle]);
  const chords = sheet.chords;
  const n = chords.length;
  const label = (id: string) => p.lex.label(id);
  const sx = (i: number) => PAD + (n <= 1 ? 0.5 : i / (n - 1)) * (W - 2 * PAD);
  const sy = (l: number) => H - PAD - Math.min(1, l / 0.65) * (H - 2 * PAD);

  const load = () => {
    if (!a) return;
    p.setKey(noteName(a.key.tonic, false), a.key.mode);
    p.useChords(chords.slice(0, 32), `Loaded ${n > 32 ? 'first 32 chords of the song' : 'the song'} in ${keyName(a.key)}`);
  };

  return (
    <div className="tool song-tool">
      <ToolIntro>Paste a chord sheet — chords over lyrics, inline [Am]ChordPro, or | bar | charts. Lyrics are ignored. Muse reads the key, the moods, where tension builds, and which artist it sits closest to.</ToolIntro>
      <div className="tool-presets">
        {EXAMPLES.map((e) => <button key={e.label} type="button" className="pill" onClick={() => { setText(e.text); setDebounced(e.text); setKeyPick('auto'); }}>{e.label}</button>)}
        {text && <button type="button" className="pill" onClick={() => { setText(''); setDebounced(''); setKeyPick('auto'); }}>Clear</button>}
      </div>
      <textarea
        aria-label="Chord sheet" value={text} spellCheck={false}
        placeholder={'[Verse]\nC          G\nLyrics go here…\nAm        F'}
        onChange={(e) => { setText(e.target.value); setKeyPick('auto'); }}
      />
      {debounced.trim() && !n && <p className="tool-warn">No chords found yet — put chords on their own line above the lyrics, or in [brackets].</p>}
      {sheet.skipped.length > 0 && <p className="tool-note">Skipped: {sheet.skipped.join(', ')}</p>}
      {a && (
        <>
          <div className="tool-card song-head">
            <div className="song-key">
              <span className="muted small">Key</span>
              <select value={keyPick} onChange={(e) => setKeyPick(e.target.value)} aria-label="Key">
                <option value="auto">{keyName(auto!.key)} (detected)</option>
                {auto!.alternatives.map((alt) => <option key={keyName(alt.key)} value={keyName(alt.key)}>{keyName(alt.key)}</option>)}
              </select>
              <span className="muted small">{n} chords · {a.unique} different</span>
            </div>
            <p className="song-summary">{a.summary}</p>
          </div>

          <div className="tool-card">
            <h4>How it feels</h4>
            {a.moods.slice(0, 5).map((m) => (
              <Meter key={m.id} value={Math.min(1, m.weight / (a.moods[0]!.weight || 1))} label={label(m.id)} color={p.lex.color(m.id)} />
            ))}
          </div>

          <div className="tool-card">
            <h4>Tension through the song</h4>
            <svg className="song-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tension curve; peaks at ${a.peaks.map((i) => chordSymbol(chords[i]!, true)).join(', ')}`}>
              <rect x={0} y={0} width={W} height={H} rx={10} className="arc-bg" />
              {sheet.sections.map((s) => (
                <g key={s.start}>
                  <line x1={sx(s.start)} x2={sx(s.start)} y1={PAD} y2={H - PAD} className="arc-grid" />
                  <text x={sx(s.start) + 3} y={PAD + 8} className="arc-axis">{s.name}</text>
                </g>
              ))}
              <polyline className="arc-stroke" points={a.levels.map((l, i) => `${sx(i).toFixed(1)},${sy(l).toFixed(1)}`).join(' ')} />
              {a.peaks.map((i) => <circle key={i} cx={sx(i)} cy={sy(a.levels[i]!)} r={5} className="song-peak" />)}
            </svg>
            <p className="tool-note">Peaks: {a.peaks.map((i) => <b key={i} className="song-peak-name">{chordSymbol(chords[i]!, true)} <span className="muted">(bar {i + 1})</span></b>)}</p>
          </div>

          {a.borrowed.length > 0 && (
            <div className="tool-card">
              <h4>Outside colours</h4>
              <ChordChips chords={a.borrowed.map((b) => chords[b.index]!)} k={a.key} onTap={(c) => p.playChord(c)} />
              <p className="tool-note">Chords that step outside {keyName(a.key)} — usually where the song's colour comes from.</p>
            </div>
          )}

          {a.artists.length > 0 && (
            <div className="tool-card">
              <h4>Closest in Artist Lens</h4>
              {a.artists.map((m, i) => (
                <button key={m.artist.id} type="button" className="song-artist" onClick={() => p.openArtist(m.artist.id)}>
                  <span className="song-artist-name">{m.artist.name}</span>
                  <span className="song-artist-why small muted">
                    {m.shared.length ? `shares ${m.shared.map((s) => label(s).toLowerCase()).join(', ')}` : m.artist.hook}
                  </span>
                  <span className="song-artist-bar" aria-hidden><i style={{ width: `${Math.max(8, Math.min(100, (m.score - 0.35) / 0.55 * 100))}%`, opacity: i ? 0.6 : 1 }} /></span>
                </button>
              ))}
            </div>
          )}

          <ToolActions
            chords={chords}
            onHear={() => p.playChords(chords.slice(0, 16), p.beatSec * 2)}
            onUse={load}
            useLabel="Load into Muse"
          />
          {n > 32 && <p className="tool-note">Long song: Load brings in the first 32 chords.</p>}
        </>
      )}
    </div>
  );
}
