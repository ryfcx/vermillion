// Tiny original chiptune synthesizer. It is silent until called by a user gesture.
let context = null;
let volume = 0.6;
let muted = false;
let musicEnabled = false;
let musicTimer = null;
let musicStep = 0;
const musicNotes = [261.63, 0, 329.63, 392, 0, 329.63, 293.66, 0, 220, 0, 261.63, 329.63, 0, 293.66, 261.63, 0];

const PATTERNS = {
  type: { notes: [880], wave: 'square', duration: 0.035, gain: 0.035 },
  submit: { notes: [440, 659], wave: 'square', duration: 0.12, gain: 0.12 },
  unknown: { notes: [220, 196], wave: 'triangle', duration: 0.16, gain: 0.13 },
  common: { notes: [330, 392], wave: 'square', duration: 0.13, gain: 0.12 },
  uncommon: { notes: [392, 523, 659], wave: 'square', duration: 0.17, gain: 0.13 },
  rare: { notes: [523, 659, 784], wave: 'square', duration: 0.2, gain: 0.14 },
  mythic: { notes: [523, 659, 784, 1047], wave: 'square', duration: 0.28, gain: 0.14 },
  timeout: { notes: [392, 330, 262], wave: 'triangle', duration: 0.3, gain: 0.13 },
  tick: { notes: [660], wave: 'square', duration: 0.025, gain: 0.035 },
  next: { notes: [392, 523], wave: 'square', duration: 0.12, gain: 0.11 },
  finish: { notes: [392, 494, 587, 784], wave: 'square', duration: 0.38, gain: 0.13 },
  click: { notes: [560], wave: 'square', duration: 0.035, gain: 0.04 },
  duelWin: { notes: [392, 523, 659, 784, 988], wave: 'square', duration: 0.42, gain: 0.14 },
  duelLose: { notes: [330, 294, 262, 220], wave: 'triangle', duration: 0.35, gain: 0.12 },
  gate: { notes: [523], wave: 'square', duration: 0.09, gain: 0.1 },
  'land-none': { notes: [196, 147], wave: 'triangle', duration: 0.16, gain: 0.09 },
  'land-common': { notes: [330, 392], wave: 'square', duration: 0.13, gain: 0.1 },
  'land-uncommon': { notes: [392, 494, 587], wave: 'square', duration: 0.18, gain: 0.11 },
  'land-rare': { notes: [494, 587, 740], wave: 'square', duration: 0.21, gain: 0.12 },
  'land-mythic': { notes: [587, 740, 880, 1175], wave: 'square', duration: 0.3, gain: 0.13 },
  bloop: { notes: [196, 130], wave: 'triangle', duration: 0.2, gain: 0.09 }
};

function getContext() {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  try { context ||= new Audio(); return context; } catch { return null; }
}

function tone(frequency, startAt, duration, wave, gainLevel, target = null) {
  const ctx = getContext();
  if (!ctx || muted || volume <= 0) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainLevel * volume), startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(target || ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* audio is an enhancement; unsupported contexts should never break play */ }
}

function sweep(from, to, duration, wave, gainLevel) {
  const ctx = getContext();
  if (!ctx || muted || volume <= 0) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainLevel * volume), ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime); oscillator.stop(ctx.currentTime + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* audio is optional; an unsupported sweep should never interrupt play */ }
}

export function play(name, stepIndex = 0) {
  if (name === 'dive') {
    if (!muted) sweep(620, 92, 0.58, 'triangle', 0.12);
    return;
  }
  const pattern = PATTERNS[name];
  if (!pattern || muted) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const spacing = pattern.duration / pattern.notes.length;
  const gateStep = name === 'gate' ? Math.max(0, Math.min(3, Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0)) : 0;
  const rise = name === 'gate' ? 2 ** (gateStep * 2 / 12) : 1;
  pattern.notes.forEach((frequency, index) => tone(frequency * rise, ctx.currentTime + index * spacing, spacing * 1.35, pattern.wave, pattern.gain));
}

export function setVolume(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) volume = Math.max(0, Math.min(1, parsed));
}

export function setMuted(value) { muted = Boolean(value); }

function scheduleMusicNote() {
  const ctx = getContext();
  if (!ctx || !musicEnabled || muted) return;
  const frequency = musicNotes[musicStep % musicNotes.length];
  musicStep += 1;
  if (frequency) tone(frequency, ctx.currentTime, 0.18, 'triangle', 0.022);
}

export function music(on) {
  musicEnabled = Boolean(on);
  if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
  if (!musicEnabled) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  scheduleMusicNote();
  musicTimer = setInterval(scheduleMusicNote, 210);
}
