import { describe, expect, it } from 'vitest';
import { LruMemo } from '../src/core/memo';
import { voiceLeading, voiceLeadingCost, tensionModel } from '../src/core';

describe('engine memo caches (audit #12)', () => {
  it('LruMemo computes once per key and evicts the oldest', () => {
    const m = new LruMemo<number>(2);
    let calls = 0;
    const f = (k: string) => m.get(k, () => { calls++; return k.length; });
    f('a'); f('a'); f('bb'); f('a'); f('ccc'); // evicts 'bb' (least recent)
    expect(calls).toBe(3);
    f('a'); expect(calls).toBe(3);
    f('bb'); expect(calls).toBe(4);
    expect(m.size).toBe(2);
  });
  it('memoised results equal the raw computation', () => {
    const a = [60, 64, 67], b = [59, 62, 67, 71];
    const raw = voiceLeading(a, b).reduce((s, l) => s + Math.abs(l.delta), 0);
    expect(voiceLeadingCost(a, b)).toBe(raw);
    expect(voiceLeadingCost(a, b)).toBe(raw);
    const r1 = tensionModel.hkRoughness([60, 61, 67]);
    expect(tensionModel.hkRoughness([60, 61, 67])).toBe(r1);
    expect(tensionModel.hkRoughness([60, 61, 67], { harmonics: 6 })).not.toBe(r1);
  });
});
