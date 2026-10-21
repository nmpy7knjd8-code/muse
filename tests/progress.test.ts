import { describe, expect, it } from 'vitest';
import { EMPTY_GYM, PROGRESS_NODE_COUNT, gymAnswer, progressMap, type ProgressStores } from '../src/core';
const base: ProgressStores = { concepts: [], missions: [], gym: EMPTY_GYM, earRounds: 0, modesUsed: [] };

describe('progress map (#24)', () => {
  it('starts with roots open and dependants later', () => {
    const m = progressMap(base);
    const all = m.branches.flatMap((b) => b.nodes);
    expect(all).toHaveLength(PROGRESS_NODE_COUNT);
    expect(all.find((n) => n.id === 'h-home')!.state).toBe('next');
    expect(all.find((n) => n.id === 'h-swap')!.state).toBe('later');
    expect(all.every((n) => n.state !== 'done')).toBe(true);
    expect(m.next).not.toBeNull();
    for (const b of m.branches) expect(b.share).toBe(0);
  });
  it('doing things completes nodes and unlocks prerequisites', () => {
    let gym = EMPTY_GYM;
    for (const l of ['1', '3', '5']) for (let i = 0; i < 3; i++) gym = gymAnswer(gym, 'degree-s135', `degree:major:${l}`, true);
    const m = progressMap({ ...base, gym, concepts: ['authentic'], modesUsed: ['major'], missions: ['loop4'] });
    const all = Object.fromEntries(m.branches.flatMap((b) => b.nodes).map((n) => [n.id, n.state]));
    expect(all['h-home']).toBe('done');
    expect(all['h-swap']).toBe('next');
    expect(all['b-finish']).toBe('done');
    expect(all['b-fake']).toBe('next');
    expect(all['c-mixo']).toBe('next');
    expect(all['w-home2']).toBe('next');
    expect(m.branches.find((b) => b.id === 'hearing')!.share).toBeGreaterThan(0);
  });
  it('next-up comes from the least advanced branch and is actionable', () => {
    const m = progressMap({ ...base, concepts: ['authentic', 'half', 'seventh', 'sus'] });
    expect(m.next!.state).toBe('next');
    expect(m.next!.tool).toBeTruthy();
    expect(m.branches.find((b) => b.nodes.includes(m.next!))!.id).not.toBe('blocks');
  });
});
