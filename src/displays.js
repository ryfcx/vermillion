// Vermillion v2 — themed progress displays, plus the asset bridge (sprites / sfx).
//
//   createDisplay(kind, host, opts) -> { update(points, maxPoints), celebrate(tier), destroy(), setRival(points) }
//
// Every display is a small pixel canvas drawn at a low logical resolution and scaled up crisply with CSS
// (image-rendering: pixelated). Sprites come from Luna's src/sprites.js when it exists; every display also has a
// hand-drawn fallback so the game never breaks if a sprite is missing.

import { mulberry32, seedFromString } from './rng.js';

/* =====================================================================================================
   Palette (mirrors the CSS custom properties in styles.css)
   ===================================================================================================== */
export const C = {
  void: '#07060d', abyss: '#0f0b24', indigo: '#1d1650', violet: '#5b2bd6', orchid: '#b44dff',
  azure: '#3d7bff', cyan: '#5ee0ff', pink: '#ff4fa3', blush: '#ff9ad5', ink: '#e9e6ff', muted: '#8d86b8',
  good: '#5effa1', warn: '#ffd35e', bad: '#ff5e7a',
};
export const TIER_COLOR = { none: C.muted, common: C.azure, uncommon: C.orchid, rare: C.pink, mythic: C.cyan };

/* =====================================================================================================
   Asset bridge: Luna's sprites.js / sfx.js are optional at runtime
   ===================================================================================================== */
export const assets = { sprites: null, sfx: null };

export async function loadAssets() {
  try { assets.sprites = await import('./sprites.js'); } catch { assets.sprites = null; }
  try { assets.sfx = await import('./sfx.js'); } catch { assets.sfx = null; }
  return assets;
}
export const hasSprite = (name) => !!(assets.sprites && assets.sprites.SPRITES && assets.sprites.SPRITES[name]);

export function sfx(name) {
  try { assets.sfx && assets.sfx.play && assets.sfx.play(name); } catch { /* audio is best-effort */ }
}

/** Draw a named sprite centred at (cx, cy) on a canvas context. Returns false if the sprite is unavailable. */
export function drawSpriteCentered(ctx, name, cx, cy, scale = 1, frame = 0) {
  if (!hasSprite(name)) return false;
  try {
    const s = assets.sprites.SPRITES[name];
    const w = s.w * scale, h = s.h * scale;
    assets.sprites.drawSprite(ctx, name, Math.round(cx - w / 2), Math.round(cy - h / 2), scale, frame);
    return true;
  } catch { return false; }
}

// Tiny fallback icon: a coloured tile with a letter-ish pip, so nothing is ever blank.
function fallbackCanvas(name, scale) {
  const size = 16 * scale;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.className = 'px px-fallback';
  c.setAttribute('aria-hidden', 'true');
  const g = c.getContext('2d');
  const rnd = mulberry32(seedFromString(name));
  const hues = [C.violet, C.azure, C.pink, C.orchid, C.cyan];
  const col = hues[Math.floor(rnd() * hues.length)];
  g.fillStyle = C.abyss; g.fillRect(0, 0, size, size);
  g.fillStyle = col; g.fillRect(2 * scale, 2 * scale, size - 4 * scale, size - 4 * scale);
  g.fillStyle = C.ink;
  g.fillRect(6 * scale, 6 * scale, 4 * scale, 4 * scale);
  return c;
}

/** A pixel element (canvas) for a sprite name; always returns something drawable. */
export function px(name, scale = 3, opts = {}) {
  if (hasSprite(name) && assets.sprites.spriteEl) {
    try {
      const el = assets.sprites.spriteEl(name, scale, opts);
      el.classList.add('px');
      el.setAttribute('aria-hidden', 'true');
      el.style.width = ''; el.style.height = '';   // let CSS size it (crisp, integer-scaled via pixelated)
      return el;
    } catch { /* fall through */ }
  }
  return fallbackCanvas(name, scale);
}

/* =====================================================================================================
   Unit conversions per display (the contract's "1 pt = ..." table)
   ===================================================================================================== */
export const DISPLAYS = {
  trench: { title: 'Depth trench', unit: 'm', per: 10 },
  split: { title: 'Split trench', unit: 'm', per: 10 },
  city: { title: 'Neon city journey', unit: 'blocks', unit1: 'block', per: 1 },
  track: { title: 'Track laps', unit: 'm', per: 10, lap: 400 },
  flight: { title: 'Flight path', unit: 'km', per: 25 },
  notebook: { title: 'Notebook', unit: 'words', unit1: 'word', per: 1 },
  reactor: { title: 'Reactor charge', unit: 'kJ', per: 1 },
  timeline: { title: 'Timeline', unit: 'years back', unit1: 'year back', per: 1 },
  eq: { title: 'Equalizer', unit: 'dB', per: 1 },
  growth: { title: 'Growth', unit: 'cm', per: 1 },
  recipe: { title: 'Recipe card', unit: 'g', per: 1 },
  arcade: { title: 'Score counter', unit: 'pts', per: 100 },
  launch: { title: 'Launch', unit: 'km', per: 10 },
  canvas: { title: 'Canvas', unit: 'strokes', unit1: 'stroke', per: 1 },
  maze: { title: 'Labyrinth', unit: 'steps', unit1: 'step', per: 1 },
  download: { title: 'Download bar', unit: 'MB', per: 1 },
};

export const DISPLAY_BY_PACK = {
  movies: 'city', sports: 'track', geography: 'flight', language: 'notebook', science: 'reactor', history: 'timeline',
  music: 'eq', nature: 'growth', food: 'recipe', games: 'arcade', space: 'launch', arts: 'canvas', myth: 'maze', tech: 'download',
};

export function displayKindFor(mode, packId) {
  if (mode === 'duel') return 'split';
  if (mode === 'pack') return DISPLAY_BY_PACK[packId] || 'trench';
  return 'trench';
}

/** Convert points to the display's own unit. -> { value, unit, text, sub } */
export function units(kind, points) {
  const d = DISPLAYS[kind] || DISPLAYS.trench;
  const value = Math.round(points * d.per);
  const unit = value === 1 && d.unit1 ? d.unit1 : d.unit;
  const num = value.toLocaleString('en-US');
  let sub = '';
  if (d.lap) sub = `lap ${Math.floor(value / d.lap) + 1}`;
  return { value, unit, text: unit ? `${num} ${unit}` : num, sub, per: d.per };
}

/* =====================================================================================================
   Pixel helpers
   ===================================================================================================== */
const FONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  S: '111100111001111', C: '111100100100111', O: '111101101101111', R: '110101110101101', E: '111100111100111',
  H: '101101111101101', I: '111010010010111', L: '100100100100111', P: '111101111100100', A: '010101111101101',
  M: '101111111101101', B: '110101110101110', K: '101110100110101', G: '111100101101111', W: '101101111111101',
  D: '110101101101110', ':': '000010000010000', '%': '101001010100101', ',': '000000000010100', '.': '000000000000010',
  '-': '000000111000000', ' ': '000000000000000', '+': '000010111010000', '?': '111001010000010',
  F: '111100111100100', T: '111010010010010', Z: '111001010100111', U: '101101101101111', N: '110101101101101', Y: '101101010010010',
  V: '101101101101010', X: '101101010101101',
};
function text(ctx, str, x, y, color, k = 1, gap = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * k, y + Math.floor(i / 3) * k, k, k);
    cx += (3 + gap) * k;
  }
  return cx;
}
const textW = (str, k = 1, gap = 1) => String(str).length * (3 + gap) * k - gap * k;

