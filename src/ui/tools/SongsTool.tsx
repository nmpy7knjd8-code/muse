// Songs like yours (idea 21): famous songs that use your progression (any key), shown in your key.
import { useMemo } from 'react';
import { SONG_CATALOG, keyName, parseNote, pc, songChordText, songMatches } from '../../core';
import { PlayIcon } from '../icons';
import { ToolIntro } from './common';
import type { ToolProps } from './types';

export default function SongsTool(p: ToolProps) {
  const matches = useMemo(() => songMatches(p.chords, p.k, p.tuning), [p.chords, p.k, p.tuning]);
  const same = matches.filter((m) => m.kind === 'same');
  const shares = matches.filter((m) => m.kind === 'shares').slice(0, 8);
  const card = (m: (typeof matches)[number]) => (
    <div key={m.song.title} className="hook-card song-card">
      <div><b>{m.song.title}</b> <span className="small muted">— {m.song.artist} · {m.song.part}</span></div>
      <div className="small">{m.song.roman.join(' ').replace(/b/g, '♭')}</div>
      <div className="small">In your key: <b>{songChordText(m.inMyKey)}</b>{pc(parseNote(m.song.key)!) !== pc(p.k.tonic) && <span className="muted"> · original: {songChordText(m.original)}{m.easy ? ' (easy in your tuning)' : ''}</span>}</div>
      {m.kind === 'shares' && <div className="small muted">Shares {m.shared.join(', ').replace(/b/g, '♭')} with your bars</div>}
      <div className="tool-actions">
        <button type="button" className="tool-hear" onClick={() => p.playChords(m.inMyKey)}><PlayIcon size={14} /> Hear in my key</button>
        <button type="button" onClick={() => p.useChords(m.inMyKey, `Loaded ${m.song.title} in ${keyName(p.k)}`)}>Load in my key</button>
      </div>
    </div>
  );
  return (
    <div className="tool songs-tool">
      <ToolIntro>Famous songs built on the same chord relationships as yours — in any key. A small built-in list ({SONG_CATALOG.length} songs, main loops simplified), so it works offline.</ToolIntro>
      {p.chords.length < 2 ? <p className="tool-warn">Add at least two chords to find songs like yours.</p> : (
        <>
          <h4 className="songs-h">Same progression {same.length ? `(${same.length})` : ''}</h4>
          {same.length ? same.map(card) : <p className="small muted">No exact match in the list — songs sharing chords are below.</p>}
          {shares.length > 0 && <><h4 className="songs-h">Shares chords with yours</h4>{shares.map(card)}</>}
          {!matches.length && <p className="small muted">Nothing close yet. Try a common loop like I–V–vi–IV from the palette.</p>}
        </>
      )}
    </div>
  );
}
