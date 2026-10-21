// Tuner (idea 22): mic tuner for the selected guitar tuning; nearest-string auto-detect or locked string.
import { useEffect, useRef, useState } from 'react';
import { stringLabel, tunerReading, type TunerReading } from '../../core';
import { listenErrorMessage } from '../listen';
import { startMicPitch, type MicSession } from '../micPitch';
import { PlayIcon } from '../icons';
import { ToolIntro } from './common';
import type { ToolProps } from './types';

export default function TunerTool(p: ToolProps) {
  const t = p.tuning;
  const [lock, setLock] = useState<number | null>(null);
  const [on, setOn] = useState(false);
  const [r, setR] = useState<TunerReading | null>(null);
  const [steady, setSteady] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const mic = useRef<MicSession | null>(null);
  const lockRef = useRef(lock); lockRef.current = lock;
  const smooth = useRef<number | null>(null);
  const stop = () => { mic.current?.stop(); mic.current = null; setOn(false); };
  useEffect(() => stop, []);
  useEffect(() => { setR(null); }, [t.id]);
  const start = async () => {
    setErr(null);
    try {
      mic.current = await startMicPitch({
        minFreq: 50, maxFreq: 700, minRms: 0.008,
        onFrame: (f) => {
          if (f.midi === null) { smooth.current = null; setSteady(0); return; }
          smooth.current = smooth.current === null || Math.abs(smooth.current - f.midi) > 0.8 ? f.midi : smooth.current * 0.7 + f.midi * 0.3;
          const rd = tunerReading(smooth.current, t, lockRef.current);
          setR(rd); setSteady((s) => (rd.state === 'in' ? s + 1 : 0));
        },
      });
      setOn(true);
    } catch (e) { setErr(listenErrorMessage(e)); }
  };
  const pos = r ? Math.max(0, Math.min(1, 0.5 + r.cents / 100)) : 0.5;
  const solid = r?.state === 'in' && steady >= 15;
  return (
    <div className="tool tuner-tool">
      <ToolIntro>Tuning to <b>{t.name}</b>. Play one string at a time — Muse finds the nearest string, or tap one to lock it. (Change tuning in the Style row on Write.)</ToolIntro>
      <div className="tuner-strings" role="group" aria-label="String">
        <button type="button" aria-pressed={lock === null} className={'tuner-str' + (lock === null ? ' on' : '')} onClick={() => setLock(null)}>Auto</button>
        {t.strings.map((m, i) => (
          <button key={i} type="button" aria-pressed={lock === i} className={'tuner-str' + (lock === i ? ' on' : '') + (r?.string === i ? ' hit' : '')}
            onClick={() => { setLock(i); p.audio.note(m + 12, 0, 1.6, p.audio.origin()); }}>{stringLabel(t, i)}</button>
        ))}
      </div>
      <div className={'tuner-gauge' + (solid ? ' solid' : r?.state === 'in' ? ' in' : '')} role="meter" aria-label="Tuning" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.round(pos * 100) / 100}>
        <div className="tuner-zone" />
        <i className="tuner-needle" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="tool-meter-poles small"><span>flat (tune up)</span><span>sharp (tune down)</span></div>
      <p className="tuner-read" aria-live="polite">
        {!on ? 'Tap Start and play a string.' : !r ? 'Listening…' : r.state === 'in' ? `${stringLabel(t, r.string)} — in tune ✓` : `${stringLabel(t, r.string)} — ${r.state === 'flat' ? 'tune up ↑' : 'tune down ↓'}`}
      </p>
      <div className="tool-actions">
        <button type="button" className={on ? '' : 'add'} onClick={on ? stop : start}>{on ? 'Stop' : 'Start tuner'}</button>
        {lock !== null && <button type="button" className="tool-hear" onClick={() => p.audio.note(t.strings[lock]! + 12, 0, 1.6, p.audio.origin())}><PlayIcon size={14} /> Reference</button>}
      </div>
      {err && <p className="tool-warn small">{err}</p>}
      <p className="small muted">Tip: pluck firmly and let it ring; low strings need a second to settle. Reference notes play an octave up so phone speakers can sound them.</p>
    </div>
  );
}
