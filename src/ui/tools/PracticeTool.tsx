// Idea 10 — play along with the progression: count-in, looping bars, optional mic scoring of chord tones.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PracticeScorer, beatsPerBar, chordSymbol, chordToneHint, midiName, parseChord, practicePos, practiceSchedule, parseRoman,
  type Chord, type NoteClass, type PracticeResult,
} from '../../core';
import { listenErrorMessage } from '../listen';
import { startMicPitch, type MicSession } from '../micPitch';
import { PlayIcon } from '../icons';
import { ChordChips, Meter, ToolIntro } from './common';
import type { ToolProps } from './types';

const SPEEDS = [{ v: 0.5, label: 'Slow' }, { v: 0.75, label: 'Steady' }, { v: 1, label: 'Full' }] as const;
const LOOPS = [{ v: 1, label: 'Once' }, { v: 2, label: '2×' }, { v: 4, label: '4×' }, { v: null, label: 'Loop' }] as const;
const CLASS_COLOR: Record<NoteClass, string> = { chord: '#81C784', scale: '#81D4FA', outside: '#E57373' };
const CLASS_LABEL: Record<NoteClass, string> = { chord: 'chord tone', scale: 'in key', outside: 'outside' };

export default function PracticeTool(p: ToolProps) {
  const bpb = beatsPerBar(p.timeSig);
  const example = useMemo(() => ['I', 'V', 'vi', 'IV'].map((r) => parseRoman(r, p.k) ?? parseChord('C')!), [p.k]);
  const chords: Chord[] = p.chords.length ? p.chords.slice(0, 16) : example;
  const [speed, setSpeed] = useState<number>(0.75);
  const [loops, setLoops] = useState<number | null>(2);
  const [micOn, setMicOn] = useState(true);
  const [state, setState] = useState<'idle' | 'count' | 'play'>('idle');
  const [pos, setPos] = useState<{ bar: number; beat: number; loop: number; count: number }>({ bar: -1, beat: 0, loop: 0, count: 0 });
  const [live, setLive] = useState<{ midi: number | null; cls: NoteClass | null; level: number }>({ midi: null, cls: null, level: 0 });
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [weak, setWeak] = useState<number | null>(null);
  const [liveBars, setLiveBars] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const mic = useRef<MicSession | null>(null);
  const timer = useRef<number | null>(null);
  const scorer = useRef<PracticeScorer | null>(null);
  const scoring = useRef(false);

  const beatSec = p.beatSec / speed;
  const sched = useMemo(() => practiceSchedule({ beatSec, beatsPerBar: bpb, bars: chords.length, countInBars: 1, loops }), [beatSec, bpb, chords.length, loops]);

  const halt = () => {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    mic.current?.stop(); mic.current = null;
    p.audio.stop();
  };
  useEffect(() => () => halt(), []);
  // Restart-safe: changing settings mid-run stops the run.
  useEffect(() => { if (state !== 'idle') stop(); }, [speed, loops, chords.length]);

  const finish = () => {
    halt();
    setState('idle');
    if (scorer.current && scoring.current) { setResult(scorer.current.result()); setWeak(scorer.current.weakest()); }
  };
  const stop = () => finish();

  const start = async () => {
    halt(); setErr(null); setResult(null); setWeak(null);
    scorer.current = new PracticeScorer(chords, p.k);
    setLiveBars(chords.map(() => 0));
    const origin = p.audio.origin();
    const now0 = p.audio.now() ?? 0;
    // Positions are measured from `origin`, in audio-clock seconds.
    const elapsed = () => (p.audio.now() ?? now0) - origin;
    let nextClick = 0;
    let nextBar = 0;
    const tick = () => {
      const t = elapsed();
      // Count-in clicks (accent on beat 1), then a light click on beat 1 of every bar.
      while (nextClick < sched.countInBeats && nextClick * beatSec < t + 1.2) { p.audio.click(nextClick * beatSec, nextClick === 0, origin); nextClick++; }
      while (true) {
        const loop = Math.floor(nextBar / chords.length);
        if (sched.loops != null && loop >= sched.loops) break;
        const at = (sched.countInBeats + nextBar * bpb) * beatSec;
        if (at > t + 1.5) break;
        p.audio.chord(chords[nextBar % chords.length]!, at, bpb * beatSec * 0.97, origin);
        nextBar++;
      }
      const ps = practicePos(sched, Math.max(0, t));
      if (ps.done) { finish(); return; }
      setState(ps.countIn ? 'count' : 'play');
      setPos({ bar: ps.bar, beat: ps.beat, loop: ps.loop, count: ps.countIn ? sched.countInBeats - ps.beat : 0 });
    };
    tick();
    timer.current = window.setInterval(tick, 50);
    scoring.current = micOn;
    if (micOn) {
      try {
        mic.current = await startMicPitch({
          onFrame: (f) => {
            const ps = practicePos(sched, elapsed());
            const cls = ps.countIn || ps.done ? null : scorer.current?.push(ps.bar, f.midi) ?? null;
            setLive({ midi: f.midi, cls, level: f.level });
            if (cls && scorer.current) {
              const r = scorer.current.result().bars;
              setLiveBars(r.map((b) => (b.frames ? (b.chord + 0.5 * b.scale) / b.frames : 0)));
            }
          },
        });
      } catch (e) {
        setErr(listenErrorMessage(e) + ' Playing along without scoring.');
        setMicOn(false); scoring.current = false;
      }
    }
  };

  const running = state !== 'idle';
  const curChord = pos.bar >= 0 ? chords[pos.bar] : null;

  return (
    <div className="tool practice-tool">
      <ToolIntro>
        Play or sing along with {p.chords.length ? 'your progression' : 'an example progression (add chords to practise your own)'}.
        One bar of count-in, then the chords loop. With the mic on, Muse listens and scores how often you land on the notes of each chord.
      </ToolIntro>

      <ChordChips chords={chords} k={p.k} active={running && pos.bar >= 0 ? pos.bar : null} onTap={(c) => !running && p.playChord(c)}
        colorOf={(_, i) => (result && result.bars[i]?.frames ? scoreColor(barScore(result, i)) : undefined)} />

      <div className="tool-card practice-controls">
        <div className="practice-row"><span className="tool-label">Speed</span>
          <div className="seg" role="radiogroup" aria-label="Speed">
            {SPEEDS.map((s) => <button key={s.label} type="button" role="radio" aria-checked={speed === s.v} className={speed === s.v ? 'on' : ''} onClick={() => setSpeed(s.v)}>{s.label}</button>)}
          </div>
        </div>
        <div className="practice-row"><span className="tool-label">Repeat</span>
          <div className="seg" role="radiogroup" aria-label="Repeat">
            {LOOPS.map((s) => <button key={s.label} type="button" role="radio" aria-checked={loops === s.v} className={loops === s.v ? 'on' : ''} onClick={() => setLoops(s.v)}>{s.label}</button>)}
          </div>
        </div>
        <label className="tool-check"><input type="checkbox" checked={micOn} disabled={running} onChange={(e) => setMicOn(e.target.checked)} /> Score me with the mic (headphones help)</label>
        <p className="tool-note">{Math.round(60 / beatSec)} BPM · {bpb} beats per bar</p>
      </div>

      <div className="practice-stage">
        <button type="button" className={'hum-mic practice-go' + (running ? ' on' : '')} onClick={running ? stop : start} aria-label={running ? 'Stop practice' : 'Start practice'}>
          {running ? <><span className="hum-dot" /> Stop</> : <><PlayIcon size={16} /> Start</>}
        </button>
        <div className="practice-now" aria-live="polite">
          {state === 'count' && <><span className="practice-count">{pos.count}</span><span className="muted small">get ready…</span></>}
          {state === 'play' && curChord && (
            <>
              <b className="practice-chord">{chordSymbol(curChord, true)}</b>
              <span className="muted small">aim for {chordToneHint(curChord)}{loops !== 1 ? ` · pass ${pos.loop + 1}${loops ? ` of ${loops}` : ''}` : ''}</span>
            </>
          )}
          {state === 'idle' && <span className="muted small">{result ? 'Run finished.' : 'Press Start when you’re ready.'}</span>}
        </div>
        {running && (
          <div className="practice-beats" aria-hidden>
            {Array.from({ length: bpb }, (_, i) => <i key={i} className={(state === 'count' ? sched.countInBeats - pos.count : pos.beat) === i ? 'on' : ''} />)}
          </div>
        )}
        {running && micOn && (
          <div className="hum-live practice-live">
            <b style={{ color: live.cls ? CLASS_COLOR[live.cls] : undefined }}>{live.midi != null ? midiName(Math.round(live.midi)) : '—'}</b>
            <span className="small" style={{ color: live.cls ? CLASS_COLOR[live.cls] : 'var(--muted)' }}>{live.cls ? CLASS_LABEL[live.cls] : 'listening'}</span>
            <div className="hum-level"><i style={{ width: `${Math.min(100, live.level * 600)}%` }} /></div>
          </div>
        )}
        {err && <p className="tool-warn">{err}</p>}
      </div>

      {running && micOn && (
        <div className="tool-card practice-bars">
          {chords.map((c, i) => <Meter key={i} label={chordSymbol(c, true)} value={liveBars[i] ?? 0} color={scoreColor(liveBars[i] ?? 0)} />)}
        </div>
      )}

      {result && !running && (
        <div className="tool-card practice-result">
          <h4>Your run</h4>
          <Meter label="Chord-tone accuracy" value={result.total / 100} left="outside" right="locked in" color={scoreColor(result.total / 100)} />
          <p className="practice-words">{result.words}</p>
          {result.heard > 0 && (
            <div className="practice-legend small">
              {(['chord', 'scale', 'outside'] as NoteClass[]).map((c) => (
                <span key={c}><i style={{ background: CLASS_COLOR[c] }} />{CLASS_LABEL[c]}</span>
              ))}
            </div>
          )}
          {result.heard > 0 && (
            <div className="practice-split">
              {chords.map((c, i) => {
                const b = result.bars[i]!;
                return (
                  <div key={i} className="practice-split-row">
                    <b>{chordSymbol(c, true)}</b>
                    <div className="practice-stack" role="img" aria-label={`${chordSymbol(c)}: ${b.frames ? Math.round((100 * b.chord) / b.frames) : 0}% chord tones`}>
                      {b.frames ? (['chord', 'scale', 'outside'] as NoteClass[]).map((k) => <i key={k} style={{ flex: b[k], background: CLASS_COLOR[k] }} />) : <span className="muted small">not heard</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {weak != null && chords[weak] && result.total < 90 && (
            <p className="tool-note">Work on bar {weak + 1} ({chordSymbol(chords[weak]!, true)}): aim for {chordToneHint(chords[weak]!)}.</p>
          )}
          <div className="tool-actions">
            <button type="button" className="tool-hear" onClick={start}><PlayIcon size={14} /> Again</button>
            {speed < 1 && result.total >= 80 && <button type="button" onClick={() => setSpeed(speed === 0.5 ? 0.75 : 1)}>Speed up</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function barScore(r: PracticeResult, i: number): number {
  const b = r.bars[i]!;
  return b.frames ? (b.chord + 0.5 * b.scale) / b.frames : 0;
}
function scoreColor(v: number): string {
  return v >= 0.75 ? '#81C784' : v >= 0.5 ? '#FFD54F' : '#E57373';
}
