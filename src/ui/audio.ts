// Tiny Web Audio synth. Must be unlocked from a user gesture (iOS Safari autoplay rules).

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

export class Synth {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private active: Array<{ osc: OscillatorNode[]; gain: GainNode }> = [];
  unlocked = false;

  /** Call synchronously inside a tap/click handler. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      // iOS 16.4+/17: play through the ringer/silent switch like a media app
      const nav = navigator as AudioSessionNav;
      try { if (nav.audioSession) nav.audioSession.type = 'playback'; } catch { /* ignore */ }
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3200;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.32;
      this.out.connect(filter).connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (!this.unlocked) {
      // a 1-sample silent buffer started inside the gesture fully unlocks older iOS versions
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      this.unlocked = true;
    }
  }

  private now() {
    return this.ctx ? this.ctx.currentTime + 0.02 : 0;
  }

  stopAll() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.active) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.03);
      v.osc.forEach((o) => o.stop(t + 0.2));
    }
    this.active = [];
  }

  private voice(midi: number, start: number, dur: number, vel = 0.8) {
    if (!this.ctx || !this.out) return;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.22 * vel, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.11 * vel, start + 0.35);
    g.gain.setValueAtTime(0.11 * vel, start + Math.max(0.36, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.45);
    const o1 = this.ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    o2.detune.value = 4;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.25;
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.out);
    o1.start(start);
    o2.start(start);
    o1.stop(start + dur + 0.5);
    o2.stop(start + dur + 0.5);
    const v = { osc: [o1, o2], gain: g };
    this.active.push(v);
    o1.onended = () => { this.active = this.active.filter((x) => x !== v); };
  }

  playNotes(midis: number[], opts: { at?: number; dur?: number; strum?: number; vel?: number } = {}) {
    if (!this.ctx) return;
    const t = (opts.at ?? 0) + this.now();
    midis.forEach((m, i) => this.voice(m, t + i * (opts.strum ?? 0.012), opts.dur ?? 1.1, opts.vel ?? 0.8));
  }

  /** Play a list of note-groups one after another. */
  playSequence(groups: number[][], step = 0.9, dur = 0.85) {
    if (!this.ctx) return;
    this.stopAll();
    groups.forEach((g, i) => this.playNotes(g, { at: i * step, dur }));
  }
}

export const synth = new Synth();