const R = (ctx, x, y, w, h, c, a) => {
  if (a != null) ctx.globalAlpha = a;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  if (a != null) ctx.globalAlpha = 1;
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
/** Banded (posterised) vertical gradient: pixel art, no smooth blends. */
function bandsV(ctx, x, y, w, h, c1, c2, n = 12) {
  for (let i = 0; i < n; i++) R(ctx, x, y + (h * i) / n, w, Math.ceil(h / n) + 1, mix(c1, c2, i / (n - 1)));
}
function bandsH(ctx, x, y, w, h, c1, c2, n = 12) {
  for (let i = 0; i < n; i++) R(ctx, x + (w * i) / n, y, Math.ceil(w / n) + 1, h, mix(c1, c2, i / (n - 1)));
}
function disc(ctx, cx, cy, r, c) {
  ctx.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
function ring(ctx, cx, cy, r, c, th = 1) {
  ctx.fillStyle = c;
  for (let a = 0; a < 360; a += 360 / (r * 6)) {
    const x = cx + Math.cos((a * Math.PI) / 180) * r, y = cy + Math.sin((a * Math.PI) / 180) * r;
    ctx.fillRect(Math.round(x), Math.round(y), th, th);
  }
}
function star4(ctx, cx, cy, c, r = 2) {
  R(ctx, cx - r, cy, r * 2 + 1, 1, c);
  R(ctx, cx, cy - r, 1, r * 2 + 1, c);
}
function stars(ctx, S, n, seed, maxY, tw = true) {
  const rnd = mulberry32(seedFromString(seed));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * S.w), y = Math.floor(rnd() * maxY), b = rnd();
    const blink = tw && !S.reduced ? 0.5 + 0.5 * Math.sin(S.t * 2 + i) : 1;
    R(ctx, x, y, 1, 1, b > 0.85 ? C.cyan : C.ink, (0.25 + b * 0.5) * (0.5 + 0.5 * blink));
  }
}
/** Draw a sprite (Luna's if present) else run the fallback. */
function spr(S, name, cx, cy, scale, frame, fallback) {
  if (!drawSpriteCentered(S.ctx, name, cx, cy, scale, frame)) fallback();
}

/* ----- shared hand-drawn fallback actors (small, crisp, readable at 1x-2x) ----- */
function diverFB(ctx, cx, cy, k, suit, t) {
  const kick = Math.round(Math.sin(t * 6)) ;
  R(ctx, cx - 2 * k, cy - 6 * k, 4 * k, 4 * k, C.cyan);          // helmet
  R(ctx, cx - 1 * k, cy - 5 * k, 2 * k, 2 * k, C.void);          // visor
  R(ctx, cx - 1 * k, cy - 5 * k, 1 * k, 1 * k, C.ink);           // glint
  R(ctx, cx - 2 * k, cy - 2 * k, 4 * k, 5 * k, suit);            // body
  R(ctx, cx + 2 * k, cy - 2 * k, 1 * k, 4 * k, C.muted);         // tank
  R(ctx, cx - 3 * k, cy - 1 * k, 1 * k, 3 * k, suit);            // arm
  R(ctx, cx - 2 * k, cy + 3 * k, 1 * k, 3 * k, suit);            // legs
  R(ctx, cx + 1 * k, cy + 3 * k + kick * k, 1 * k, 3 * k, suit);
  R(ctx, cx - 3 * k, cy + 6 * k, 2 * k, 1 * k, C.pink);          // fins
  R(ctx, cx + 1 * k, cy + 6 * k + kick * k, 2 * k, 1 * k, C.pink);
}
function carFB(ctx, cx, cy, k, body, t) {
  R(ctx, cx - 7 * k, cy - 1 * k, 14 * k, 3 * k, body);
  R(ctx, cx - 4 * k, cy - 4 * k, 8 * k, 3 * k, body);
  R(ctx, cx - 3 * k, cy - 3 * k, 3 * k, 2 * k, C.cyan);
  R(ctx, cx + 1 * k, cy - 3 * k, 2 * k, 2 * k, C.cyan);
  R(ctx, cx + 6 * k, cy - 1 * k, 2 * k, 1 * k, C.warn);           // headlight
  R(ctx, cx - 7 * k, cy, 1 * k, 1 * k, C.bad);                    // taillight
  const w = Math.round(t * 8) % 2;
  for (const dx of [-4, 3]) { R(ctx, cx + dx * k, cy + 2 * k, 3 * k, 3 * k, C.void); R(ctx, cx + (dx + 1) * k, cy + (2 + w) * k, 1 * k, 1 * k, C.ink); }
}
function runnerFB(ctx, cx, cy, k, col, t) {
  const s = Math.round(t * 9) % 2;
  R(ctx, cx - 1 * k, cy - 6 * k, 3 * k, 3 * k, C.blush);          // head
  R(ctx, cx - 1 * k, cy - 3 * k, 3 * k, 4 * k, col);              // torso
  R(ctx, cx - 2 * k + s * k, cy - 2 * k, 1 * k, 3 * k, col);      // arms
  R(ctx, cx + 2 * k - s * k, cy - 2 * k, 1 * k, 3 * k, col);
  R(ctx, cx - 1 * k + s * k, cy + 1 * k, 1 * k, 4 * k, C.indigo);  // legs
  R(ctx, cx + 1 * k - s * k, cy + 1 * k, 1 * k, 4 * k, C.indigo);
  R(ctx, cx - 1 * k, cy - 4 * k, 3 * k, 1 * k, C.cyan);           // headband
}
function planeFB(ctx, cx, cy, k, t) {
  R(ctx, cx - 6 * k, cy - 1 * k, 12 * k, 2 * k, C.ink);           // fuselage
  R(ctx, cx + 4 * k, cy - 2 * k, 3 * k, 1 * k, C.ink);            // nose
  R(ctx, cx - 2 * k, cy - 5 * k, 3 * k, 4 * k, C.azure);          // wings
  R(ctx, cx - 2 * k, cy + 1 * k, 3 * k, 4 * k, C.azure);
  R(ctx, cx - 7 * k, cy - 4 * k, 2 * k, 3 * k, C.pink);           // tail
  R(ctx, cx + 1 * k, cy - 1 * k, 3 * k, 1 * k, C.cyan);           // windows
}
function rocketFB(ctx, cx, cy, k, t, thrust = true) {
  R(ctx, cx - 2 * k, cy - 6 * k, 4 * k, 10 * k, C.ink);           // body
  R(ctx, cx - 1 * k, cy - 8 * k, 2 * k, 2 * k, C.pink);           // nose
  R(ctx, cx - 1 * k, cy - 3 * k, 2 * k, 2 * k, C.cyan);           // window
  R(ctx, cx - 4 * k, cy + 1 * k, 2 * k, 4 * k, C.pink);           // fins
  R(ctx, cx + 2 * k, cy + 1 * k, 2 * k, 4 * k, C.pink);
  if (thrust) {
    const f = 3 + (Math.round(t * 14) % 3);
    R(ctx, cx - 1 * k, cy + 4 * k, 2 * k, f * k, C.warn);
    R(ctx, cx - 1 * k, cy + 4 * k, 1 * k, (f - 1) * k, C.blush);
  }
}

/* =====================================================================================================
   Individual displays. Each: { size(vertical) -> [w,h], init(S), draw(S) }
   S: { ctx, w, h, p (eased 0..1), pts, max, t, reduced, rival (0..1|null), vertical, data }
   ===================================================================================================== */
const D = {};

