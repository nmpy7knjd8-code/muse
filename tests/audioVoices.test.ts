import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/ui/audio';
import { INSTRUMENT_IDS } from '../src/core';

/** Minimal Web Audio stand-in: every node/param method is a no-op; we only check voice bookkeeping. */
function fakeNode(): any {
  const param = () => new Proxy({ value: 0 }, { get: (t: any, k) => (k in t ? t[k] : () => {}) });
  const params: Record<string, unknown> = {};
  return new Proxy({}, {
    get: (t: any, k: string | symbol) => {
      if (k in t) return t[k];
      if (k === 'connect') return (x: unknown) => x;
      if (typeof k === 'string' && /^(gain|frequency|detune|Q|pan|playbackRate|delayTime)$/.test(k)) return (params[k] ??= param());
      return () => {};
    },
  });
}
function engine(now = 10) {
  const eng = new AudioEngine();
  const ctx: any = new Proxy({ currentTime: now, sampleRate: 44100, state: 'running' }, {
    get: (t: any, k: string | symbol) => (k in t ? t[k] : () => fakeNode()),
  });
  const e = eng as any;
  e.ctx = ctx; e.input = fakeNode();
  for (const id of INSTRUMENT_IDS) e.load.set(id, { state: 'error', progress: 0 }); // no sample fetches
  return { eng, ctx };
}

describe('audition vs transport voices (audit #2)', () => {
  it('previews never silence queued ▶ Play / Loop voices', () => {
    const { eng } = engine();
    eng.playNotes([60, 64, 67], { at: 0.5, origin: 10 }); // transport (has origin)
    eng.playNotes([62, 65, 69], { at: 4, origin: 10 }); // queued later in the loop
    eng.playNotes([57, 60, 64]); // a tap / audition
    expect(eng.voiceCount('transport')).toBe(6);
    expect(eng.voiceCount('preview')).toBe(3);
    eng.stopPreview();
    expect(eng.voiceCount('transport')).toBe(6);
    expect(eng.voiceCount('preview')).toBe(0);
  });
  it('stopTransport(from) cancels only voices that have not started yet', () => {
    const { eng, ctx } = engine(10);
    eng.playNotes([60], { at: 0, origin: 10 }); // sounding now
    eng.playNotes([62], { at: 2, origin: 10 }); // future
    eng.playNotes([64]); // preview
    ctx.currentTime = 11;
    eng.stopTransport(11.02);
    expect(eng.voiceCount('transport')).toBe(1); // the sounding one rings out
    expect(eng.voiceCount('preview')).toBe(1);
  });
  it('stopAll still clears everything (Stop / Clear)', () => {
    const { eng } = engine();
    eng.playNotes([60], { at: 1, origin: 10 });
    eng.playNotes([64]);
    eng.stopAll();
    expect(eng.voiceCount()).toBe(0);
  });
});

describe('sample load retry backoff (audit #9)', () => {
  it('does not refetch an instrument right after a failed load', async () => {
    const { eng } = engine();
    const e = eng as any;
    let fetches = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { fetches++; throw new Error('offline'); }) as typeof fetch;
    try {
      e.load.delete('rhodes');
      await eng.ensureLoaded('rhodes');
      const first = fetches;
      expect(first).toBeGreaterThan(0);
      expect(eng.loadState('rhodes').state).toBe('error');
      for (let i = 0; i < 20; i++) await eng.ensureLoaded('rhodes');
      expect(fetches).toBe(first);
    } finally { globalThis.fetch = realFetch; }
  });
});
