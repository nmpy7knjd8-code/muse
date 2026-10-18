// Idea 1 — draw a tension arc, get chords whose measured tension follows it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ARC_PRESETS, arcFit, arcToChords, levelToArc, resampleArc, type ArcPoint, type ArcStep } from '../../core';
import { ChordChips, Meter, ToolActions, ToolIntro } from './common';
import type { ToolProps } from './types';

const W = 320, H = 170, PAD = 14;

export default function ArcTool(p: ToolProps) {
  const [bars, setBars] = useState(6);
  const [stroke, setStroke] = useState<ArcPoint[]>(() => Array.from({ length: 11 }, (_, i) => ({ x: i / 10, y: ARC_PRESETS.arch!.shape(i / 10) })));
  const [drawing, setDrawing] = useState(false);
  const [steps, setSteps] = useState<ArcStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [useMood, setUseMood] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const targets = useMemo(() => resampleArc(stroke, bars), [stroke, bars]);

  // Recompute after the stroke settles (not while the finger is still moving).
  useEffect(() => {
    if (drawing) return;
    setBusy(true);
    const id = window.setTimeout(() => {
      setSteps(arcToChords(p.engine, p.k, targets, { style: p.tStyle, adventure: p.adventure, profile: useMood ? p.profile : null }));
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [targets, drawing, p.engine, p.k, p.tStyle, p.adventure, useMood, p.profile]);

  const toPoint = (e: React.PointerEvent): ArcPoint => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    return { x: Math.max(0, Math.min(1, (x - PAD) / (W - 2 * PAD))), y: Math.max(0, Math.min(1, 1 - (y - PAD) / (H - 2 * PAD))) };
  };
  const sx = (x: number) => PAD + x * (W - 2 * PAD);
  const sy = (y: number) => PAD + (1 - y) * (H - 2 * PAD);
  const path = stroke.map((pt, i) => `${i ? 'L' : 'M'}${sx(pt.x).toFixed(1)},${sy(pt.y).toFixed(1)}`).join(' ');
  const chords = steps.map((s) => s.chord);
  const fit = arcFit(steps);

  return (
    <div className="tool arc-tool">
      <ToolIntro>Draw how tense each bar should feel — low is calm, high is tense. Muse picks chords whose measured tension follows your line.</ToolIntro>
      <div className="tool-row">
        <div className="seg small-seg" role="group" aria-label="Bars">
          {[4, 6, 8].map((n) => <button key={n} type="button" className={bars === n ? 'on' : ''} aria-pressed={bars === n} onClick={() => setBars(n)}>{n} bars</button>)}
        </div>
      </div>
      <div className="tool-presets">
        {Object.entries(ARC_PRESETS).map(([id, pr]) => (
          <button key={id} type="button" className="pill" onClick={() => setStroke(Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: pr.shape(i / 20) })))}>{pr.label}</button>
        ))}
      </div>
      <svg
        ref={svgRef} className="arc-canvas" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Tension arc drawing area: drag to draw, low is calm, high is tense"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrawing(true); setStroke([toPoint(e)]); }}
        onPointerMove={(e) => { if (drawing) setStroke((s) => [...s, toPoint(e)]); }}
        onPointerUp={() => setDrawing(false)}
        onPointerCancel={() => setDrawing(false)}
      >
        <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} rx={10} className="arc-bg" />
        {Array.from({ length: bars - 1 }, (_, i) => <line key={i} x1={sx((i + 1) / bars)} x2={sx((i + 1) / bars)} y1={PAD} y2={H - PAD} className="arc-grid" />)}
        <text x={PAD + 6} y={PAD + 13} className="arc-axis">tense</text>
        <text x={PAD + 6} y={H - PAD - 6} className="arc-axis">calm</text>
        <path d={path} className="arc-stroke" />
        {targets.map((t, i) => <circle key={`t${i}`} cx={sx((i + 0.5) / bars)} cy={sy(t)} r={3} className="arc-target" />)}
        {!drawing && steps.map((s, i) => (
          <g key={`m${i}`}>
            <circle cx={sx((i + 0.5) / bars)} cy={sy(levelToArc(s.level))} r={6} className="arc-measured" />
            <text x={sx((i + 0.5) / bars)} y={H - 2} className="arc-sym">{s.symbol}</text>
          </g>
        ))}
      </svg>
      <p className="small muted arc-legend"><i className="arc-key line" />your line <i className="arc-key dot" />where each chord really sits</p>
      {p.profile && (
        <label className="tool-check"><input type="checkbox" checked={useMood} onChange={(e) => setUseMood(e.target.checked)} /> Colour it with my mood</label>
      )}
      <div aria-live="polite">
        {busy && !steps.length ? <p className="small muted">Finding chords…</p> : (
          <>
            <ChordChips chords={chords} k={p.k} onTap={(c) => p.playChord(c)} />
            <Meter value={fit} label="How closely the chords follow your line" left="loosely" right="closely" />
          </>
        )}
      </div>
      <ToolActions
        chords={chords}
        onHear={() => p.playChords(chords, p.beatSec * 2)}
        onUse={() => p.useChords(chords, 'Arc chords loaded')}
        onAppend={() => p.appendChords(chords, 'Arc chords added')}
      />
    </div>
  );
}