/* ---------- Depth trench + split trench ---------- */
function trench(S, lanes) {
  const { ctx, w, h, vertical: v } = S;
  const top = v ? 10 : 0, left = v ? 0 : 10;
  const span = v ? h - top - 14 : w - left - 14;
  // water
  if (v) { bandsV(ctx, 0, 0, w, h, '#2a3aa6', C.void, 16); } else { bandsH(ctx, 0, 0, w, h, '#2a3aa6', C.void, 20); }
  // light rays
  if (!S.reduced || true) {
    for (let i = 0; i < 4; i++) {
      const sh = Math.sin(S.t * 0.6 + i) * 3;
      if (v) for (let y = 0; y < h * 0.45; y += 2) R(ctx, w * (0.12 + i * 0.24) + y * 0.25 + sh, y, 5, 2, C.cyan, 0.07 * (1 - y / (h * 0.45)));
      else for (let x = 0; x < w * 0.4; x += 2) R(ctx, x, h * (0.1 + i * 0.22) + x * 0.15 + sh, 2, 4, C.cyan, 0.06 * (1 - x / (w * 0.4)));
    }
  }
  // surface wave
  if (v) for (let x = 0; x < w; x += 2) R(ctx, x, 6 + Math.round(Math.sin(x * 0.4 + S.t * 2)), 2, 2, C.cyan, 0.75);
  else for (let y = 0; y < h; y += 2) R(ctx, 6 + Math.round(Math.sin(y * 0.4 + S.t * 2)), y, 2, 2, C.cyan, 0.75);
  // 1,000 m ticks (7 prompts x 100 pts x 10 m = 7,000 m)
  const marks = Math.max(1, Math.round(S.max / 100));
  for (let k = 1; k <= marks; k++) {
    const a = (k * 100) / S.max;
    if (a > 1.001) break;
    if (v) { const y = top + a * span; R(ctx, 0, y, 5, 1, C.ink, 0.45); text(ctx, String(k), 7, y - 2, C.ink, 1); }
    else { const x = left + a * span; R(ctx, x, h - 5, 1, 5, C.ink, 0.45); text(ctx, String(k), x + 2, h - 8, C.ink, 1); }
  }
  // drifting jellies and a deep glow
  const rnd = mulberry32(seedFromString('trench'));
  for (let i = 0; i < 4; i++) {
    const a = 0.2 + rnd() * 0.7, off = rnd() * 6, side = rnd();
    const wob = Math.sin(S.t * 0.8 + i * 2) * 3;
    const jx = v ? w * (0.12 + side * 0.76) + wob : left + a * span, jy = v ? top + a * span : h * (0.2 + side * 0.6) + wob;
    R(ctx, jx - 2, jy - 1, 5, 2, C.orchid, 0.45); R(ctx, jx - 3, jy + 1, 7, 1, C.orchid, 0.45);
    R(ctx, jx - 2, jy + 2 + off % 2, 1, 3, C.orchid, 0.35); R(ctx, jx + 2, jy + 2, 1, 3, C.orchid, 0.35);
  }
  // sea floor
  if (v) {
    R(ctx, 0, h - 8, w, 8, C.indigo);
    for (let x = 0; x < w; x += 4) R(ctx, x, h - 10 + ((x * 7) % 3), 4, 3, C.violet);
    R(ctx, w / 2 - 2, h - 12, 5, 4, C.cyan); R(ctx, w / 2 - 1, h - 13, 3, 1, C.ink);            // pearl
  } else {
    R(ctx, w - 8, 0, 8, h, C.indigo);
    for (let y = 0; y < h; y += 4) R(ctx, w - 10 + ((y * 7) % 3), y, 3, 4, C.violet);
    R(ctx, w - 12, h / 2 - 2, 4, 5, C.cyan);
  }
  // divers
  lanes.forEach((ln, i) => {
    const a = clamp01(ln.p);
    const lane = lanes.length === 1 ? 0.5 : 0.3 + i * 0.4;
    const cx = v ? Math.round(w * lane) : Math.round(left + a * span);
    const cy = v ? Math.round(top + a * span) : Math.round(h * lane);
    // rope
    ctx.globalAlpha = 0.4;
    if (v) for (let y = 0; y < cy - 6; y += 2) R(ctx, cx, y, 1, 1, C.ink);
    else for (let x = 0; x < cx - 6; x += 2) R(ctx, x, cy, 1, 1, C.ink);
    ctx.globalAlpha = 1;
    // bubbles
    for (let b = 0; b < 5; b++) {
      const ph = (S.t * 14 + b * 9) % 28;
      const bx = cx + Math.round(Math.sin(S.t * 3 + b * 2) * 3) + (v ? 3 : -2 - ph);
      const by = v ? cy - 6 - ph : cy - 4 - ph * 0.4;
      R(ctx, bx, by, 1 + (b % 2), 1 + (b % 2), C.cyan, 0.8 - ph / 40);
    }
    const k = lanes.length > 1 && v ? 1 : 2;
    if (ln.hidden) { R(ctx, cx - 3, cy - 3, 7, 7, C.muted, 0.2); text(ctx, '?', cx - 1, cy - 2, C.muted, 1); return; }
    spr(S, ln.sprite || 'diver', cx, cy, lanes.length === 1 && v ? 2 : 1, Math.floor(S.t * 4) % 2, () => diverFB(ctx, cx, cy, k, ln.color, S.t));
    if (lanes.length > 1) {
      R(ctx, cx - 3, cy - 14, 7, 1, ln.color);
      text(ctx, ln.label, cx - textW(ln.label) / 2, cy - 12 - (v ? 0 : 3), ln.color, 1);
    }
    if (i === 0) S.anchor = [cx, cy];
  });
}
D.trench = {
  size: (v) => (v ? [88, 150] : [220, 44]),
  draw: (S) => trench(S, [{ p: S.p, color: C.pink, label: 'YOU' }]),
};
D.split = {
  size: (v) => (v ? [120, 150] : [220, 62]),
  draw: (S) => trench(S, [
    { p: S.p, color: C.pink, label: 'YOU' },
    { p: S.rival == null ? 0 : S.rival, color: C.cyan, label: 'RIVAL', hidden: S.rival == null },
  ]),
};

/* ---------- City journey (movies) ---------- */
D.city = {
  size: () => [160, 96],
  init: (S) => {
    const rnd = mulberry32(seedFromString('city'));
    const mk = (n, minH, maxH, minW, maxW) => { const arr = []; let x = 0; while (x < S.w + 20 && arr.length < n) { const bw = Math.floor(minW + rnd() * (maxW - minW)); arr.push({ x, bw, bh: Math.floor(minH + rnd() * (maxH - minH)), win: Array.from({ length: 40 }, () => rnd()) }); x += bw + 1; } return arr; };
    S.data = { far: mk(40, 18, 42, 8, 14), near: mk(40, 26, 62, 10, 18), signs: [0.22, 0.58].map((a) => a) };
  },
  draw: (S) => {
    const { ctx, w, h, data } = S;
    bandsV(ctx, 0, 0, w, h, C.void, C.violet, 14);
    stars(ctx, S, 40, 'cityStars', 40);
    disc(ctx, w - 26, 20, 8, C.blush); disc(ctx, w - 24, 19, 7, C.pink);
    const scroll = S.reduced ? 0 : S.t * 3;
    const layer = (arr, base, col, speed, win) => {
      for (const b of arr) {
        const x = Math.round(((b.x - scroll * speed) % (w + 40) + w + 40) % (w + 40) - 20);
        R(ctx, x, base - b.bh, b.bw, b.bh, col);
        if (win) for (let i = 0; i < b.bw / 3; i++) for (let j = 0; j < b.bh / 5 - 1; j++) {
          const lit = b.win[(i * 5 + j) % 40] > 0.55;
          if (lit) R(ctx, x + 2 + i * 3, base - b.bh + 3 + j * 5, 1, 2, b.win[(i + j) % 40] > 0.8 ? C.cyan : C.warn, 0.9);
        }
      }
    };
    layer(data.far, 68, C.indigo, 0.3, false);
    layer(data.near, 74, C.abyss, 0.7, true);
    // neon signs
    const flick = S.reduced || Math.sin(S.t * 9) > -0.8;
    R(ctx, 20, 34, 18, 5, C.pink, flick ? 1 : 0.4); R(ctx, 21, 35, 16, 3, C.void);
    text(ctx, 'FILM', 22, 35, flick ? C.blush : C.muted, 1, 0);
    // road
    R(ctx, 0, 74, w, 22, C.void); R(ctx, 0, 74, w, 1, C.orchid);
    for (let x = -10; x < w; x += 14) R(ctx, Math.round(x - ((S.reduced ? 0 : S.t * 26) % 14)), 86, 8, 1, C.muted);
    // finish + progress markers
    for (let i = 0; i < 6; i++) R(ctx, w - 14, 76 + i * 3, 2, 2, i % 2 ? C.ink : C.void);
    R(ctx, w - 14, 74, 1, 20, C.ink);
    const x0 = 14, x1 = w - 26;
    for (let k = 0; k <= 7; k++) R(ctx, x0 + ((x1 - x0) * k) / 7, 93, 1, 2, C.muted);
    const cx = Math.round(lerp(x0, x1, S.p)), cy = 82;
    // headlight beam
    for (let i = 0; i < 12; i++) R(ctx, cx + 8 + i, cy - 1 + (i >> 2) * 0, 1, 1 + (i >> 1), C.warn, 0.18 - i * 0.012);
    spr(S, 'car', cx, cy, 1, 0, () => carFB(ctx, cx, cy, 1, C.pink, S.t));
    S.anchor = [cx, cy - 6];
  },
};

