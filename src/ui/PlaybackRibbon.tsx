// Scrolling note ribbon during ▶ Play: a fixed playhead with notes/chords sliding past as they sound.
import type { ReactNode } from 'react';
import {
  activeAt,
  chordSymbol,
  timeToX,
  type TimelineEvents,
  type RelKind,
  REL_COLORS,
} from '../core';

const PX_PER_SEC = 72;
const HEAD_X = 72; // fixed playhead x inside the viewport

export interface RibbonNote {
  key: string;
  midi: number;
  at: number;
  dur: number;
  label: string;
  lane: 'melody' | 'bass' | 'chord';
  kind?: RelKind | null;
  slotIndex: number;
}

interface Props {
  events: TimelineEvents;
  /** Seconds from schedule origin (audio clock). */
  playSec: number;
  notes: RibbonNote[];
  /** Chord labels at their attack times for the top lane. */
  chords: Array<{ at: number; dur: number; label: string; index: number }>;
}

export function PlaybackRibbon({ events, playSec, notes, chords }: Props): ReactNode {
  const active = activeAt(events, playSec);
  const totalW = Math.max(320, timeToX(events.total, PX_PER_SEC) + HEAD_X + 80);
  // Keep the playhead fixed; scroll the world left as time advances.
  const shift = HEAD_X - timeToX(playSec, PX_PER_SEC);
  const sounding = (at: number, dur: number) => playSec + 1e-4 >= at && playSec < at + Math.max(dur, 0.05);

  return (
    <div className="play-ribbon" aria-label="Playback — notes scrolling by" role="img">
      <div className="play-ribbon-head">
        <span className="play-ribbon-live">Now</span>
        <span className="small muted">
          {active.chordIndex !== null
            ? (chords.find((c) => c.index === active.chordIndex)?.label ?? '…')
            : '…'}
          {active.melodies[0] ? ` · ${notes.find((n) => n.lane === 'melody' && n.midi === active.melodies[0]!.midi && sounding(n.at, n.dur))?.label ?? ''}` : ''}
        </span>
        <span className="play-ribbon-time small muted">{playSec.toFixed(1)}s / {events.total.toFixed(1)}s</span>
      </div>
      <div className="play-ribbon-view">
        <div className="play-ribbon-playhead" aria-hidden />
        <div
          className="play-ribbon-world"
          style={{ width: totalW, transform: `translate3d(${shift}px, 0, 0)` }}
        >
          {chords.map((c) => (
            <div
              key={`c-${c.index}-${c.at}`}
              className={'play-ribbon-chord' + (sounding(c.at, c.dur) ? ' on' : '')}
              style={{
                left: timeToX(c.at, PX_PER_SEC),
                width: Math.max(36, timeToX(c.dur, PX_PER_SEC)),
              }}
              title={c.label}
            >
              {c.label}
            </div>
          ))}
          {notes.map((n) => {
            const on = sounding(n.at, n.dur);
            const color = n.kind ? REL_COLORS[n.kind] : n.lane === 'bass' ? '#6fb0a8' : '#c4b0ff';
            const top = n.lane === 'bass' ? 52 : 28;
            return (
              <div
                key={n.key}
                className={'play-ribbon-note' + (on ? ' on' : '') + (n.lane === 'bass' ? ' bass' : '')}
                style={{
                  left: timeToX(n.at, PX_PER_SEC),
                  width: Math.max(28, timeToX(n.dur, PX_PER_SEC)),
                  top,
                  borderColor: color,
                  color,
                  ['--glow' as string]: color,
                }}
                title={n.label}
              >
                {n.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Build ribbon note blocks from timeline events + spellers. */
export function ribbonNotesFromEvents(
  ev: TimelineEvents,
  spell: (midi: number) => string,
  chordLabel: (index: number) => string,
): { notes: RibbonNote[]; chords: Array<{ at: number; dur: number; label: string; index: number }> } {
  const notes: RibbonNote[] = [
    ...ev.notes.map((n, i) => ({
      key: `m-${n.index}-${n.beat}-${n.midi}-${i}`,
      midi: n.midi,
      at: n.at,
      dur: n.dur,
      label: spell(n.midi),
      lane: 'melody' as const,
      slotIndex: n.index,
    })),
    ...ev.bass.map((n, i) => ({
      key: `b-${n.index}-${n.beat}-${n.midi}-${i}`,
      midi: n.midi,
      at: n.at,
      dur: n.dur,
      label: spell(n.midi),
      lane: 'bass' as const,
      slotIndex: n.index,
    })),
  ];
  const chords = ev.chords.map((c) => ({
    at: c.at,
    dur: c.dur,
    label: chordLabel(c.index) || chordSymbol(c.chord, true),
    index: c.index,
  }));
  return { notes, chords };
}
