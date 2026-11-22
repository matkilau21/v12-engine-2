/**
 * Procedural Web Audio 6.5L 60-degree V12 Acoustic Synthesizer.
 * Models the iconic 6th-order firing fundamental (6 firing pulses per revolution),
 * 3rd-order bank resonance, 12th-order intake induction howl, and mechanical valvetrain hiss.
 */
export class V12AcousticEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private osc6th: OscillatorNode | null = null;
  private osc3rd: OscillatorNode | null = null;
  private osc12th: OscillatorNode | null = null;
  private filterExhaust: BiquadFilterNode | null = null;
  private filterIntake: BiquadFilterNode | null = null;
  private intakeGain: GainNode | null = null;
  private isEnabled = false;

  public async setEnabled(enabled: boolean): Promise<boolean> {
    this.isEnabled = enabled;
    if (enabled) {
      if (!this.ctx) {
        this.initAudioGraph();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.08);
      }
      return true;
    } else {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.06);
      }
      return false;
    }
  }

  private initAudioGraph() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;

    // Warm soft-clipping waveshaper for rich metallic exhaust overtones
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = Math.tanh(x * 2.4);
    }
    shaper.curve = curve;

    const filterExhaust = ctx.createBiquadFilter();
    filterExhaust.type = 'lowpass';
    filterExhaust.frequency.value = 420;
    filterExhaust.Q.value = 2.6;

    const filterIntake = ctx.createBiquadFilter();
    filterIntake.type = 'bandpass';
    filterIntake.frequency.value = 950;
    filterIntake.Q.value = 3.2;

    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0.16;

    // 6th-order primary V12 firing harmonic (sawtooth)
    const osc6th = ctx.createOscillator();
    osc6th.type = 'sawtooth';
    osc6th.frequency.value = 95;
    const gain6 = ctx.createGain();
    gain6.gain.value = 0.55;

    // 3rd-order single-bank burble & low-end weight (triangle)
    const osc3rd = ctx.createOscillator();
    osc3rd.type = 'triangle';
    osc3rd.frequency.value = 47.5;
    const gain3 = ctx.createGain();
    gain3.gain.value = 0.5;

    // 12th-order high-RPM F1 V12 shriek & intake induction resonance
    const osc12th = ctx.createOscillator();
    osc12th.type = 'sawtooth';
    osc12th.frequency.value = 190;

    osc6th.connect(gain6);
    gain6.connect(filterExhaust);

    osc3rd.connect(gain3);
    gain3.connect(filterExhaust);

    osc12th.connect(filterIntake);
    filterIntake.connect(intakeGain);
    intakeGain.connect(shaper);

    filterExhaust.connect(shaper);
    shaper.connect(master);
    master.connect(ctx.destination);

    osc6th.start();
    osc3rd.start();
    osc12th.start();

    this.masterGain = master;
    this.osc6th = osc6th;
    this.osc3rd = osc3rd;
    this.osc12th = osc12th;
    this.filterExhaust = filterExhaust;
    this.filterIntake = filterIntake;
    this.intakeGain = intakeGain;
  }

  public update(rpm: number, isRunning: boolean) {
    if (!this.ctx || !this.isEnabled || !this.osc6th || !this.osc3rd || !this.osc12th) return;

    const now = this.ctx.currentTime;
    if (!isRunning || rpm < 40) {
      this.masterGain?.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }

    // 60-degree V12 fires 6 times per revolution -> f6 = (RPM / 60) * 6 = RPM / 10 Hz
    const f6 = Math.max(28, rpm / 10);
    const f3 = f6 * 0.5;
    const f12 = f6 * 2.0;

    const norm = Math.min(rpm / 9500, 1);

    this.osc6th.frequency.setTargetAtTime(f6, now, 0.03);
    this.osc3rd.frequency.setTargetAtTime(f3, now, 0.03);
    this.osc12th.frequency.setTargetAtTime(f12, now, 0.03);

    // Exhaust filter opens dramatically as RPM climbs toward 9,500 RPM shriek
    this.filterExhaust?.frequency.setTargetAtTime(240 + Math.pow(norm, 1.35) * 2600, now, 0.04);
    this.filterIntake?.frequency.setTargetAtTime(520 + norm * 2900, now, 0.04);
    this.intakeGain?.gain.setTargetAtTime(0.08 + Math.pow(norm, 1.8) * 0.42, now, 0.05);
    this.masterGain?.gain.setTargetAtTime(0.14 + norm * 0.14, now, 0.06);
  }

  public dispose() {
    try {
      this.osc6th?.stop();
      this.osc3rd?.stop();
      this.osc12th?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore audio disposal edge cases
    }
    this.ctx = null;
  }
}