/* ---------- Track laps (sports) ---------- */
D.track = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    R(ctx, 0, 0, w, h, C.abyss);
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 0 : 4; x < w; x += 8) R(ctx, x, y, 4, 4, C.indigo, 0.4); // grass checker
    const cx = w / 2, cy = h / 2, a = 50, r = 28; // stadium: straights of length 2a, end radius r
    const pathPoint = (u, off = 0) => {
      const L = 4 * a + 2 * Math.PI * r; let d = (((u % 1) + 1) % 1) * L;
      if (d < 2 * a) return [cx - a + d, cy - r - off];
      d -= 2 * a;
      if (d < Math.PI * r) { const th = -Math.PI / 2 + d / r; return [cx + a + Math.cos(th) * (r + off), cy + Math.sin(th) * (r + off)]; }
      d -= Math.PI * r;
      if (d < 2 * a) return [cx + a - d, cy + r + off];
      d -= 2 * a;
      const th = Math.PI / 2 + d / r; return [cx - a + Math.cos(th) * (r + off), cy + Math.sin(th) * (r + off)];
    };
    for (let lane = 0; lane < 3; lane++) for (let u = 0; u < 1; u += 0.004) {
      const [x, y] = pathPoint(u, lane * 5 - 3);
      R(ctx, x, y, 1, 1, lane === 1 ? C.violet : C.orchid, lane === 1 ? 0.7 : 0.55);
    }
    for (let u = 0; u < 1; u += 0.004) { const [x, y] = pathPoint(u, 6); R(ctx, x, y, 1, 1, C.void); const [x2, y2] = pathPoint(u, -6); R(ctx, x2, y2, 1, 1, C.void); }
    // start / finish line
    const [sx, sy] = pathPoint(0, -3); R(ctx, sx, sy - 4, 1, 14, C.ink);
    // lap trail
    const laps = (S.pts * 10) / 400;
    const trail = Math.min(0.9, laps % 1 || (laps > 0 ? 1 : 0));
    for (let u = Math.max(0, laps - 0.25); u < laps; u += 0.006) { const [x, y] = pathPoint(u, 2); R(ctx, x, y, 2, 2, C.pink, 0.15 + 0.5 * ((u - (laps - 0.25)) / 0.25)); }
    const [rx, ry] = pathPoint(laps, 2);
    spr(S, 'runner', rx, ry - 3, 1, Math.floor(S.t * 8) % 2, () => runnerFB(ctx, Math.round(rx), Math.round(ry) - 2, 1, C.pink, S.t));
    S.anchor = [rx, ry - 6];
    // centre scoreboard
    R(ctx, cx - 22, cy - 9, 44, 18, C.void); R(ctx, cx - 22, cy - 9, 44, 1, C.cyan); R(ctx, cx - 22, cy + 8, 44, 1, C.cyan);
    const lapN = Math.floor(laps) + 1;
    text(ctx, 'LAP', cx - 18, cy - 5, C.muted, 1); text(ctx, String(lapN), cx + 2, cy - 5, C.cyan, 2);
    text(ctx, `${Math.round(S.pts * 10)} M`, cx - textW(`${Math.round(S.pts * 10)} M`) / 2, cy + 3, C.ink, 1);
    void trail;
  },
};

/* ---------- Flight path (geography) ---------- */
D.flight = {
  size: () => [160, 96],
  init: (S) => {
    const rnd = mulberry32(seedFromString('map'));
    const blobs = [];
    for (let i = 0; i < 14; i++) blobs.push({ x: 10 + rnd() * 140, y: 14 + rnd() * 68, r: 8 + rnd() * 16 });
    S.data = { blobs };
  },
  draw: (S) => {
    const { ctx, w, h, data } = S;
    bandsV(ctx, 0, 0, w, h, '#16205e', C.abyss, 8);
    for (let x = 0; x < w; x += 16) R(ctx, x, 0, 1, h, C.azure, 0.12);
    for (let y = 0; y < h; y += 16) R(ctx, 0, y, w, 1, C.azure, 0.12);
    ctx.fillStyle = C.violet;
    for (const b of data.blobs) for (let yy = -b.r; yy <= b.r; yy += 2) for (let xx = -b.r; xx <= b.r; xx += 2) {
      const d = Math.hypot(xx, yy * 1.3);
      if (d < b.r && ((Math.floor(b.x + xx) * 7 + Math.floor(b.y + yy) * 13) % 5) > 0) { ctx.globalAlpha = 0.55 + 0.2 * (1 - d / b.r); ctx.fillRect(Math.round(b.x + xx), Math.round(b.y + yy), 2, 2); }
    }
    ctx.globalAlpha = 1;
    const A = [14, 74], B = [146, 22], Cc = [80, 18];
    const pt = (u) => [(1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * Cc[0] + u * u * B[0], (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * Cc[1] + u * u * B[1]];
    for (let u = 0; u <= 1; u += 0.02) { const [x, y] = pt(u); R(ctx, x, y, 1, 1, u <= S.p ? C.pink : C.muted, u <= S.p ? 1 : 0.5); }
    // waypoints every 1/7 (each prompt's best case is 100 pts = 2,500 km)
    for (let k = 0; k <= 7; k++) { const [x, y] = pt(k / 7); R(ctx, x - 1, y - 1, 3, 3, k / 7 <= S.p + 0.001 ? C.cyan : C.muted); }
    // cities
    for (const [x, y, c] of [[A[0], A[1], C.cyan], [B[0], B[1], C.warn]]) { R(ctx, x - 3, y - 3, 7, 7, c); R(ctx, x - 1, y - 1, 3, 3, C.void); }
    const [px_, py_] = pt(S.p), [qx, qy] = pt(Math.min(1, S.p + 0.02));
    const ang = Math.atan2(qy - py_, qx - px_);
    // contrail
    for (let i = 1; i < 7; i++) R(ctx, px_ - Math.cos(ang) * i * 2, py_ - Math.sin(ang) * i * 2, 1, 1, C.ink, 0.6 - i * 0.08);
    spr(S, 'plane', px_, py_, 1, 0, () => planeFB(ctx, Math.round(px_), Math.round(py_), 1, S.t));
    S.anchor = [px_, py_];
    void ang;
  },
};

/* ---------- Notebook (language) ---------- */
D.notebook = {
  size: () => [160, 96],
  init: (S) => { const rnd = mulberry32(seedFromString('words')); S.data = { gaps: Array.from({ length: 900 }, () => rnd()) }; },
  draw: (S) => {
    const { ctx, w, h } = S;
    R(ctx, 0, 0, w, h, C.void);
    R(ctx, 12, 6, w - 24, h - 10, C.violet);                 // cover edge
    R(ctx, 10, 4, w - 24, h - 10, C.ink);                    // page
    R(ctx, 10, 4, w - 24, 2, C.blush);
    const rows = 11, x0 = 24, x1 = w - 20, y0 = 14;
    const words = Math.round(S.p * S.max);                   // 1 pt = 1 word
    const perRow = Math.max(1, Math.ceil(S.max / rows));
    let n = 0;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * 7;
      R(ctx, x0, y + 3, x1 - x0, 1, C.azure, 0.35);
      const inRow = clamp01((words - r * perRow) / perRow);
      let x = x0, i = 0;
      const limit = x0 + inRow * (x1 - x0);
      while (x < limit - 1) {
        const ww = 3 + Math.floor(S.data.gaps[(r * 40 + i++) % 900] * 8);
        const end = Math.min(limit, x + ww);
        R(ctx, x, y, end - x, 3, (r + i) % 5 === 0 ? C.pink : C.indigo);
        x = end + 2; n++;
      }
      if (inRow > 0 && inRow < 1) { R(ctx, limit + 1, y - 1, 1, 6, C.pink); S.anchor = [limit, y]; }
    }
    // spiral binding
    for (let y = 8; y < h - 6; y += 6) { R(ctx, 6, y, 10, 2, C.muted); R(ctx, 6, y, 3, 2, C.ink); R(ctx, 13, y, 3, 2, C.void); }
    // margin line
    R(ctx, 21, 6, 1, h - 12, C.pink, 0.5);
    // pen
    const [ax, ay] = S.anchor || [x0, y0];
    for (let i = 0; i < 10; i++) R(ctx, ax + 2 + i, ay - 2 - i, 2, 2, i < 3 ? C.cyan : C.violet);
    void n;
  },
};

/* ---------- Reactor charge (science) ---------- */
D.reactor = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    R(ctx, 0, 0, w, h, C.void);
    for (let x = 0; x < w; x += 8) R(ctx, x, 0, 1, h, C.indigo, 0.5);
    for (let y = 0; y < h; y += 8) R(ctx, 0, y, w, 1, C.indigo, 0.5);
    const col = S.p < 0.4 ? C.azure : S.p < 0.7 ? C.orchid : S.p < 0.92 ? C.pink : C.cyan;
    // coil towers
    for (const tx of [14, w - 26]) {
      R(ctx, tx, 18, 12, 60, C.abyss); R(ctx, tx, 18, 12, 2, C.muted);
      for (let y = 22; y < 74; y += 4) R(ctx, tx + 1, y, 10, 2, C.violet);
      R(ctx, tx + 3, 12, 6, 6, col); if (!S.reduced) R(ctx, tx + 4, 8 - Math.round(Math.abs(Math.sin(S.t * 5))) * 2, 4, 3, C.cyan, 0.8);
    }
    // arcs between towers, more as charge rises
    const rnd = mulberry32(Math.floor(S.t * 12) + 5);
    const arcs = Math.floor(S.p * 4);
    for (let a = 0; a < arcs; a++) { let x = 26, y = 14; while (x < w - 26) { const nx = x + 4, ny = 14 + Math.round((rnd() - 0.5) * 8 + a * 0); R(ctx, x, Math.min(y, ny), 4, Math.abs(ny - y) + 1, a % 2 ? C.cyan : C.blush, 0.9); x = nx; y = ny; } }
    // core
    const pulse = S.reduced ? 0 : Math.sin(S.t * 4) * 1.5;
    disc(ctx, w / 2, 40, 14 + Math.round(pulse * 0.5), C.abyss); ring(ctx, w / 2, 40, 14, col, 2);
    disc(ctx, w / 2, 40, Math.round(4 + S.p * 7), col); disc(ctx, w / 2, 40, 3, C.ink);
    for (let i = 0; i < 6; i++) { const ang = S.t * (S.reduced ? 0 : 2) + (i * Math.PI) / 3; R(ctx, w / 2 + Math.cos(ang) * 19, 40 + Math.sin(ang) * 19, 2, 2, C.cyan); }
    S.anchor = [w / 2, 40];
    // energy bar: 28 segments
    R(ctx, 20, 72, w - 40, 14, C.abyss); R(ctx, 20, 72, w - 40, 1, C.muted); R(ctx, 20, 85, w - 40, 1, C.muted);
    const seg = 28, sw = (w - 46) / seg;
    for (let i = 0; i < seg; i++) {
      const on = (i + 1) / seg <= S.p + 0.0001;
      R(ctx, 23 + i * sw, 75, Math.max(1, sw - 1), 8, on ? mix(C.azure, C.pink, i / seg) : C.indigo, on ? 1 : 0.6);
    }
    text(ctx, `${Math.round(S.p * 100)}%`, 22, 62, col, 1);
  },
};

