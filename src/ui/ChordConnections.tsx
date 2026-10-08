// Timeline companion: show how notes connect *within* each bar and *between* chords.
import { useMemo, useState, type ReactNode } from 'react';
import {
  analyzeConnections,
  bridgeSummary,
  formatSequence,
  type ChordBridge,
  type BarSequence,
  type MelStep,
  type Key,
  type TimelineSlot,
  type TheoryKB,
  type MoveKind,
} from '../core';
import { VoiceLeadingViz, VoiceLegend, CURRENT_COLOR, KIND_COLORS } from './visuals';

type ViewMode = 'both' | 'between' | 'within';

interface Props {
  slots: TimelineSlot[];
  keyInfo: Key;
  kb?: TheoryKB | null;
  beats: number;
  spell: (midi: number) => string;
  /** Highlight a timeline / tension bar index. */
  focusIndex?: number | null;
  onFocusBar?: (slotIndex: number) => void;
  /** Hear the two voicings of a bridge in sequence. */
  onHearBridge?: (bridge: ChordBridge) => void;
}

const KIND_LABEL: Record<MoveKind, string> = {
  common: 'held',
  half: '½ step',
  whole: 'whole step',
  leap: 'leap',
};

function StepChip({ step, spell }: { step: MelStep; spell: (m: number) => string }) {
  const c = KIND_COLORS[step.kind];
  const delta = step.delta === 0 ? 'held' : `${step.delta > 0 ? '+' : ''}${step.delta}`;
  return (
    <span className="conn-step" style={{ borderColor: c, color: c }} title={`${spell(step.from)} → ${spell(step.to)} · ${KIND_LABEL[step.kind]}`}>
      {spell(step.from)}
      <i style={{ background: c }} />
      <small>{delta}</small>
      <i style={{ background: c }} />
      {spell(step.to)}
    </span>
  );
}

