// Mood ↔ chord reference: every core mood tag, which chord moves / modes carry it,
// and how chord qualities fall back when no KB move matches.
import { useMemo, useState, type ReactNode } from 'react';
import type { TheoryKB } from '../core';
import { MoodLexicon, QUALITIES, triadClass, type QualityId } from '../core';

interface Props {
  kb: TheoryKB;
  lex: MoodLexicon;
}

/** Same triad→mood fallback Muse uses when a chord has no theory-KB evidence. */
const QUALITY_FALLBACK: Record<string, { mood: string; why: string }> = {
  maj: { mood: 'bright', why: 'Major third + perfect fifth — open, stable colour.' },
  min: { mood: 'melancholy', why: 'Minor third darkens the triad without leaving home.' },
  dim: { mood: 'tense', why: 'Diminished fifth pulls — needs somewhere to go.' },
  aug: { mood: 'uncanny', why: 'Augmented fifth is symmetrical and unsettled.' },
  sus: { mood: 'floating', why: 'No third — neither major nor minor; suspended.' },
  power: { mood: 'earthy', why: 'Root + fifth only — plain, grounded, rock/folk.' },
};

type View = 'moods' | 'moves' | 'qualities';

function Axis({ label, value, min = 0, max = 1 }: { label: string; value?: number; min?: number; max?: number }) {
  if (value == null || !Number.isFinite(value)) return null;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <div className="mref-axis" title={`${label} ${value.toFixed(2)}`}>
      <span>{label}</span>
      <i><b style={{ width: `${Math.round(t * 100)}%` }} /></i>
    </div>
  );
}

