// Idea 9 — "Your taste": what the thumbs on suggestion cards have taught Muse, with an on/off and reset.
import { describeTaste, QUALITY_BY_ID, type QualityId } from '../../core';
import { ThumbIcon } from '../icons';
import { Meter, ToolIntro } from './common';
import type { ToolProps } from './types';

const lean = (v: number) => Math.max(0, Math.min(1, 0.5 + Math.tanh(v / 3) / 2));

export default function TasteTool(p: ToolProps) {
  const t = p.taste;
  const d = describeTaste(t, (id) => p.lex.label(id));
  const top = (rec: Record<string, number>, n = 5) => Object.entries(rec).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n);
  return (
    <div className="tool taste-tool">
      <ToolIntro>Tap <ThumbIcon size={13} /> or <ThumbIcon size={13} down /> on the selected suggestion card (or in Details). Muse learns which chord colours, functions and moods you reach for and nudges Best fit toward them. Everything stays on this device.</ToolIntro>
      <label className="tool-check"><input type="checkbox" checked={p.tasteOn} onChange={(e) => p.setTasteOn(e.target.checked)} /> Use my taste when ranking Best fit</label>
      {!t.votes ? (
        <div className="tool-card"><p className="tool-note">No votes yet. Pick a suggestion card and give it a thumb — a handful of votes is enough to start.</p></div>
      ) : (
        <>
          <div className="tool-card">
            <div className="ear-stats"><span>Votes <b>{t.votes}</b></span><span>Liked <b>{t.up}</b></span><span>Passed <b>{t.votes - t.up}</b></span></div>
            {d.likes.length > 0 && <p className="taste-sum"><b className="taste-like">You lean toward</b> {d.likes.join(', ')}.</p>}
            {d.dislikes.length > 0 && <p className="taste-sum"><b className="taste-pass">You tend to pass on</b> {d.dislikes.join(', ')}.</p>}
            {!d.likes.length && !d.dislikes.length && <p className="tool-note">A few more votes and patterns will show up here.</p>}
          </div>
          {Object.keys(t.mood).length > 0 && (
            <div className="tool-card">
              <h4>Moods</h4>
              {top(t.mood).map(([id, v]) => <Meter key={id} value={lean(v)} label={p.lex.label(id)} left="less" right="more" color={p.lex.color(id)} />)}
            </div>
          )}
          {Object.keys(t.quality).length > 0 && (
            <div className="tool-card">
              <h4>Chord colours</h4>
              {top(t.quality).map(([q, v]) => <Meter key={q} value={lean(v)} label={QUALITY_BY_ID[q as QualityId]?.name ?? q} left="less" right="more" />)}
            </div>
          )}
          <button type="button" className="pill taste-reset" onClick={() => { if (window.confirm('Forget everything Muse learned about your taste?')) { p.resetTaste(); p.flash('Taste reset'); } }}>Reset my taste</button>
        </>
      )}
    </div>
  );
}
