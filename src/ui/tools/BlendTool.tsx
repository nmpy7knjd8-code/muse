// Idea 7 — artist style blend: slide between two Artist Lens artists and write in the mix.
import { useEffect, useMemo, useState } from 'react';
import { blendArtists, blendProgression, inkOn, type JourneyStep } from '../../core';
import { ChordChips, ToolActions, ToolIntro } from './common';
import type { ToolProps } from './types';

export default function BlendTool(p: ToolProps) {
  const list = p.artists?.artists ?? [];
  const pick = (name: string, fallback: number) => list.find((a) => a.name === name)?.id ?? list[fallback]?.id ?? '';
  const [aId, setA] = useState(() => pick('The Beatles', 0));
  const [bId, setB] = useState(() => pick('Radiohead', 1));
  const [t, setT] = useState(0.5);
  const [len, setLen] = useState(4);
  const [variant, setVariant] = useState(0);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const A = list.find((a) => a.id === aId), B = list.find((a) => a.id === bId);
  const blend = useMemo(() => (A && B ? blendArtists(p.engine, A, B, t) : null), [A, B, t, p.engine]);
  const polDefs = new Map((p.artists?.polarities ?? []).map((d) => [d.id, d]));

  useEffect(() => {
    if (!blend) return;
    const id = window.setTimeout(() => setSteps(blendProgression(p.engine, p.k, blend, { length: len, variant })), 120);
    return () => window.clearTimeout(id);
  }, [blend, len, variant, p.engine, p.k]);

  if (!p.artists || list.length < 2 || !A || !B) return <div className="tool"><p className="tool-warn">Artist data hasn’t loaded yet — open Artist Lens once while online.</p></div>;
  const chords = steps.map((s) => s.chord);
  const lean = t < 0.2 ? `mostly ${A.name}` : t > 0.8 ? `mostly ${B.name}` : t > 0.4 && t < 0.6 ? 'an even mix' : `leaning ${t < 0.5 ? A.name : B.name}`;

  return (
    <div className="tool blend-tool">
      <ToolIntro>Pick two artists and slide between them. Muse mixes their moods and leanings and writes a progression in the blend.</ToolIntro>
      <div className="blend-pick">
        <select aria-label="First artist" value={aId} onChange={(e) => setA(e.target.value)}>{list.map((a) => <option key={a.id} value={a.id} disabled={a.id === bId}>{a.name}</option>)}</select>
        <button type="button" className="ticon blend-swap" aria-label="Swap artists" onClick={() => { setA(bId); setB(aId); setT(1 - t); }}>⇄</button>
        <select aria-label="Second artist" value={bId} onChange={(e) => setB(e.target.value)}>{list.map((a) => <option key={a.id} value={a.id} disabled={a.id === aId}>{a.name}</option>)}</select>
      </div>
      <label className="sec-slider">
        <input type="range" min={0} max={1} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label={`Blend between ${A.name} and ${B.name}`} aria-valuetext={lean} />
        <span className="tool-meter-poles"><span>{A.name}</span><span className="blend-lean">{lean}</span><span>{B.name}</span></span>
      </label>
      {blend && (
        <div className="tool-card">
          <div className="sec-words">
            {blend.moods.slice(0, 5).map((m) => <span key={m.id} className="tag" style={{ background: p.lex.color(m.id), color: inkOn(p.lex.color(m.id)), opacity: 0.5 + 0.5 * Math.min(1, m.weight / blend.moods[0]!.weight) }}>{p.lex.label(m.id).toLowerCase()}</span>)}
          </div>
          <div className="polbars">
            {blend.leans.map((l) => {
              const def = polDefs.get(l.id);
              if (!def) return null;
              return (
                <div key={l.id} className="polbar">
                  <div className="polhead">
                    <span className="pole left" aria-hidden>{def.poles[0]}</span>
                    <span className="track" role="img" aria-label={`${def.poles[0]} to ${def.poles[1]}: blend sits ${l.mix < 0.4 ? 'toward ' + def.poles[0] : l.mix > 0.6 ? 'toward ' + def.poles[1] : 'in between'}`}>
                      <i className="marker ghost" style={{ left: `${l.a * 100}%` }} />
                      <i className="marker ghost" style={{ left: `${l.b * 100}%` }} />
                      <i className="marker" style={{ left: `${l.mix * 100}%` }} />
                    </span>
                    <span className="pole right" aria-hidden>{def.poles[1]}</span>
                  </div>
                </div>
              );
            })}
            <div className="small muted blend-legend">bright marker: the blend · faint: each artist</div>
          </div>
        </div>
      )}
      <div className="tool-row">
        <div className="seg small-seg" role="group" aria-label="Length">
          {[4, 8].map((n) => <button key={n} type="button" className={len === n ? 'on' : ''} aria-pressed={len === n} onClick={() => setLen(n)}>{n} chords</button>)}
        </div>
        <button type="button" className="pill" onClick={() => setVariant((v) => v + 1)}>Another take</button>
      </div>
      <ChordChips chords={chords} k={p.k} onTap={(c) => p.playChord(c)} />
      <ToolActions
        chords={chords}
        onHear={() => p.playChords(chords, p.beatSec * 2)}
        onUse={() => p.useChords(chords, `${A.name} × ${B.name} loaded`)}
        onAppend={() => p.appendChords(chords, `${A.name} × ${B.name} added`)}
      />
    </div>
  );
}