export function MoodChordRef({ kb, lex }: Props): ReactNode {
  const [view, setView] = useState<View>('moods');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();

  const byMood = useMemo(() => {
    const moves = new Map<string, typeof kb.chordMoves>();
    const modes = new Map<string, typeof kb.modes>();
    const progs = new Map<string, typeof kb.progressions>();
    for (const m of kb.chordMoves) {
      for (const id of m.moods) {
        const k = lex.canonical(id);
        const list = moves.get(k) ?? [];
        list.push(m);
        moves.set(k, list);
      }
    }
    for (const m of kb.modes) {
      for (const id of m.moods) {
        const k = lex.canonical(id);
        const list = modes.get(k) ?? [];
        list.push(m);
        modes.set(k, list);
      }
    }
    for (const p of kb.progressions) {
      for (const id of p.moods) {
        const k = lex.canonical(id);
        const list = progs.get(k) ?? [];
        list.push(p);
        progs.set(k, list);
      }
    }
    return { moves, modes, progs };
  }, [kb, lex]);

  const qualityMoods = useMemo(() => {
    const acc = new Map<QualityId, Map<string, number>>();
    for (const m of kb.chordMoves) {
      const qid = m.to.quality;
      let bag = acc.get(qid);
      if (!bag) acc.set(qid, (bag = new Map()));
      m.moods.forEach((id, i) => {
        const k = lex.canonical(id);
        bag!.set(k, (bag!.get(k) ?? 0) + (1 - i * 0.12));
      });
    }
    return acc;
  }, [kb, lex]);

  const moods = useMemo(() => {
    const ids = kb.moodVocabulary.length ? kb.moodVocabulary.map((m) => m.id) : lex.ids();
    return ids
      .map((id) => {
        const def = kb.moodVocabulary.find((m) => m.id === id) ?? lex.get(id);
        const label = lex.label(id);
        const moves = byMood.moves.get(lex.canonical(id)) ?? [];
        const modes = byMood.modes.get(lex.canonical(id)) ?? [];
        const progs = byMood.progs.get(lex.canonical(id)) ?? [];
        return { id: lex.canonical(id), def, label, moves, modes, progs };
      })
      .filter((m) => {
        if (!needle) return true;
        const blob = [
          m.id, m.label, m.def?.description ?? '', ...(m.def?.synonyms ?? []),
          ...m.moves.map((x) => `${x.name} ${x.description}`),
          ...m.modes.map((x) => x.name),
        ].join(' ').toLowerCase();
        return blob.includes(needle);
      });
  }, [kb, lex, byMood, needle]);

  const moves = useMemo(() => {
    return kb.chordMoves.filter((m) => {
      if (!needle) return true;
      const blob = `${m.name} ${m.description} ${m.moods.join(' ')} ${m.from?.roman ?? ''} ${m.to.roman}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [kb.chordMoves, needle]);

  return (
    <div className="mref">
      <header className="mref-hero">
        <h2>Moods &amp; chords</h2>
        <p className="muted">
          Every mood tag Muse uses, and the chord moves / qualities that carry it.
          Suggestions are ranked by fit — mood is a label on the result, not the sort order.
        </p>
      </header>

      <div className="mref-seg" role="tablist" aria-label="Reference view">
        {([
          ['moods', 'By mood'],
          ['moves', 'By chord move'],
          ['qualities', 'Qualities'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      <input
        className="mref-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={view === 'moods' ? 'Search moods, moves…' : view === 'moves' ? 'Search chord moves…' : 'Search qualities…'}
        aria-label="Search reference"
      />

      {view === 'moods' && (
        <div className="mref-list" role="list">
          {moods.map((m) => {
            const color = lex.color(m.id);
            return (
              <article key={m.id} className="mref-card" role="listitem" style={{ borderLeftColor: color }}>
                <div className="mref-card-top">
                  <span className="mref-pill" style={{ background: color }}>{m.label}</span>
                  <span className="muted small mono">{m.id}</span>
                </div>
                {m.def?.description && <p className="mref-desc">{m.def.description}</p>}
                <div className="mref-axes">
                  <Axis label="valence" value={m.def?.valence} min={-1} max={1} />
                  <Axis label="arousal" value={m.def?.arousal} />
                  <Axis label="bright" value={m.def?.brightness} min={-1} max={1} />
                  <Axis label="tension" value={m.def?.tension} />
                </div>
                {!!m.moves.length && (
                  <div className="mref-block">
                    <h4>Chord moves</h4>
                    <ul>
                      {m.moves.slice(0, 8).map((mv) => (
                        <li key={mv.id}>
                          <b>{mv.name}</b>
                          <span className="muted"> · {mv.from ? `${mv.from.roman} → ${mv.to.roman}` : mv.to.roman}</span>
                          <div className="small muted">{mv.description}</div>
                        </li>
                      ))}
                      {m.moves.length > 8 && <li className="muted small">+{m.moves.length - 8} more</li>}
                    </ul>
                  </div>
                )}
                {!!m.modes.length && (
                  <div className="mref-block">
                    <h4>Modes</h4>
                    <div className="tags">
                      {m.modes.map((md) => (
                        <span key={md.id} className="tag soft" title={md.description}>{md.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {!!m.progs.length && (
                  <div className="mref-block">
                    <h4>Progressions</h4>
                    <ul>
                      {m.progs.slice(0, 4).map((p) => (
                        <li key={p.id}><b>{p.name}</b><span className="muted"> — {p.description}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {!m.moves.length && !m.modes.length && !m.progs.length && (
                  <p className="small muted">No chord moves tagged yet — still used as a colour label on suggestions.</p>
                )}
              </article>
            );
          })}
          {!moods.length && <p className="muted center">No moods match.</p>}
        </div>
      )}

      {view === 'moves' && (
        <div className="mref-list" role="list">
          {moves.map((m) => (
            <article key={m.id} className="mref-card" role="listitem">
              <div className="mref-card-top">
                <b>{m.name}</b>
                <span className="muted small">{m.from ? `${m.from.roman} → ${m.to.roman}` : m.to.roman}</span>
              </div>
              <p className="mref-desc">{m.description}</p>
              <div className="tags">
                {m.moods.map((id) => (
                  <span key={id} className="tag" style={{ background: lex.color(id) }}>{lex.label(id).toLowerCase()}</span>
                ))}
              </div>
              <p className="small muted">{m.category} · {m.keyMode} · {m.consensus} consensus</p>
            </article>
          ))}
          {!moves.length && <p className="muted center">No moves match.</p>}
        </div>
      )}

      {view === 'qualities' && (
        <div className="mref-list" role="list">
          <p className="small muted mref-note">
            When Muse has no theory-KB move for a chord, it falls back to the triad class mood below.
            Tagged moods from matching moves still win when evidence exists.
          </p>
          {QUALITIES.filter((qd) => {
            if (!needle) return true;
            return `${qd.id} ${qd.name} ${qd.suffix}`.toLowerCase().includes(needle);
          }).map((qd) => {
            const fb = QUALITY_FALLBACK[triadClass(qd.id)];
            const fromMoves = [...(qualityMoods.get(qd.id)?.entries() ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 5);
            return (
              <article key={qd.id} className="mref-card" role="listitem" style={{ borderLeftColor: fb ? lex.color(fb.mood) : undefined }}>
                <div className="mref-card-top">
                  <b>{qd.name}</b>
                  <span className="muted small mono">{qd.suffix ? `C${qd.suffix}` : 'C'} · {qd.id}</span>
                </div>
                {fb && (
                  <p className="mref-desc">
                    Fallback mood: <span className="tag" style={{ background: lex.color(fb.mood) }}>{lex.label(fb.mood).toLowerCase()}</span>
                    {' '}{fb.why}
                  </p>
                )}
                {!!fromMoves.length && (
                  <div className="mref-block">
                    <h4>Often tagged (from chord moves)</h4>
                    <div className="tags">
                      {fromMoves.map(([id]) => (
                        <span key={id} className="tag" style={{ background: lex.color(id) }}>{lex.label(id).toLowerCase()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