function WithinBar({ bar, spell, on }: { bar: BarSequence; spell: (m: number) => string; on?: boolean }) {
  const mel = bar.melody.map((n) => n.midi);
  const bass = bar.bass.map((n) => n.midi);
  if (!mel.length && !bass.length) {
    return (
      <div className={'conn-within-bar' + (on ? ' on' : '')}>
        <div className="conn-within-head">
          <b>Bar {bar.slotIndex + 1}</b>
          <span className="muted">{bar.symbol}</span>
        </div>
        <p className="small muted">No melody or bass in this bar yet — chord tones still connect in Between.</p>
      </div>
    );
  }
  return (
    <div className={'conn-within-bar' + (on ? ' on' : '')}>
      <div className="conn-within-head">
        <b>Bar {bar.slotIndex + 1}</b>
        <span className="muted">{bar.symbol}</span>
      </div>
      {mel.length > 0 && (
        <div className="conn-seq">
          <span className="conn-seq-label">Melody</span>
          <span className="conn-seq-line" title={formatSequence(mel, spell)}>
            {mel.length === 1 ? (
              <span className="conn-tone">
                {spell(mel[0]!)}
                {bar.melody[0]?.relationLabel && <small>{bar.melody[0].relationLabel}</small>}
              </span>
            ) : (
              bar.withinMelody.map((s, i) => <StepChip key={i} step={s} spell={spell} />)
            )}
          </span>
          {mel.length > 1 && (
            <span className="small muted conn-seq-plain">{formatSequence(mel, spell)}</span>
          )}
        </div>
      )}
      {bass.length > 0 && (
        <div className="conn-seq">
          <span className="conn-seq-label">Bass</span>
          <span className="conn-seq-line">
            {bass.length === 1 ? (
              <span className="conn-tone bass">{spell(bass[0]!)}</span>
            ) : (
              bar.withinBass.map((s, i) => <StepChip key={i} step={s} spell={spell} />)
            )}
          </span>
        </div>
      )}
      {bar.melody.length > 0 && bar.chord && (
        <div className="conn-roles small muted">
          {bar.melody.map((n, i) => (
            <span key={i}>
              {spell(n.midi)}
              {n.relationLabel ? ` · ${n.relationLabel}` : ''}
              {i < bar.melody.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BridgeCard({
  bridge,
  spell,
  focused,
  onFocus,
  onHear,
}: {
  bridge: ChordBridge;
  spell: (m: number) => string;
  focused: boolean;
  onFocus?: () => void;
  onHear?: () => void;
}) {
  return (
    <article
      className={'conn-bridge' + (focused ? ' on' : '')}
      onClick={onFocus}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus?.(); } }}
      aria-label={`${bridge.fromSymbol} to ${bridge.toSymbol}: ${bridgeSummary(bridge)}`}
    >
      <header className="conn-bridge-head">
        <span className="conn-bridge-syms">
          <b>{bridge.fromSymbol}</b>
          <span className="conn-arrow" aria-hidden>→</span>
          <b style={{ color: CURRENT_COLOR }}>{bridge.toSymbol}</b>
        </span>
        <span className="conn-bridge-meta small muted">{bridgeSummary(bridge)}</span>
      </header>
      <VoiceLeadingViz
        lines={bridge.voiceLines}
        fromLabel={bridge.fromSymbol}
        toLabel={bridge.toSymbol}
        spell={spell}
        color="#c4b0ff"
      />
      <div className="conn-bridge-foot">
        {bridge.melodyBridge && (
          <div className="conn-bridge-mel">
            <span className="conn-seq-label">Melody bridge</span>
            <StepChip step={bridge.melodyBridge} spell={spell} />
          </div>
        )}
        {bridge.bassBridge && (
          <div className="conn-bridge-mel">
            <span className="conn-seq-label">Bass bridge</span>
            <StepChip step={bridge.bassBridge} spell={spell} />
          </div>
        )}
        {!bridge.melodyBridge && bridge.linkHintMidi !== null && (
          <p className="small muted conn-hint">
            Glue tone hint: <b>{spell(bridge.linkHintMidi)}</b> sits under both chords
            {bridge.commonToneCount ? ' (shared colour)' : ' (arrival colour)'}.
          </p>
        )}
        {onHear && (
          <button
            type="button"
            className="pill"
            onClick={(e) => { e.stopPropagation(); onHear(); }}
            aria-label={`Hear voice leading ${bridge.fromSymbol} to ${bridge.toSymbol}`}
          >
            ▶ Hear move
          </button>
        )}
      </div>
    </article>
  );
}

export function ChordConnections({
  slots,
  keyInfo,
  kb,
  beats,
  spell,
  focusIndex = null,
  onFocusBar,
  onHearBridge,
}: Props): ReactNode {
  const [mode, setMode] = useState<ViewMode>('both');
  const conn = useMemo(
    () => analyzeConnections(slots, keyInfo, kb, beats),
    [slots, keyInfo.tonic.letter, keyInfo.tonic.acc, keyInfo.mode, kb, beats],
  );

  if (!conn.hasContent) return null;

  const showBetween = (mode === 'both' || mode === 'between') && conn.bridges.length > 0;
  const showWithin = (mode === 'both' || mode === 'within')
    && conn.bars.some((b) => b.melody.length || b.bass.length);

  if (!showBetween && !showWithin) return null;

  return (
    <section className="connections" aria-label="How notes connect chords">
      <header className="conn-head">
        <div>
          <h3>How notes connect</h3>
          <p className="muted small">
            Within a bar: the melody/bass sequence and steps. Between chords: each voice’s path
            (held · ½ step · whole · leap), plus any melody/bass bridge across the change.
          </p>
        </div>
        <div className="seg conn-mode" role="group" aria-label="Connection view">
          <button type="button" className={mode === 'both' ? 'on' : ''} onClick={() => setMode('both')}>Both</button>
          <button type="button" className={mode === 'between' ? 'on' : ''} onClick={() => setMode('between')} disabled={!conn.bridges.length}>Between</button>
          <button type="button" className={mode === 'within' ? 'on' : ''} onClick={() => setMode('within')} disabled={!conn.bars.some((b) => b.melody.length || b.bass.length)}>Within</button>
        </div>
      </header>

      {showBetween && (
        <div className="conn-bridges" role="list">
          {conn.bridges.map((b) => (
            <div key={`${b.fromIndex}-${b.toIndex}`} role="listitem">
              <BridgeCard
                bridge={b}
                spell={spell}
                focused={focusIndex === b.fromIndex || focusIndex === b.toIndex}
                onFocus={() => onFocusBar?.(b.toIndex)}
                onHear={onHearBridge ? () => onHearBridge(b) : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {showBetween && <VoiceLegend />}

      {showWithin && (
        <div className="conn-within" role="list">
          <h4 className="conn-subhead">Sequence within each bar</h4>
          {conn.bars
            .filter((b) => b.melody.length || b.bass.length)
            .map((b) => (
              <div
                key={b.slotIndex}
                role="listitem"
                onClick={() => onFocusBar?.(b.slotIndex)}
                style={{ cursor: onFocusBar ? 'pointer' : undefined }}
              >
                <WithinBar bar={b} spell={spell} on={focusIndex === b.slotIndex} />
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
