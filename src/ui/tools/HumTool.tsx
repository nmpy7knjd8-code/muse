// Idea 4 — hum (or tap) a melody, get three harmonisations in different moods.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  beatsPerBar, chordSymbol, detectKeys, harmonizeHum, keyName, midiName, noteName, quantizeHum, scalePcs, segmentHum, tapsToNotes, tonicPc,
  type BeatNote, type HumHarmony, type Key, type PitchFrame,
} from '../../core';
import { listenErrorMessage } from '../listen';
import { startMicPitch, type MicSession } from '../micPitch';
import { PlayIcon } from '../icons';
import { ChordChips, Meter, ToolIntro } from './common';
import type { ToolProps } from './types';

type Source = 'hum' | 'tap' | 'timeline';
const MAX_BARS = 8;

export default function HumTool(p: ToolProps) {
  const bpb = beatsPerBar(p.timeSig);
  const [source, setSource] = useState<Source>(p.melody.length ? 'timeline' : 'hum');
  const [notes, setNotes] = useState<BeatNote[]>(() => (p.melody.length ? p.melody.filter((n) => n.beat < MAX_BARS * bpb) : []));
  const [rec, setRec] = useState<'idle' | 'count' | 'rec'>('idle');
  const [countLeft, setCountLeft] = useState(0);
  const [live, setLive] = useState<{ midi: number | null; level: number }>({ midi: null, level: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [clickOn, setClickOn] = useState(true);
  const [twoBar, setTwoBar] = useState(false);
  const [detectKey, setDetectKey] = useState(false);
  const [results, setResults] = useState<HumHarmony[]>([]);
  const [busy, setBusy] = useState(false);
  const frames = useRef<PitchFrame[]>([]);
  const mic = useRef<MicSession | null>(null);
  const clickTimer = useRef<number | null>(null);
  const recStart = useRef(0);
  const taps = useRef<Array<{ midi: number; t: number }>>([]);
  const [tapCount, setTapCount] = useState(0);

  const melodyKey: Key | null = useMemo(() => (notes.length >= 3 ? detectKeys([], notes.map((n) => n.midi))[0]?.key ?? null : null), [notes]);
  const k = detectKey && melodyKey ? melodyKey : p.k;
  const span = twoBar ? bpb * 2 : bpb;

  useEffect(() => {
    if (!notes.length) { setResults([]); return; }
    setBusy(true);
    const id = window.setTimeout(() => {
      const moods = p.profile ? [] : undefined;
      setResults(harmonizeHum(p.engine, k, notes, { beatsPerBar: bpb, span, moods, adventure: p.adventure * 0.8, profile: p.profile, maxBars: MAX_BARS }));
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [notes, k, bpb, span, p.engine, p.profile, p.adventure]);

  const stopAll = () => {
    mic.current?.stop(); mic.current = null;
    if (clickTimer.current) { window.clearInterval(clickTimer.current); clickTimer.current = null; }
  };
  useEffect(() => () => stopAll(), []);

  const finishHum = () => {
    stopAll();
    setRec('idle');
    const segs = segmentHum(frames.current);
    const origin = clickOn ? recStart.current : undefined;
    const q = quantizeHum(segs, p.beatSec, 0.5, origin).filter((n) => n.beat < MAX_BARS * bpb);
    setNotes(q);
    if (!q.length) setErr('Didn’t catch any notes — hum a little louder, “doo” or “la” works best.');
  };

  const startHum = async () => {
    setErr(null); frames.current = [];
    try {
      const countIn = clickOn ? bpb : 0;
      const session = await startMicPitch({ onFrame: (f) => { frames.current.push({ t: f.t, midi: f.midi }); setLive({ midi: f.midi, level: f.level }); } });
      mic.current = session;
      // Click track: one bar count-in, then a click per beat while recording. Recording time 0 = mic start.
      const t0 = performance.now();
      recStart.current = countIn * p.beatSec;
      if (clickOn) {
        const origin = p.audio.origin();
        let next = 0;
        const schedule = () => {
          const elapsed = (performance.now() - t0) / 1000;
          while (next * p.beatSec < elapsed + 1.0) { p.audio.click(next * p.beatSec, next % bpb === 0, origin); next++; }
          const beat = Math.floor(elapsed / p.beatSec);
          if (beat < countIn) { setRec('count'); setCountLeft(countIn - beat); } else setRec('rec');
          if (elapsed > recStart.current + MAX_BARS * bpb * p.beatSec) finishHum();
        };
        schedule();
        clickTimer.current = window.setInterval(schedule, 120);
      } else {
        setRec('rec');
        clickTimer.current = window.setInterval(() => { if ((performance.now() - t0) / 1000 > MAX_BARS * bpb * p.beatSec) finishHum(); }, 250);
      }
    } catch (e) {
      stopAll(); setRec('idle'); setErr(listenErrorMessage(e));
    }
  };

  const tapKey = (midi: number) => {
    const t = performance.now() / 1000;
    if (!taps.current.length) recStart.current = t;
    taps.current.push({ midi, t });
    setTapCount(taps.current.length);
    p.audio.note(midi, 0, 0.45);
    setNotes(quantizeHum(tapsToNotes(taps.current, p.beatSec), p.beatSec).filter((n) => n.beat < MAX_BARS * bpb));
  };
  const clearTaps = () => { taps.current = []; setTapCount(0); setNotes([]); };

  const pickSource = (s: Source) => {
    stopAll(); setRec('idle'); setErr(null); setSource(s);
    if (s === 'timeline') setNotes(p.melody.filter((n) => n.beat < MAX_BARS * bpb));
    else { setNotes([]); taps.current = []; setTapCount(0); }
  };

  const hear = (h: HumHarmony | null) => {
    p.audio.stop();
    const origin = p.audio.origin();
    const sb = p.beatSec;
    if (h) h.chords.forEach((c, i) => p.audio.chord(c, i * span * sb, span * sb * 0.96, origin));
    for (const n of notes) p.audio.note(n.midi, n.beat * sb, Math.max(0.15, n.dur * sb * 0.95), origin);
  };
  const use = (h: HumHarmony) => {
    const bars = Math.max(1, Math.ceil(((notes[notes.length - 1]?.beat ?? 0) + 0.01) / bpb), h.chords.length * (span / bpb));
    const out = Array.from({ length: Math.min(MAX_BARS, bars) }, (_, i) => ({
      chord: h.chords[Math.min(h.chords.length - 1, Math.floor((i * bpb) / span))]!,
      notes: notes.filter((n) => n.beat >= i * bpb && n.beat < (i + 1) * bpb).map((n) => ({ ...n, beat: n.beat - i * bpb })),
    }));
    if (detectKey && melodyKey) p.setKey(noteName(melodyKey.tonic), melodyKey.mode);
    p.useBars(out, `${p.lex.label(h.mood)} harmony loaded with your melody`);
  };

  // Piano-roll preview of the captured melody
  const lo = notes.length ? Math.min(...notes.map((n) => n.midi)) - 2 : 58;
  const hi = notes.length ? Math.max(...notes.map((n) => n.midi)) + 2 : 74;
  const totalBeats = Math.max(bpb, Math.ceil(((notes[notes.length - 1]?.beat ?? 0) + (notes[notes.length - 1]?.dur ?? 0)) / bpb) * bpb);
  const W = 320, H = 86;
  const rx = (b: number) => 6 + (b / totalBeats) * (W - 12);
  const ry = (m: number) => 6 + ((hi - m) / Math.max(1, hi - lo)) * (H - 16);
  const keyPcs = new Set(scalePcs(p.k));
  const tapBase = 60 + tonicPc(p.k) - (tonicPc(p.k) > 5 ? 12 : 0);

  return (
    <div className="tool hum-tool">
      <ToolIntro>Hum a tune (or tap it on the keys) and Muse writes three harmonies for it in different moods. Hear each one under your melody, then load the one you like — melody included.</ToolIntro>
      <div className="seg small-seg" role="group" aria-label="Melody source">
        <button type="button" className={source === 'hum' ? 'on' : ''} aria-pressed={source === 'hum'} onClick={() => pickSource('hum')}>Hum</button>
        <button type="button" className={source === 'tap' ? 'on' : ''} aria-pressed={source === 'tap'} onClick={() => pickSource('tap')}>Tap keys</button>
        <button type="button" className={source === 'timeline' ? 'on' : ''} aria-pressed={source === 'timeline'} disabled={!p.melody.length} onClick={() => pickSource('timeline')}>My melody</button>
      </div>

      {source === 'hum' && (
        <div className="tool-card hum-rec">
          <button
            type="button" className={'hum-mic' + (rec !== 'idle' ? ' on' : '')}
            onClick={() => (rec === 'idle' ? void startHum() : finishHum())}
            aria-label={rec === 'idle' ? 'Start humming' : 'Stop'}
          >
            <span className="hum-dot" />
            {rec === 'idle' ? 'Start' : rec === 'count' ? `Ready… ${countLeft}` : 'Stop'}
          </button>
          <div className="hum-live" aria-live="polite">
            {rec === 'rec' ? <><b>{live.midi != null ? midiName(Math.round(live.midi)) : '…'}</b><span className="hum-level"><i style={{ width: `${Math.min(100, live.level * 900)}%` }} /></span></>
              : <span className="small muted">{rec === 'idle' ? `Up to ${MAX_BARS} bars at the session tempo.` : 'Count-in…'}</span>}
          </div>
          <label className="tool-check"><input type="checkbox" checked={clickOn} disabled={rec !== 'idle'} onChange={(e) => setClickOn(e.target.checked)} /> Click track with a one-bar count-in</label>
          {err && <p className="tool-warn">{err}</p>}
        </div>
      )}

      {source === 'tap' && (
        <div className="tool-card">
          <div className="hum-keys" role="group" aria-label="Tap keyboard">
            {Array.from({ length: 13 }, (_, i) => tapBase + i).map((m) => (
              <button key={m} type="button" className={'hum-key' + (keyPcs.has(m % 12) ? ' in' : '') + (/#|♯/.test(midiName(m)) ? ' blk' : '')} onPointerDown={(e) => { e.preventDefault(); tapKey(m); }} aria-label={midiName(m)}>
                <span>{midiName(m).replace(/-?\d+$/, '')}</span>
              </button>
            ))}
          </div>
          <div className="tool-row"><span className="small muted">{tapCount ? `${tapCount} notes — rhythm follows your taps` : 'Tap the tune in rhythm; highlighted keys are in the key.'}</span>
            {tapCount > 0 && <button type="button" className="pill" onClick={clearTaps}>Clear</button>}</div>
        </div>
      )}

      {notes.length > 0 && (
        <>
          <svg className="hum-roll" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Your melody: ${notes.length} notes`}>
            <rect x={0} y={0} width={W} height={H} rx={10} className="arc-bg" />
            {Array.from({ length: totalBeats / bpb + 1 }, (_, i) => <line key={i} x1={rx(i * bpb)} x2={rx(i * bpb)} y1={4} y2={H - 4} className="arc-grid" />)}
            {notes.map((n, i) => <rect key={i} x={rx(n.beat)} y={ry(n.midi) - 3} width={Math.max(3, rx(n.beat + n.dur) - rx(n.beat) - 2)} height={6} rx={3} className="hum-note" />)}
          </svg>
          <div className="tool-row">
            <div className="seg small-seg hum-rate" role="group" aria-label="Chord rate">
              <button type="button" className={!twoBar ? 'on' : ''} aria-pressed={!twoBar} onClick={() => setTwoBar(false)}>Chord every bar</button>
              <button type="button" className={twoBar ? 'on' : ''} aria-pressed={twoBar} onClick={() => setTwoBar(true)}>Every 2 bars</button>
            </div>
            <button type="button" className="tool-hear" onClick={() => hear(null)}><PlayIcon size={14} /> Melody</button>
          </div>
          {melodyKey && (keyName(melodyKey) !== keyName(p.k)) && (
            <label className="tool-check"><input type="checkbox" checked={detectKey} onChange={(e) => setDetectKey(e.target.checked)} /> Your tune sounds like {keyName(melodyKey)} — harmonise in that key</label>
          )}
          <div aria-live="polite" className="hum-results">
            {busy && !results.length && <p className="small muted">Harmonising…</p>}
            {results.map((h) => (
              <div key={h.mood + h.chords.map((c) => chordSymbol(c)).join()} className="tool-card hum-card" style={{ borderColor: h.mood === 'yours' ? undefined : p.lex.color(h.mood) + '66' }}>
                <h4 style={{ color: h.mood === 'yours' ? undefined : p.lex.color(h.mood) }}>{h.mood === 'yours' ? 'Your mood' : p.lex.label(h.mood)}</h4>
                <ChordChips chords={h.chords} k={k} onTap={(c) => p.playChord(c)} />
                <Meter value={h.fit} label="Fits your melody" left="rubs" right="sits snug" color={h.mood === 'yours' ? undefined : p.lex.color(h.mood)} />
                <div className="tool-actions">
                  <button type="button" className="tool-hear" onClick={() => hear(h)}><PlayIcon size={14} /> Hear with melody</button>
                  <button type="button" className="add" onClick={() => use(h)}>Use this</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