/* ---------- Timeline (history) ---------- */
D.timeline = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    R(ctx, 0, 0, w, h, C.void);
    stars(ctx, S, 20, 'tl', 90, false);
    const x0 = 22, full = w - 44, ext = Math.round(full * S.p);
    const y = 24, hh = 48;
    // unrolled parchment
    R(ctx, x0, y, Math.max(2, ext), hh, '#f1dfc4'); R(ctx, x0, y, Math.max(2, ext), 2, '#d6bd97'); R(ctx, x0, y + hh - 2, Math.max(2, ext), 2, '#d6bd97');
    // timeline axis with ticks
    R(ctx, x0 + 2, y + 30, Math.max(0, ext - 2), 2, '#7a5aa8');
    for (let k = 0; k <= 7; k++) {
      const tx = x0 + (full * k) / 7;
      if (tx > x0 + ext) break;
      R(ctx, tx, y + 26, 1, 10, '#7a5aa8');
      if (k > 0 && k < 7 + 1) text(ctx, `${k}C`, tx - 4, y + 38, '#7a5aa8', 1, 0);
    }
    // little monuments appear as the scroll passes them
    const marks = [[0.14, 'pyr'], [0.34, 'tower'], [0.56, 'ship'], [0.78, 'flag']];
    for (const [a, kind] of marks) {
      const mx = x0 + full * a; if (mx > x0 + ext - 4) continue;
      const my = y + 28;
      if (kind === 'pyr') { for (let i = 0; i < 6; i++) R(ctx, mx - i, my - 6 + i, 1 + i * 2, 1, C.violet); }
      if (kind === 'tower') { R(ctx, mx - 3, my - 10, 6, 10, C.violet); R(ctx, mx - 3, my - 12, 2, 2, C.violet); R(ctx, mx + 1, my - 12, 2, 2, C.violet); R(ctx, mx - 1, my - 4, 2, 4, '#f1dfc4'); }
      if (kind === 'ship') { R(ctx, mx - 5, my - 3, 10, 3, C.violet); R(ctx, mx, my - 11, 1, 8, C.violet); R(ctx, mx + 1, my - 10, 5, 5, C.pink); }
      if (kind === 'flag') { R(ctx, mx, my - 12, 1, 12, C.violet); R(ctx, mx + 1, my - 12, 6, 4, C.pink); }
    }
    // rollers
    for (const rx of [x0 - 6, x0 + ext - 2]) { R(ctx, rx, y - 4, 8, hh + 8, C.violet); R(ctx, rx, y - 4, 2, hh + 8, C.orchid); R(ctx, rx + 6, y - 4, 2, hh + 8, C.indigo); R(ctx, rx - 1, y - 6, 10, 3, C.pink); R(ctx, rx - 1, y + hh + 3, 10, 3, C.pink); }
    S.anchor = [x0 + ext, y];
    text(ctx, `-${Math.round(S.pts)} YRS`, 24, 82, C.cyan, 1);
  },
};

/* ---------- Equalizer (music) ---------- */
D.eq = {
  size: () => [160, 96],
  init: (S) => { S.data = { peaks: new Array(20).fill(0) }; },
  draw: (S) => {
    const { ctx, w, h, data } = S;
    bandsV(ctx, 0, 0, w, h, C.void, C.indigo, 10);
    // faint grid
    for (let y = 10; y < h; y += 10) R(ctx, 0, y, w, 1, C.violet, 0.2);
    const n = 20, bw = 6, gap = 2, x0 = Math.round((w - n * (bw + gap) + gap) / 2), maxH = 76;
    for (let i = 0; i < n; i++) {
      const bass = 1 - Math.abs(i - n * 0.3) / n;
      const wave = S.reduced ? 0.7 : 0.5 + 0.5 * Math.sin(S.t * (3 + i * 0.37) + i * 1.7) * Math.cos(S.t * 1.3 + i);
      const target = Math.max(0.04, S.p * (0.55 + 0.45 * wave) * (0.7 + 0.3 * bass)) * maxH;
      const hh = Math.round(target / 3) * 3;
      for (let y = 0; y < hh; y += 3) {
        const a = y / maxH;
        R(ctx, x0 + i * (bw + gap), h - 6 - y - 2, bw, 2, a < 0.4 ? C.azure : a < 0.7 ? C.orchid : a < 0.88 ? C.pink : C.cyan);
      }
      data.peaks[i] = Math.max(hh, data.peaks[i] - (S.reduced ? 99 : 0.6));
      R(ctx, x0 + i * (bw + gap), h - 6 - data.peaks[i] - 4, bw, 1, C.ink);
    }
    R(ctx, 0, h - 5, w, 5, C.abyss); R(ctx, 0, h - 5, w, 1, C.violet);
    S.anchor = [w / 2, h - 6 - S.p * maxH];
  },
};

