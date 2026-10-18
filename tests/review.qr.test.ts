import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { makeQr, qrPath, type QrMatrix } from '../src/ui/qr';
import { parseChord, shareUrl } from '../src/core';

/** Rasterise like the SVG (white quiet zone, black modules) and decode with an independent reader. */
function decode(m: QrMatrix, scale = 4, quiet = 4): string | null {
  const n = (m.size + quiet * 2) * scale;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark[r]![c]) {
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + quiet) * scale + y) * n + (c + quiet) * scale + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return jsQR(px, n, n)?.data ?? null;
}

describe('QR share codes (review #13)', () => {
  it('round-trips a real share link through an independent decoder', () => {
    const C = (s: string) => parseChord(s)!;
    const url = shareUrl('https://nmpy7knjd8-code.github.io/muse/', { tonic: 'C', mode: 'major', bpm: 120, timeSig: { num: 4, den: 4 }, slots: ['C', 'G', 'Am', 'F'].map((s) => ({ chord: C(s), notes: [] })) });
    const m = makeQr(url)!;
    expect(m.ecc).toBe('M');
    expect(decode(m)).toBe(url);
  });
  it('falls back to lower error correction for long links and gives up past the limit', () => {
    const long = 'https://x.dev/muse/#s=' + 'A'.repeat(2600);
    const m = makeQr(long)!;
    expect(m.ecc).toBe('L');
    expect(decode(m, 3)).toBe(long);
    expect(makeQr('https://x.dev/#s=' + 'A'.repeat(4000))).toBeNull();
  });
  it('builds a compact path with merged runs covering exactly the dark modules', () => {
    const m = makeQr('hello muse')!;
    const d = qrPath(m);
    const area = [...d.matchAll(/h(\d+)/g)].reduce((s, x) => s + Number(x[1]), 0);
    expect(area).toBe(m.dark.flat().filter(Boolean).length);
    expect(d.startsWith('M4 4h7')).toBe(true); // top-left finder row
  });
});
