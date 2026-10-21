// Your progress (idea 24): a plain-language theory tree built from what you've done in Muse.
import { useMemo } from 'react';
import { EMPTY_GYM, parseEarStats, parseGym, progressMap, type ProgressNode } from '../../core';
import { Meter, ToolIntro } from './common';
import type { ToolId, ToolProps } from './types';

const list = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const TAB_KEY: Record<string, string> = { gym: 'muse.gym.game', lessons: 'muse.lessons.tab' };

export default function ProgressTool(p: ToolProps) {
  const map = useMemo(() => {
    let gym = EMPTY_GYM; let ear = 0;
    try { gym = parseGym(localStorage.getItem('muse.gym')); ear = parseEarStats(localStorage.getItem('muse.ear')).asked; } catch { /* */ }
    return progressMap({ concepts: list('muse.concepts'), missions: list('muse.missions'), gym, earRounds: ear, modesUsed: list('muse.modesUsed') });
  }, [p.chords, p.k]);
  const go = (n: ProgressNode) => {
    if (n.tab && TAB_KEY[n.tool]) { try { localStorage.setItem(TAB_KEY[n.tool]!, n.tab); } catch { /* */ } }
    p.openTool(n.tool as ToolId);
  };
  const nameOf = Object.fromEntries(map.branches.flatMap((b) => b.nodes).map((n) => [n.id, n.name]));
  const done = map.branches.flatMap((b) => b.nodes).filter((n) => n.state === 'done').length;
  return (
    <div className="tool progress-tool">
      <ToolIntro>What you’ve learned by doing — it fills in as you write, play the ear games and try missions. Theory names appear once you’ve done the thing.</ToolIntro>
      {map.next && (
        <div className="tool-card progress-next">
          <span className="small muted">Next up</span>
          <b>{map.next.name}</b>
          <span className="small">{map.next.how}</span>
          <button type="button" className="add" onClick={() => go(map.next!)}>Go</button>
        </div>
      )}
      {done === 0 && <p className="small muted">Nothing filled in yet — that’s the fun part.</p>}
      {map.branches.map((b) => (
        <div key={b.id} className="tool-card progress-branch">
          <Meter value={b.share} label={b.name} left="starting" right="explored" />
          <ul className="progress-nodes">
            {b.nodes.map((n) => (
              <li key={n.id} className={'progress-node ' + n.state}>
                <span className="progress-dot" aria-hidden>{n.state === 'done' ? '★' : n.state === 'next' ? '●' : '○'}</span>
                <span className="progress-text">
                  <b>{n.name}</b>
                  <small>{n.state === 'done' ? (n.theory ? `You did it — the theory name is “${n.theory}”.` : 'Done.') : n.state === 'next' ? n.how : `Unlocks after “${n.needs.map((x) => nameOf[x]).join('” and “')}”.`}</small>
                </span>
                {n.state === 'next' && <button type="button" className="pill" onClick={() => go(n)} aria-label={`Go: ${n.name}`}>Go</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
