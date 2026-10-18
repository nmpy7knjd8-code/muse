// 16-bit PCM WAV encoder (framework-free: takes anything shaped like an AudioBuffer).
export interface PcmSource { numberOfChannels: number; length: number; sampleRate: number; getChannelData(c: number): Float32Array }

export function encodeWav(buf: PcmSource): Uint8Array {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c]![i]!)); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Uint8Array(out.buffer);
}

/** Download name for an export, e.g. "muse-C-major-Am-F-G.wav". */
export function exportFileName(keyLabel: string, symbols: string[], ext: string): string {
  const slug = (s: string) => s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/#/g, 's').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const body = [slug(keyLabel), ...symbols.slice(0, 4).map(slug)].filter(Boolean).join('-');
  return `muse-${body || 'sketch'}.${ext}`;
}