/* ---------- Growth (nature) ---------- */
D.growth = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    bandsV(ctx, 0, 0, w, h, '#1b2a78', '#5b2bd6', 12);
    stars(ctx, S, 16, 'gs', 30);
    disc(ctx, 22, 20, 7, C.blush); disc(ctx, 22, 20, 5, C.warn);
    R(ctx, 0, h - 14, w, 14, '#1d3a2c'); R(ctx, 0, h - 14, w, 2, C.good, 0.7);
    for (let x = 2; x < w; x += 6) R(ctx, x, h - 17 + ((x * 5) % 3), 1, 3, C.good, 0.8);
    // ruler on the right (10% marks)
    for (let k = 0; k <= 10; k++) { const y = h - 14 - k * ((h - 24) / 10); R(ctx, w - 12, y, k % 5 === 0 ? 8 : 4, 1, C.ink, 0.7); }
    const cx = Math.round(w / 2), base = h - 14;
    const th = 4 + S.p * 56;                  // trunk height
    const tw = 2 + Math.floor(S.p * 4);
    const sway = S.reduced ? 0 : Math.round(Math.sin(S.t * 1.2) * 1);
    R(ctx, cx - tw / 2, base - th, tw, th, '#7a4a2a'); R(ctx, cx - tw / 2, base - th, 1, th, '#a86b3c');
    // branches appear as it grows
    const bs = [[0.25, -1], [0.4, 1], [0.55, -1], [0.7, 1], [0.85, -1]];
    for (const [a, dir] of bs) if (S.p > a) {
      const by = base - th * a, len = Math.round(6 + (S.p - a) * 18);
      for (let i = 0; i < len; i++) R(ctx, cx + dir * i, by - i * 0.5, 2, 2, '#7a4a2a');
      const lx = cx + dir * len, ly = by - len * 0.5;
      disc(ctx, lx + sway, ly - 3, 4 + Math.round(S.p * 3), '#3fbf7a'); disc(ctx, lx + sway - 1, ly - 4, 2 + Math.round(S.p * 2), C.good);
    }
    // crown
    const cr = 4 + Math.round(S.p * 14);
    disc(ctx, cx + sway, base - th - 2, cr, '#2f9a63'); disc(ctx, cx + sway - 2, base - th - 4, Math.round(cr * 0.7), '#3fbf7a'); disc(ctx, cx + sway - 3, base - th - 6, Math.max(1, Math.round(cr * 0.35)), C.good);
    if (S.p > 0.6) for (let i = 0; i < 6; i++) R(ctx, cx + sway + Math.round(Math.cos(i * 2.1) * cr * 0.8), base - th - 2 + Math.round(Math.sin(i * 2.1) * cr * 0.7), 2, 2, C.pink);   // blossoms
    S.anchor = [cx, base - th - cr];
  },
};

/* ---------- Recipe card (food) ---------- */
D.recipe = {
  size: () => [160, 96],
  init: (S) => {
    const rnd = mulberry32(seedFromString('plate'));
    const items = [];
    for (let i = 0; i < 80; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 26; items.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, c: [C.good, C.warn, C.pink, C.orchid, C.cyan, '#ff9a4a'][i % 6], k: 2 + (i % 3) }); }
    S.data = { items };
  },
  draw: (S) => {
    const { ctx, w, h, data } = S;
    R(ctx, 0, 0, w, h, C.indigo);
    // recipe card on the left
    R(ctx, 6, 8, 52, 80, '#f4ecff'); R(ctx, 6, 8, 52, 7, C.pink);
    text(ctx, 'RECIPE', 12, 10, C.ink, 1);
    for (let i = 0; i < 8; i++) R(ctx, 12, 22 + i * 8, 40 - (i % 3) * 8, 2, i < Math.round(S.p * 8) ? C.violet : '#cdbbff');
    for (let i = 0; i < Math.round(S.p * 8); i++) R(ctx, 8, 22 + i * 8, 2, 2, C.good);
    // plate
    const cx = 108, cy = 50;
    disc(ctx, cx, cy, 36, C.abyss); disc(ctx, cx, cy, 34, C.ink); disc(ctx, cx, cy, 28, '#d7d0ff'); ring(ctx, cx, cy, 30, C.blush, 1);
    const n = Math.round(S.p * data.items.length);
    for (let i = 0; i < n; i++) { const it = data.items[i]; R(ctx, cx + it.x, cy + it.y, it.k, it.k, it.c); R(ctx, cx + it.x, cy + it.y, 1, 1, C.ink, 0.6); }
    // cutlery
    R(ctx, 64, 22, 2, 52, C.muted); R(ctx, 63, 22, 4, 8, C.ink);
    R(ctx, 148, 22, 2, 52, C.muted); for (let i = 0; i < 3; i++) R(ctx, 146 + i * 2, 18, 1, 8, C.ink);
    // steam
    if (S.p > 0.1) for (let i = 0; i < 3; i++) { const sy = (S.reduced ? 0 : S.t * 10 + i * 8) % 20; R(ctx, cx - 10 + i * 10 + Math.round(Math.sin(S.t * 2 + i) * 2), 12 - sy * 0.3, 2, 4, C.ink, 0.4 - sy / 60); }
    S.anchor = [cx, cy - 10];
  },
};

/* ---------- Score counter (games) ---------- */
D.arcade = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    R(ctx, 0, 0, w, h, C.void);
    // cabinet
    R(ctx, 16, 4, w - 32, h - 4, C.violet); R(ctx, 16, 4, w - 32, 2, C.orchid);
    R(ctx, 16, 4, 3, h - 4, C.indigo); R(ctx, w - 19, 4, 3, h - 4, C.indigo);
    R(ctx, 22, 8, w - 44, 10, C.pink); text(ctx, 'ARCADE', Math.round(w / 2 - textW('ARCADE') / 2), 11, C.ink, 1);
    // screen
    R(ctx, 24, 22, w - 48, 44, C.void); R(ctx, 24, 22, w - 48, 1, C.cyan, 0.5);
    // invaders march
    const mx = S.reduced ? 0 : Math.round(Math.sin(S.t * 0.8) * 10);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const x = 34 + c * 14 + mx, y = 38 + r * 8, fr = (Math.floor(S.t * 2) + c) % 2;
      const col = r ? C.azure : C.cyan;
      R(ctx, x + 1, y, 5, 3, col); R(ctx, x, y + 1, 7, 1, col); R(ctx, x + 1 + fr, y + 3, 1, 2, col); R(ctx, x + 5 - fr, y + 3, 1, 2, col); R(ctx, x + 2, y + 1, 1, 1, C.void); R(ctx, x + 4, y + 1, 1, 1, C.void);
    }
    // player + shot
    const px_ = Math.round(w / 2 + Math.sin(S.t * 1.7) * 30 * (S.reduced ? 0 : 1));
    R(ctx, px_ - 3, 60, 7, 2, C.good); R(ctx, px_ - 1, 58, 3, 2, C.good);
    if (!S.reduced) R(ctx, px_, 60 - ((S.t * 40) % 24) - 4, 1, 3, C.warn);
    // score
    const val = String(Math.round(S.pts * 100)).padStart(6, '0');
    text(ctx, 'SCORE', 28, 25, C.muted, 1);
    text(ctx, val.replace(/(\d{3})(\d{3})/, '$1,$2'), 28, 74, C.warn, 2);
    // HI blink + controls
    if (S.reduced || Math.floor(S.t * 2) % 2) text(ctx, 'HI', w - 40, 25, C.pink, 1);
    R(ctx, 36, 88, 3, 8, C.muted); R(ctx, 34, 85, 7, 4, C.pink);
    R(ctx, w - 50, 88, 5, 3, C.cyan); R(ctx, w - 42, 88, 5, 3, C.warn);
    S.anchor = [w / 2, 30];
  },
};

