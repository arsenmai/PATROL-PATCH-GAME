/** Procedural WebAudio bleeps. No audio files, no dependencies. */
let ctx: AudioContext | null = null;
let muted = false;

function tone(freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  } catch {
    // Audio is a nice-to-have; never let it break the game.
  }
}

export const sfx = {
  step: () => tone(180, 0.05, 'triangle', 0.035),
  blocked: () => tone(90, 0.08, 'square', 0.03),
  click: () => tone(660, 0.05, 'sine', 0.04),
  patch: () => [520, 780, 1040].forEach((f, i) => tone(f, 0.12, 'sine', 0.05, undefined, i * 0.07)),
  detected: () => tone(880, 0.22, 'sawtooth', 0.05, 440),
  caught: () => tone(300, 0.6, 'sawtooth', 0.07, 60),
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.06, undefined, i * 0.09)),
  toggleMute: (): boolean => (muted = !muted),
};
