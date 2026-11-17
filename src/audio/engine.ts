import type { GameSettings } from "@/config/gameSettings";
import type { CollisionSeverity } from "@/sim/types";
import { engineLevel, impactLevel, motorDetune, rotorHz } from "./model";

type AudioSettings = GameSettings["audio"];

/**
 * Web Audio drone sound: four detuned sawtooth rotors plus band-passed noise (prop wash), and noise/thump impacts.
 * Procedural placeholder audio, no samples. Browsers only allow audio after a user gesture, so `start()` must be
 * called from an input event; until then `update` is a no-op.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private rotors: { osc: OscillatorNode; gain: GainNode }[] = [];
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private level = 0;
  private freqs = [0, 0, 0, 0];

  constructor(private settings: AudioSettings) {}

  get state(): string {
    return this.ctx?.state ?? "off";
  }

  /** Create/resume the audio graph. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.engineBus = ctx.createGain();
      this.effectsBus = ctx.createGain();
      this.engineBus.connect(this.master);
      this.effectsBus.connect(this.master);
      this.master.connect(ctx.destination);

      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = rotorHz(0) * motorDetune(i);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1800;
        osc.connect(lp).connect(gain).connect(this.engineBus);
        osc.start();
        this.rotors.push({ osc, gain });
      }
      // 1 s of looped white noise for prop wash and impacts.
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      this.noiseFilter = ctx.createBiquadFilter();
      this.noiseFilter.type = "bandpass";
      this.noiseFilter.frequency.value = 800;
      this.noiseGain = ctx.createGain();
      this.noiseGain.gain.value = 0;
      src.connect(this.noiseFilter).connect(this.noiseGain).connect(this.engineBus);
      src.start();
      this.applySettings();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setSettings(s: AudioSettings): void {
    this.settings = s;
    this.applySettings();
  }

  private applySettings(): void {
    if (!this.ctx || !this.master || !this.engineBus || !this.effectsBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, t, 0.03);
    this.engineBus.gain.setTargetAtTime(this.settings.engine, t, 0.03);
    this.effectsBus.gain.setTargetAtTime(this.settings.effects, t, 0.03);
  }

  /** Per-frame update from rotor speeds (0..1). `active` false silences the motors (paused, crashed). */
  update(motors: ArrayLike<number>, active: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    let mean = 0;
    for (let i = 0; i < 4; i++) mean += motors[i] ?? 0;
    mean /= 4;
    this.level = active ? engineLevel(mean) : 0;
    for (let i = 0; i < 4; i++) {
      const r = this.rotors[i];
      this.freqs[i] = rotorHz(motors[i] ?? 0) * motorDetune(i);
      r.osc.frequency.setTargetAtTime(this.freqs[i], t, 0.04);
      r.gain.gain.setTargetAtTime(this.level * 0.07, t, 0.05);
    }
    this.noiseGain?.gain.setTargetAtTime(this.level * 0.12, t, 0.08);
    this.noiseFilter?.frequency.setTargetAtTime(500 + 3500 * mean, t, 0.08);
  }

  playImpact(severity: CollisionSeverity): void {
    const ctx = this.ctx;
    const level = impactLevel(severity);
    if (!ctx || ctx.state !== "running" || !this.effectsBus || !this.noiseBuffer || level === 0) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700 + 2500 * level;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + 0.35 * level);
    src.connect(lp).connect(g).connect(this.effectsBus);
    src.start(t);
    src.stop(t + 0.7);
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(level * 0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    thump.connect(tg).connect(this.effectsBus);
    thump.start(t);
    thump.stop(t + 0.4);
  }

  /** Values for tests/diagnostics. */
  debug(): { state: string; level: number; freqs: number[]; master: number } {
    return { state: this.state, level: this.level, freqs: [...this.freqs], master: this.master?.gain.value ?? 0 };
  }

  dispose(): void {
    this.rotors.forEach((r) => r.osc.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.rotors = [];
  }
}
