// Local QR encoding for share links (no network): wraps qrcode-generator (MIT) and turns the module
// grid into one compact SVG path. Lives in the lazy QR chunk.
import qrcode from 'qrcode-generator';

export interface QrMatrix { size: number; ecc: 'M' | 'L'; dark: boolean[][] }

/** Encode text; prefers error-correction M (sturdier on screens), falls back to L for long links. Null if it won't fit. */
export function makeQr(text: string): QrMatrix | null {
  for (const ecc of ['M', 'L'] as const) {
    try {
      const q = qrcode(0, ecc);
      q.addData(text, 'Byte');
      q.make();
      const size = q.getModuleCount();
      const dark = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => q.isDark(r, c)));
      return { size, ecc, dark };
    } catch { /* too long for this level */ }
  }
  return null;
}

/** SVG path (unit modules, offset by the quiet zone) with horizontal runs merged. */
export function qrPath(m: QrMatrix, quiet = 4): string {
  let d = '';
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark[r]![c]) { c++; continue; }
      let e = c;
      while (e < m.size && m.dark[r]![e]) e++;
      d += `M${c + quiet} ${r + quiet}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }
  return d;
}