/* ---------- Launch (space) ---------- */
D.launch = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    bandsV(ctx, 0, 0, w, h, C.void, '#2b1a7a', 12);
    stars(ctx, S, 50, 'orbit', h);
    const drift = S.reduced ? 0 : (S.t * 14) % 96;
    for (let i = 0; i < 12; i++) R(ctx, (i * 53) % w, ((i * 37 + drift) % h), 1, 3, C.ink, 0.3);   // streaking stars
    // earth at the bottom-left shrinking
    const er = Math.round(46 - S.p * 18);
    disc(ctx, 20, h + 14 + S.p * 26, er, C.azure); disc(ctx, 24, h + 10 + S.p * 26, Math.round(er * 0.85), '#2a5fd8'); R(ctx, 12, h - 12 + S.p * 20, 14, 3, C.good, 0.7);
    // orbit ring at the target
    const x0 = 24, y0 = h - 16, x1 = w - 22, y1 = 18;
    ring(ctx, x1, y1, 9, C.cyan, 1); star4(ctx, x1, y1, C.warn, 2);
    // dotted ascent path
    for (let i = 0; i <= 24; i++) { const u = i / 24; R(ctx, lerp(x0, x1, u), lerp(y0, y1, Math.pow(u, 0.8)), 1, 1, u <= S.p ? C.pink : C.muted, u <= S.p ? 1 : 0.5); }
    const u = S.p, rx = lerp(x0, x1, u), ry = lerp(y0, y1, Math.pow(u, 0.8));
    // smoke trail
    for (let i = 1; i < 9; i++) R(ctx, rx - i * 2 - 1, ry + i * 1.5, 3, 3, C.ink, 0.5 - i * 0.05);
    spr(S, 'rocket', rx, ry, 1, 0, () => rocketFB(ctx, Math.round(rx), Math.round(ry), 1, S.t));
    S.anchor = [rx, ry - 8];
    text(ctx, `${Math.round(S.pts * 10)} KM`, 6, 6, C.cyan, 1);
  },
};

/* ---------- Canvas (arts) ---------- */
function paintColor(x, y, gw, gh) {
  const hz = gh * 0.58;
  if (y < hz) {
    const t = y / hz;
    // sun
    const sx = gw * 0.68, sy = hz - 6, d = Math.hypot(x - sx, (y - sy) * 1.1);
    if (d < 4.2) return C.warn;
    if (d < 5.2) return C.blush;
    // mountains
    const m1 = hz - 3 - Math.abs(((x * 0.55) % 9) - 4.5) * 1.1 - Math.sin(x * 0.3) * 2;
    if (y > m1 && x < gw * 0.55) return C.violet;
    const m2 = hz - 2 - Math.abs(((x * 0.4 + 3) % 12) - 6) * 0.8;
    if (y > m2) return C.indigo;
    return t < 0.3 ? '#1b1a6e' : t < 0.55 ? C.violet : t < 0.8 ? C.orchid : C.pink;
  }
  // water with sun reflection
  const t = (y - hz) / (gh - hz);
  const refl = Math.abs(x - gw * 0.68) < 3 - t * 2 && ((y + x) % 2 === 0);
  if (refl) return C.warn;
  return t < 0.4 ? C.azure : t < 0.75 ? '#2a5fd8' : C.indigo;
}
D.canvas = {
  size: () => [160, 96],
  init: (S) => {
    const gw = 32, gh = 18, order = Array.from({ length: gw * gh }, (_, i) => i);
    const rnd = mulberry32(seedFromString('paint'));
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    S.data = { gw, gh, order, rank: (() => { const r = new Array(order.length); order.forEach((c, i) => { r[c] = i; }); return r; })() };
  },
  draw: (S) => {
    const { ctx, w, h, data } = S;
    R(ctx, 0, 0, w, h, C.abyss);
    // easel
    R(ctx, 30, 78, 4, 18, '#7a4a2a'); R(ctx, w - 34, 78, 4, 18, '#7a4a2a'); R(ctx, 20, 74, w - 40, 3, '#a86b3c');
    // frame + canvas
    const fx = 14, fy = 6, fw = 132, fh = 68;
    R(ctx, fx, fy, fw, fh, C.warn); R(ctx, fx + 2, fy + 2, fw - 4, fh - 4, '#b88a20'); R(ctx, fx + 4, fy + 4, fw - 8, fh - 8, '#f4ecff');
    const cw = fw - 8, ch = fh - 8, tw = cw / data.gw, th = ch / data.gh;
    const shown = Math.round(S.p * data.order.length);
    // faint pencil sketch for unrevealed tiles
    for (let gy = 0; gy < data.gh; gy++) for (let gx = 0; gx < data.gw; gx++) {
      const idx = gy * data.gw + gx;
      if (data.rank[idx] < shown) R(ctx, fx + 4 + gx * tw, fy + 4 + gy * th, Math.ceil(tw), Math.ceil(th), paintColor(gx, gy, data.gw, data.gh));
      else if ((gx + gy) % 2 === 0) R(ctx, fx + 4 + gx * tw, fy + 4 + gy * th, Math.ceil(tw), Math.ceil(th), '#e7dcff');
    }
    // brush at the latest tile
    const last = data.order[Math.max(0, shown - 1)], lx = fx + 4 + (last % data.gw) * tw, ly = fy + 4 + Math.floor(last / data.gw) * th;
    if (shown > 0 && shown < data.order.length) { for (let i = 0; i < 9; i++) R(ctx, lx + 3 + i, ly - 1 - i, 2, 2, i < 3 ? C.pink : '#7a4a2a'); S.anchor = [lx, ly]; } else S.anchor = [w / 2, fy];
    // palette
    R(ctx, 56, 80, 48, 12, '#d6bd97'); [C.pink, C.cyan, C.warn, C.violet, C.good].forEach((c, i) => R(ctx, 60 + i * 9, 84, 6, 5, c));
  },
};

/* ---------- Labyrinth (myth) ---------- */
function makeMaze(cols, rows, seed) {
  const rnd = mulberry32(seedFromString(seed));
  const gw = cols * 2 + 1, gh = rows * 2 + 1, g = Array.from({ length: gh }, () => new Array(gw).fill(1));
  const stack = [[0, 0]]; g[1][1] = 0; const seen = new Set(['0,0']);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows && !seen.has(`${x},${y}`));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = nb[Math.floor(rnd() * nb.length)];
    g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0; g[ny * 2 + 1][nx * 2 + 1] = 0; seen.add(`${nx},${ny}`); stack.push([nx, ny]);
  }
  // BFS solution from (1,1) to (gw-2,gh-2)
  const start = [1, 1], goal = [gw - 2, gh - 2], prev = new Map([['1,1', null]]), q = [start];
  while (q.length) {
    const [x, y] = q.shift(); if (x === goal[0] && y === goal[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (g[ny]?.[nx] === 0 && !prev.has(`${nx},${ny}`)) { prev.set(`${nx},${ny}`, [x, y]); q.push([nx, ny]); } }
  }
  const path = []; let cur = goal; while (cur) { path.push(cur); cur = prev.get(`${cur[0]},${cur[1]}`); } path.reverse();
  return { g, gw, gh, path };
}
D.maze = {
  size: () => [160, 96],
  init: (S) => { S.data = makeMaze(7, 4, 'minotaur'); },
  draw: (S) => {
    const { ctx, w, h, data } = S;
    R(ctx, 0, 0, w, h, C.void);
    const t = 10, ox = Math.round((w - data.gw * t) / 2), oy = Math.round((h - data.gh * t) / 2);
    for (let y = 0; y < data.gh; y++) for (let x = 0; x < data.gw; x++) {
      if (data.g[y][x]) { R(ctx, ox + x * t, oy + y * t, t, t, (x + y) % 2 ? C.violet : '#4a22b0'); R(ctx, ox + x * t, oy + y * t, t, 2, C.orchid, 0.6); }
      else R(ctx, ox + x * t, oy + y * t, t, t, C.abyss);
    }
    const n = data.path.length - 1, idx = S.p * n, i0 = Math.floor(idx), i1 = Math.min(n, i0 + 1), f = idx - i0;
    for (let i = 0; i <= Math.min(i0, n); i++) { const [x, y] = data.path[i]; R(ctx, ox + x * t + 3, oy + y * t + 3, 4, 4, C.pink, 0.5); }
    const ax = lerp(data.path[i0][0], data.path[i1][0], f), ay = lerp(data.path[i0][1], data.path[i1][1], f);
    const cx = ox + ax * t + t / 2, cy = oy + ay * t + t / 2;
    // goal star
    const [gx, gy] = data.path[n]; star4(ctx, ox + gx * t + 5, oy + gy * t + 5, S.reduced || Math.floor(S.t * 3) % 2 ? C.warn : C.cyan, 3);
    // hero: a glowing pink blob
    disc(ctx, cx, cy, 4, C.pink); R(ctx, cx - 2, cy - 2, 2, 2, C.blush); R(ctx, cx - 1, cy - 1, 1, 1, C.void); R(ctx, cx + 1, cy - 1, 1, 1, C.void);
    S.anchor = [cx, cy - 4];
  },
};

/* ---------- Download bar (tech) ---------- */
D.download = {
  size: () => [160, 96],
  draw: (S) => {
    const { ctx, w, h } = S;
    R(ctx, 0, 0, w, h, C.void);
    // window chrome
    R(ctx, 8, 8, w - 16, h - 16, C.abyss); R(ctx, 8, 8, w - 16, 10, C.violet);
    R(ctx, 12, 11, 4, 4, C.bad); R(ctx, 19, 11, 4, 4, C.warn); R(ctx, 26, 11, 4, 4, C.good);
    text(ctx, 'DOWNLOAD', 40, 11, C.ink, 1);
    // file icons
    R(ctx, 16, 26, 14, 18, C.ink); R(ctx, 24, 26, 6, 6, C.muted); R(ctx, 19, 36, 8, 1, C.violet); R(ctx, 19, 39, 8, 1, C.violet);
    text(ctx, 'TOP.ZIP', 36, 28, C.cyan, 1);
    const mb = Math.round(S.pts);
    text(ctx, `${mb} MB`, 36, 38, C.ink, 1);
    // bar
    const bx = 16, by = 56, bw = w - 32, bh = 14;
    R(ctx, bx - 2, by - 2, bw + 4, bh + 4, C.muted); R(ctx, bx, by, bw, bh, C.void);
    const fill = Math.round(bw * S.p);
    for (let x = 0; x < fill; x += 4) R(ctx, bx + x, by, 3, bh, mix(C.azure, C.pink, x / bw));
    if (!S.reduced) for (let x = (S.t * 20) % 8; x < fill; x += 8) R(ctx, bx + x, by + 2, 2, bh - 4, C.ink, 0.25);
    text(ctx, `${Math.round(S.p * 100)}%`, bx, by + bh + 5, C.cyan, 1);
    text(ctx, `${Math.round(S.max)} MB`, bx + bw - textW(`${Math.round(S.max)} MB`), by + bh + 5, C.muted, 1);
    // packets
    if (!S.reduced) for (let i = 0; i < 6; i++) { const x = 16 + ((S.t * 40 + i * 22) % (w - 40)); R(ctx, x, 48, 3, 3, i % 2 ? C.cyan : C.pink); }
    S.anchor = [bx + fill, by];
  },
};

/* =====================================================================================================
   Display runtime
   ===================================================================================================== */
function isReduced() {
  const c = document.documentElement.classList;
  return c.contains('reduce-motion') || c.contains('easy-read') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function createDisplay(kind, host, opts = {}) {
  const spec = D[kind] || D.trench;
  const info = DISPLAYS[D[kind] ? kind : 'trench'];
  const kindName = D[kind] ? kind : 'trench';
  const wrap = document.createElement('div');
  wrap.className = `display display-${kindName}`;
  const canvas = document.createElement('canvas');
  canvas.className = 'display-canvas';
  canvas.setAttribute('role', 'img');
  const readout = document.createElement('div');
  readout.className = 'display-readout';
  const val = document.createElement('span'); val.className = 'display-value';
  const sub = document.createElement('span'); sub.className = 'display-sub';
  readout.append(val, sub);
  const title = document.createElement('div'); title.className = 'display-title'; title.textContent = info.title;
  wrap.append(title, canvas, readout);
  host.replaceChildren(wrap);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const S = { ctx, w: 0, h: 0, p: 0, pts: 0, max: 700, t: 0, reduced: isReduced(), rival: null, vertical: false, data: null, anchor: null };
  let target = 0, rivalTarget = null, sparks = [], flash = 0, flashColor = C.cyan, raf = 0, last = 0, dead = false, started = false;
  const mq = window.matchMedia ? window.matchMedia('(min-width: 861px)') : null;

  function layout() {
    S.vertical = !!(opts.vertical ?? (mq ? mq.matches : false)) && (kindName === 'trench' || kindName === 'split');
    const [w, h] = spec.size(S.vertical);
    S.w = w; S.h = h; canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    canvas.dataset.orient = S.vertical ? 'v' : 'h';
    S.data = null;
    if (spec.init) spec.init(S);
  }

  function describe() {
    const u = units(kindName, S.max ? Math.round(S.p * S.max) : 0);
    canvas.setAttribute('aria-label', `${info.title}: ${u.text}`);
    return u;
  }

  function render() {
    ctx.clearRect(0, 0, S.w, S.h);
    ctx.globalAlpha = 1;
    try { spec.draw(S); } catch (e) { /* a drawing glitch must never break gameplay */ console.error('display draw failed', e); }
    // sparks + flash overlay
    for (const sp of sparks) { R(ctx, sp.x, sp.y, sp.s, sp.s, sp.c, clamp01(sp.life * 1.5)); if (sp.star) star4(ctx, Math.round(sp.x), Math.round(sp.y), sp.c, 2); }
    if (flash > 0) R(ctx, 0, 0, S.w, S.h, flashColor, flash * 0.28);
    const u = describe();
    val.textContent = kindName === 'arcade' ? u.text.padStart(7, '0') : u.text;
    sub.textContent = u.sub;
  }

  function step(now) {
    if (dead) return;
    if (!wrap.isConnected) { destroy(); return; }
    raf = requestAnimationFrame(step);
    if (now - last < 60) return;               // ~16 fps: keeps the pixel look and saves battery
    const dt = Math.min(0.2, (now - last) / 1000 || 0.06); last = now;
    S.t += dt;
    S.p += (target - S.p) * Math.min(1, dt * 3.2);
    if (Math.abs(target - S.p) < 0.0005) S.p = target;
    if (rivalTarget != null) S.rival = S.rival == null ? rivalTarget : S.rival + (rivalTarget - S.rival) * Math.min(1, dt * 3.2);
    S.pts = S.p * S.max;
    for (const sp of sparks) { sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 40 * dt; sp.life -= dt * 0.9; }
    sparks = sparks.filter((sp) => sp.life > 0);
    flash = Math.max(0, flash - dt * 2.2);
    render();
  }

  function begin() {
    cancelAnimationFrame(raf);
    S.reduced = isReduced();
    if (S.reduced) { S.p = target; S.rival = rivalTarget; S.pts = S.p * S.max; render(); return; }
    last = 0; raf = requestAnimationFrame(step);
  }

  layout();
  const onMq = () => { layout(); begin(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);
  const mo = new MutationObserver(() => { const r = isReduced(); if (r !== S.reduced) begin(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  begin();

  function update(points, maxPoints) {
    S.max = maxPoints || S.max || 700;
    target = clamp01(points / S.max);
    if (!started) { started = true; if (opts.instant) S.p = target; }
    S.pts = S.p * S.max;
    if (S.reduced) { S.p = target; S.pts = S.p * S.max; if (rivalTarget != null) S.rival = rivalTarget; render(); }
  }
  function setRival(points) {
    rivalTarget = points == null ? null : clamp01(points / S.max);
    if (rivalTarget == null) S.rival = null;
    if (S.reduced) { S.rival = rivalTarget; render(); }
  }
  function celebrate(tier = 'common') {
    const n = { none: 0, common: 6, uncommon: 10, rare: 16, mythic: 26 }[tier] ?? 6;
    const [ax, ay] = S.anchor || [S.w / 2, S.h / 2];
    const rnd = Math.random;
    const cols = tier === 'mythic' ? [C.cyan, C.ink, C.blush] : tier === 'rare' ? [C.pink, C.blush, C.ink] : tier === 'uncommon' ? [C.orchid, C.violet, C.ink] : [C.azure, C.cyan];
    for (let i = 0; i < n; i++) sparks.push({ x: ax, y: ay, vx: (rnd() - 0.5) * 70, vy: -rnd() * 50 - 8, life: 0.8 + rnd() * 0.5, s: 1 + Math.floor(rnd() * 2), c: cols[i % cols.length], star: tier === 'mythic' && i % 5 === 0 });
    if (tier === 'mythic' || tier === 'rare') { flash = tier === 'mythic' ? 1 : 0.5; flashColor = tier === 'mythic' ? C.cyan : C.pink; }
    if (S.reduced) render();
  }
  function destroy() {
    dead = true; cancelAnimationFrame(raf); mo.disconnect();
    if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
  }
  return { update, celebrate, destroy, setRival, kind: kindName, canvas };
}
