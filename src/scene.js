// Vermillion title-screen scene: dusk sky, moon, clouds, a waterline with Vermi and a buoy,
// and dark water below (bubbles, fish, depth ruler). One low-res canvas scaled up with
// image-rendering: pixelated. Everything is original, drawn here from rectangles; Luna's sprites
// (moon, star, cloud-a/b, buoy, wave, fish-a/b, mascot) are used when they exist.
import { assets, hasSprite } from './displays.js';
import { TIER_INFO } from './game.js';

let S = null;   // running scene state (null when stopped)
const PX_PER_M = 0.24;
const WIND = 150, LAND = 400;                     // ms: wind-up before the plunge, landing after it
const GATES = [['common', 0], ['uncommon', 210], ['rare', 510], ['mythic', 810]];   // metres below where the dive starts (points 1/21/51/81 x 10 m)   // play mode: 1 logical px per ~4 m, so a 100 m ruler tick is 24 px

const sfxPlay = (name, step) => { try { assets.sfx && assets.sfx.play && assets.sfx.play(name, step); } catch { /* audio is best-effort */ } };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
function lerpStops(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t <= p1) return mix(c0, c1, (t - p0) / Math.max(0.0001, p1 - p0));
  }
  return mix(stops[stops.length - 1][1], stops[stops.length - 1][1], 0);
}

// Calm palette (Orchestrator 00:30): one smooth sky gradient, dark navy water, muted lavender details.
const WATER = [[0, '#141033'], [0.25, '#0b0921'], [1, '#07060d']];
const THEMES = {
  neon: { sky: [[0, '#1a1540'], [0.55, '#33295f'], [1, '#5c4a80']], water: WATER, cloudA: '#c9a6e8', cloudB: '#f0b8d0', star: '#cfc9f0', moon: '#f3ecff', moonShade: '#cdbdf2', crest: '#7a6fb8', foam: '#6f78b8' },
  midnight: { sky: [[0, '#0f0c2e'], [0.55, '#241d4c'], [1, '#463a68']], water: WATER, cloudA: '#9a86d0', cloudB: '#c89ab8', star: '#c4bfe8', moon: '#e6e2ff', moonShade: '#a9a3dc', crest: '#6a5fa0', foam: '#5f68a8' },
  crt: { sky: [[0, '#1a1a48'], [0.55, '#33306a'], [1, '#5a5088']], water: WATER, cloudA: '#b8a6e8', cloudB: '#f0b8d8', star: '#d4e8f4', moon: '#eaf7ff', moonShade: '#b5d4ec', crest: '#7a78c0', foam: '#6f88c0' },
};
const EDGE = 40;                         // css px of water the edge canvas paints below the waterline
// A long, low swell: a ~600 px sine plus a smaller 230 px one, a full cycle every ~8 s, continuous (not snapped).
const swell = (x, T) => 5 * Math.sin(2 * Math.PI * (x / 600 - T / 8)) + 1.8 * Math.sin(2 * Math.PI * (x / 230 - T / 5.3) + 1);

// 3x5 digits + 'm' for the depth ruler
const GLYPH = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
  m: '000000110111101', '-': '000000111000000',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101111011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const isReduced = () => document.documentElement.classList.contains('reduce-motion') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const themeName = () => document.documentElement.dataset.theme || 'neon';

function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
function text(g, str, x, y, c, sc = 1) {
  g.fillStyle = c;
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const bits = (ch === 'M' && /m$/.test(String(str)) && /^[-0-9]*m$/.test(String(str))) ? GLYPH.m : GLYPH[ch]; if (!bits) { cx += 2 * sc; continue; }
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(cx + (i % 3) * sc, y + Math.floor(i / 3) * sc, sc, sc);
    cx += 4 * sc;
  }
}
function sprite(g, name, x, y, scale, frame = 0) {
  try { assets.sprites.drawSprite(g, name, Math.round(x), Math.round(y), scale, frame); return true; } catch { return false; }
}
const sw = (name) => (hasSprite(name) ? assets.sprites.SPRITES[name] : null);

/* ---------------------------------------------------------------- procedural art ---------- */
function makeCloud(w, h, seed, color) {
  // A flat-bottomed pixel cloud: a few overlapping round humps, cached to a tiny canvas.
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const r = rng(seed); g.fillStyle = color;
  const humps = [[0.22, 0.55], [0.42, 0.95], [0.62, 0.7], [0.8, 0.45]];
  for (const [fx, fh] of humps) {
    const rx = Math.round(w * (0.16 + r() * 0.06)), ry = Math.max(2, Math.round((h - 1) * fh * (0.85 + r() * 0.2))), cx = Math.round(w * fx);
    for (let y = 0; y < ry; y++) { const half = Math.round(rx * Math.sqrt(1 - Math.pow((ry - 1 - y) / ry, 2))); g.fillRect(cx - half, h - 2 - (ry - 1 - y) , half * 2, 1); }
  }
  g.fillRect(Math.round(w * 0.06), h - 2, Math.round(w * 0.88), 2);
  return c;
}

function tinted(g, name, x, y, scale, frame, color) {
  try { assets.sprites.drawTintedSprite(g, name, Math.round(x), Math.round(y), scale, frame, color); return true; } catch { return false; }
}
function spriteCanvas(name, scale) {
  const d = assets.sprites.SPRITES[name]; const c = document.createElement('canvas'); c.width = d.w * scale; c.height = d.h * scale;
  sprite(c.getContext('2d'), name, 0, 0, scale, 0); return c;
}

function makeMoon(th) {
  const n = 32, c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 15) continue;
    // lit from the upper left; a crescent shadow on the lower right
    const sh = (dx * 0.6 + dy * 0.8) / 15;
    g.fillStyle = sh > 0.55 ? th.moonShade : th.moon;
    g.fillRect(x, y, 1, 1);
  }
  const crater = (cx, cy, r) => { g.fillStyle = th.moonShade; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) g.fillRect(cx + x, cy + y, 1, 1); };
  crater(10, 11, 3); crater(19, 18, 2); crater(12, 21, 2); crater(21, 9, 1);
  return c;
}

function drawFishShape(g, x, y, dir, color, big) {
  g.fillStyle = color;
  const body = big ? [[2, 0, 6], [1, 1, 9], [0, 2, 10], [1, 3, 9], [2, 4, 6]] : [[1, 0, 4], [0, 1, 6], [1, 2, 4]];
  const w = big ? 10 : 6;
  for (const [ox, oy, len] of body) {
    const sx = dir > 0 ? x + ox : x + (w - ox - len);
    g.fillRect(sx, y + oy, len, 1);
  }
  // tail
  const tx = dir > 0 ? x - 2 : x + w + 1;
  g.fillRect(tx, y + (big ? 0 : 0), 1, big ? 5 : 3);
  g.fillRect(dir > 0 ? x - 1 : x + w, y + 1, 1, big ? 3 : 1);
}

/* ---------------------------------------------------------------- scene lifecycle ---------- */
export function startScene(host, opts = {}) {
  stopScene();
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const g = canvas.getContext('2d');
  const edge = document.createElement('canvas');   // 2 px-resolution layer: the swell, the surface line and the depth ruler
  edge.className = 'scene-canvas scene-edge';
  edge.setAttribute('aria-hidden', 'true');
  canvas.after(edge);
  const eg = edge.getContext('2d');
  let band = null, sub = null;                      // cached water-colour column under the surface / light band
  const base = document.createElement('canvas');   // cached sky + water gradients
  const bg = base.getContext('2d');
  const st = S = {
    host, canvas, edge, g, base, bg, W: 0, H: 0, scale: 4, water: 0, th: THEMES[themeName()] || THEMES.neon,
    play: opts.mode === 'play', trail: [], dive: null, sad: null, banner: null, prevCam: null, rivalTween: null, cam: 0, camTween: null, depthM: 0, rival: null, answered: 0, pulse: null, glow: [], raf: 0, last: 0, t: 0, stars: [], clouds: [], bubbles: [], fish: [], moonImg: null, opts,
    getWaterY: opts.getWaterY || (() => host.clientHeight * 0.62), stopped: false, observers: [],
  };

  const waterAt = (dy) => lerpStops(st.th.water, Math.min(1, Math.max(0, dy) / 300));
  function layout() {
    const cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch) return;
    st.scale = cw < 600 ? 3 : 4;
    st.W = Math.ceil(cw / st.scale); st.H = Math.ceil(ch / st.scale);
    canvas.width = st.W; canvas.height = st.H; base.width = st.W; base.height = st.H;
    canvas.style.width = `${st.W * st.scale}px`; canvas.style.height = `${st.H * st.scale}px`;
    st.EW = cw; st.EH = ch;
    edge.width = st.EW; edge.height = st.EH; edge.style.width = `${cw}px`; edge.style.height = `${ch}px`;
    st.wyCss = st.play ? Math.round(st.H * 0.28) * st.scale : st.getWaterY();
    st.water = Math.round(st.wyCss / st.scale);
    if (st.play) st.cam = Math.round(st.depthM * PX_PER_M);
    st.th = THEMES[themeName()] || THEMES.neon;
    paintBase(); seed(); frame(true);
  }

  function paintBase() {
    const { W, H, water, th, scale } = st;
    const seam = Math.floor((st.wyCss + EDGE - 2) / scale);    // the sky runs on under the swell; the edge layer paints the water over it
    for (let y = 0; y < Math.min(H, seam); y++) rect(bg, 0, y, W, 1, lerpStops(th.sky, y / Math.max(1, water - 1)));
    for (let y = seam; y < H; y++) rect(bg, 0, y, W, 1, waterAt(y * scale - st.wyCss));
    st.moonImg = makeMoon(th);
    // the edge layer's water column: the same colours as the water below it, so the join is invisible
    const bandTop = Math.floor(st.wyCss - 12), rows = EDGE + 12;
    band = document.createElement('canvas'); band.width = 1; band.height = rows;
    const bgx = band.getContext('2d');
    for (let r = 0; r < rows; r++) { bgx.fillStyle = waterAt(bandTop + r - st.wyCss); bgx.fillRect(0, r, 1, 1); }
    st.bandTop = bandTop; st.bandRows = rows;
    sub = document.createElement('canvas'); sub.width = 1; sub.height = 16;
    const sgx = sub.getContext('2d');
    for (let r = 0; r < 16; r++) { sgx.globalAlpha = 0.09 * (1 - r / 16); sgx.fillStyle = '#9a8fe0'; sgx.fillRect(0, r, 1, 1); }
  }

  function seed() {
    const { W, H, water, scale } = st; const r = rng(1337 + W);
    const skyH = Math.round(water * 0.4);
    st.stars = Array.from({ length: 18 }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * skyH), p: r() * 6 }));
    // 3-4 soft clouds, only in the top corners and edges (never across the title block); they sway a few px, they don't travel
    const cl = (name, tint, sd) => makeCloud(48, 12, sd, tint);   // our own soft clouds: low contrast, flat-bottomed
    const narrow = W * scale < 600;
    const spots = narrow
      ? [['cloud-a', 0.0, 26, 0.3], ['cloud-b', 0.46, -4, 0.28], ['cloud-a', 0.7, 24, 0.26]]
      : [['cloud-a', 0.03, 22, 0.32], ['cloud-b', 0.55, -2, 0.28], ['cloud-a', 0.86, 92, 0.3], ['cloud-b', -0.02, 96, 0.25]];
    st.clouds = spots.map(([name, fx, y, a], i) => ({ img: cl(name, name === 'cloud-a' ? st.th.cloudA : st.th.cloudB, 3 + i * 4), x: Math.round(W * fx), y: Math.round(y / scale), a, ph: i * 1.7 }));

    const depth = H - water;
    st.bubbles = Array.from({ length: 7 }, () => ({ x: Math.floor(r() * (W - 14)), y: water + r() * depth, v: 2 + r() * 3, ph: r() * 6, s: 1 }));
    st.fish = Array.from({ length: 3 }, (_, i) => ({ y: water + 12 + (depth - 24) * (0.2 + i * 0.28) + r() * 6, x: r() * W, v: (i % 2 ? -1 : 1) * (2 + r() * 2), big: i % 2 === 0, name: i % 2 ? 'fish-b' : 'fish-a' }));
    st.glow = Array.from({ length: 48 }, () => ({ x: r() * W, y: r() * H, v: 2 + r() * 5, ph: r() * 6, c: r() < 0.6 ? '#5ee0ff' : '#ff9ad5' }));
    st.moonX = Math.round(W * 0.82 - 16); st.moonY = -Math.round(14 * 4 / scale);
  }

  /* Shared by the title screen and the game: stars, moon and clouds (they ride up with the waterline in play). */
  function drawSky(T, shift, wy, reduced) {
    const { W, th } = st;
    for (const s of st.stars) {
      const y = s.y + shift; if (y < 0 || y >= wy) continue;
      g.globalAlpha = reduced ? 0.35 : 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(T * 0.45 + s.p));
      rect(g, s.x, y, 1, 1, th.star);
    }
    g.globalAlpha = 1;
    const my = st.moonY + shift;
    if (my > -40) {
      const cx = st.moonX + 16, cy = my + 16, gr = g.createRadialGradient(cx, cy, 6, cx, cy, 44);
      gr.addColorStop(0, 'rgba(243,236,255,0.16)'); gr.addColorStop(1, 'rgba(243,236,255,0)');
      g.fillStyle = gr; g.fillRect(cx - 46, cy - 46, 92, 92);
      g.globalAlpha = 0.85;
      if (sw('moon') && sprite(g, 'moon', st.moonX, my, 1)) { /* Luna's moon */ } else g.drawImage(st.moonImg, st.moonX, my);
      g.globalAlpha = 1;
    }
    for (const c of st.clouds) {
      const x = c.x + (reduced ? 0 : Math.round(Math.sin(T * 0.07 + c.ph) * 5));
      g.globalAlpha = c.a; g.drawImage(c.img, x, Math.round(c.y + shift)); g.globalAlpha = 1;
    }
  }

  /* The swell and the depth ruler, on the 2 px layer. wyCss = the waterline in css px (can be off-screen in play). */
  function drawEdge(wyCss, T, rulerStep) {
    const EW = st.EW, EH = st.EH;
    eg.clearRect(0, 0, EW, EH);
    if (wyCss < -30 || wyCss > EH * 2 + 30 || !band) return;
    const dBand = Math.floor(wyCss - 12) - st.bandTop;   // the cached column was built for st.wyCss; in play it slides with the camera
    for (let x = 0; x < EW; x++) {
      const top = Math.round(wyCss + swell(x, T));
      const r0 = top - (st.bandTop + dBand); const h = Math.min(st.bandRows - r0, EH - top);
      if (r0 >= 0 && h > 0) eg.drawImage(band, 0, r0, 1, h, x, top, 1, h);
      eg.drawImage(sub, 0, 0, 1, 16, x, top, 1, 16);
      eg.globalAlpha = 0.5; eg.fillStyle = st.th.crest; eg.fillRect(x, top, 1, 1); eg.globalAlpha = 1;
      // below the cached band the page background (painted by the main canvas) is already the right water colour
    }
    // depth ruler: a thin faint line near the right edge, small labels
    const lx = EW - 14, y0 = Math.max(0, Math.round(wyCss));
    eg.globalAlpha = 0.22; eg.fillStyle = '#8fa6ff'; eg.fillRect(lx, y0, 1, EH - y0);
    eg.globalAlpha = 0.35;
    for (let k = 0; ; k++) {
      const y = Math.round(wyCss + k * rulerStep); if (y >= EH) break; if (y < 0) continue;
      const major = k % 4 === 0;
      eg.fillRect(lx - (major ? 6 : 3), y, major ? 6 : 3, 1);
      if (major && st.scale > 3) { const label = k === 0 ? '0m' : `-${(k / 4) * 100}m`; text(eg, label, lx - 10 - label.length * 8, y + (k === 0 ? 4 : -5), '#8fa6ff', 2); }
    }
    eg.globalAlpha = 1;
  }

  /* A dark silhouette with one pink light that blinks every ~2.6 s; it rides the swell. */
  function drawBuoy(cxCanvas, wyCanvasSurface, T, reduced) {
    const x = Math.round(cxCanvas), y = Math.round(wyCanvasSurface) + 1;
    const col = '#0c0a1e';
    rect(g, x - 8, y - 2, 16, 3, col); rect(g, x - 7, y - 3, 14, 1, col); rect(g, x - 9, y - 4, 4, 2, col);   // hull
    rect(g, x - 3, y - 8, 7, 5, col); rect(g, x + 3, y - 15, 1, 7, col);                                        // cabin + mast
    const on = reduced ? true : (T % 2.6) < 1.1;
    if (on) rect(g, x + 2, y - 17, 3, 2, '#ff4fa3');
  }

  function frame(still) {
    if (st.play) return framePlay();
    const { W, H, water, th, t, scale } = st;
    const reduced = isReduced();
    g.clearRect(0, 0, W, H);
    g.drawImage(base, 0, 0);
    const T = reduced ? 0 : t;
    drawSky(T, 0, water, reduced);

    // a few tiny, dim fish and very rare bubbles
    for (const f of st.fish) {
      const span = W + 30; const x = ((f.x + T * f.v) % span + span) % span - 15;
      g.globalAlpha = 0.25;
      if (sw(f.name)) sprite(g, f.name, x, f.y, 1); else drawFishShape(g, Math.round(x), Math.round(f.y), f.v > 0 ? 1 : -1, '#4a3fb0', f.big);
      g.globalAlpha = 1;
    }
    for (const b of st.bubbles) {
      const depth = H - water;
      const y = water + 8 + (((b.y - water - T * b.v) % depth) + depth) % depth;
      const x = b.x + (reduced ? 0 : Math.round(Math.sin(T * 1.2 + b.ph)));
      g.globalAlpha = 0.25; rect(g, x, y, 1, 1, '#9fb4e8'); g.globalAlpha = 1;
    }

    // the buoy, left of the column, riding the swell
    const bx = (st.opts.getVermiX ? st.opts.getVermiX() : W * scale * 0.5 - 100);
    drawBuoy(bx / scale, (st.wyCss + swell(bx, T)) / scale, T, reduced);
    drawEdge(st.wyCss, T, 6 * scale);
  }

  /* ------------------------------------------------ play mode: the camera sinks with the run ---------- */
  const TIER_RGB = { none: '#8d86b8', common: '#3d7bff', uncommon: '#b44dff', rare: '#ff4fa3', mythic: '#5ee0ff' };
  function framePlay() {
    const { W, H, water: water0, th } = st;
    const reduced = isReduced(); const T = reduced ? 0 : st.t; const now = performance.now();
    if (st.camTween) {
      const tw = st.camTween; const prog = (now - tw.t0) / 800;
      if (prog >= 1 || reduced) { st.cam = tw.to; st.camTween = null; }
      else st.cam = tw.from + (tw.to - tw.from) * (0.5 - 0.5 * Math.cos(Math.PI * prog));   // eased, continuous
    }
    // --- the dive: wind-up, plunge (camera follows, easeOutCubic in steps), landing ---
    const dv = st.dive; let dph = null, dp = 0;
    if (dv) {
      const e = now - dv.t0;
      if (e < WIND) { dph = 'wind'; dp = e / WIND; st.cam = dv.fromPx; }
      else if (e < WIND + dv.dur) {
        dph = 'dive'; dp = (e - WIND) / dv.dur;
        const ez = dp < 0.5 ? 4 * dp * dp * dp : 1 - Math.pow(-2 * dp + 2, 3) / 2;
        st.cam = dv.fromPx + (dv.toPx - dv.fromPx) * ez;
      } else if (e < WIND + dv.dur + LAND) {
        dph = 'land'; dp = (e - WIND - dv.dur) / LAND; st.cam = dv.toPx;
        if (!dv.landed) { dv.landed = true; st.pulse = { tier: dv.tier, t0: now }; st.answered++; dv.onLand && dv.onLand(); }
      } else { st.cam = dv.toPx; st.dive = null; if (dv.onProgress) dv.onProgress(dv.toM); st.depthM = dv.toM; if (!dv.landed && dv.onLand) dv.onLand(); if (dv.onDone) dv.onDone(); }
      if (st.dive && dv.onProgress) dv.onProgress(st.cam / PX_PER_M);
    }
    if (st.rivalTween) {
      const rt = st.rivalTween, rp = Math.min(1, (now - rt.t0) / rt.ms);
      st.rival = Math.round(rt.from + (rt.to - rt.from) * (1 - Math.pow(1 - rp, 3)));
      if (rp >= 1) st.rivalTween = null;
    }
    const camVel = st.cam - (st.prevCam == null ? st.cam : st.prevCam); st.prevCam = st.cam;
    const cam = st.cam, wy = water0 - cam, shift = wy - water0;
    const depthM = cam / PX_PER_M;
    const bob = reduced ? 0 : Math.round(Math.sin(T * 1.7) * 2);
    const narrow = W < 200;
    const vx = Math.max(0, Math.round((narrow ? 22 : 214) / st.scale) - 8);   // the mascot is 64 px (16 canvas px) at x 214 (22 on phones)
    // idle: low on phones (clear of the card); during a dive: always 55% of the screen height, on every viewport
    const idleY = Math.round(H * (narrow ? 0.67 : 0.62) - 8 + (narrow ? 0 : Math.min(12, st.answered * 2))), diveY = Math.round(H * 0.55) - 8;
    const baseY = dph === 'wind' ? Math.round(idleY + (diveY - idleY) * dp) : dph ? diveY : idleY;
    g.clearRect(0, 0, W, H);
    g.save();
    if (dph === 'land' && dv.tier === 'mythic' && !reduced) g.translate(Math.floor(dp * 8) % 2 ? 1 : -1, Math.floor(dp * 8) % 3 === 0 ? 1 : 0);   // small shake for ONE IN A VERMILLION

    // sky (attached to the waterline, so it scrolls off the top as we sink); the swell layer paints the water over its lower edge
    const seamY = wy + Math.floor((EDGE - 2) / st.scale);
    for (let y = Math.max(0, wy - water0); y < Math.min(H, seamY); y++) rect(g, 0, y, W, 1, lerpStops(th.sky, Math.min(1, (y - (wy - water0)) / Math.max(1, water0 - 1))));
    for (let y = Math.max(0, seamY); y < H; y += 2) rect(g, 0, y, W, 2, waterAt(y * st.scale - wy * st.scale));
    if (wy > -40) drawSky(T, shift, wy, reduced);

    // faint light rays, fading with depth
    const rayA = Math.max(0, 1 - cam / 260);
    if (rayA > 0) for (let k = 0; k < 4; k++) {
      const bx = W * (0.1 + k * 0.24) + (reduced ? 0 : Math.sin(T * 0.4 + k) * 3);
      for (let y = Math.max(0, wy); y < Math.min(H, wy + 150); y += 2) {
        const t = (y - wy) / 150; g.globalAlpha = 0.04 * rayA * (1 - t); rect(g, bx + (y - wy) * 0.35, y, 8 + k * 2, 2, th.moon);
      }
    }
    g.globalAlpha = 1;

    // rarity gates (relative to where the dive started) + speed lines
    if (dv && st.dive !== null) {
      const gained = st.cam - dv.fromPx;
      GATES.forEach(([tier, offM], gi) => {
        const offPx = offM * PX_PER_M, y = Math.round(baseY + 14 + offPx - gained);
        const reach = offPx <= dv.toPx - dv.fromPx, col = TIER_RGB[tier];
        if (offM > 0 && !dv.passed.has(tier) && gained >= offPx) { dv.passed.add(tier); dv.flash = now; dv.flashCol = col; sfxPlay('gate', dv.passed.size - 1); }
        if (y < -8 || y > H + 2) return;
        const hot = dv.passed.has(tier) && now - dv.flash < 260 && dv.flashCol === col;
        g.globalAlpha = reach ? (hot ? 1 : 0.8) : 0.3;
        if (sw('gate-dash')) { const gw = sw('gate-dash').w; for (let x = 0; x < W; x += gw) tinted(g, 'gate-dash', x, y - 1, 1, 0, hot ? '#ffffff' : col); }
        else for (let x = 0; x < W; x += 6) rect(g, x, y, 4, hot ? 2 : 1, hot ? '#ffffff' : col);
        const label = TIER_INFO[tier].label.toUpperCase();
        rect(g, 2, y - 8, label.length * 4 + 1, 7, 'rgba(7,6,13,0.7)'); text(g, label, 3, y - 7, col);
        g.globalAlpha = 1;
      });
      if (dph === 'dive' && camVel > 1) for (let i = 0; i < 18; i++) {
        const l = st.glow[i], y = ((((l.y * 1.7 - cam * 1.6) % H) + H) % H);
        g.globalAlpha = 0.45;
        if (sw('speedline')) { const sl = st.speedImg || (st.speedImg = spriteCanvas('speedline', 1)); g.imageSmoothingEnabled = false; g.drawImage(sl, Math.round(l.x), y, sl.width, Math.round(sl.height * Math.min(2.4, 0.8 + camVel / 8))); }
        else rect(g, Math.round(l.x), y, 1, Math.min(22, 3 + camVel * 2), '#cfe9ff');
      }
      g.globalAlpha = 1;
    }

    // fish + bubbles (parallax wrap)
    for (const f of st.fish) {
      const span = W + 30; const x = ((f.x + T * f.v) % span + span) % span - 15;
      const y = (((f.y - cam * 0.7) % (H + 40)) + (H + 40)) % (H + 40) - 20;
      if (y < wy + 6) continue;
      g.globalAlpha = 0.25; if (sw(f.name)) sprite(g, f.name, x, y, 1); else drawFishShape(g, Math.round(x), Math.round(y), f.v > 0 ? 1 : -1, '#4a3fb0', f.big); g.globalAlpha = 1;
    }
    for (const b of st.bubbles) {
      const y = ((((b.y - T * b.v - cam * 0.9) % (H + 10)) + (H + 10)) % (H + 10)) - 5;
      if (y < wy + 4) continue;
      const x = b.x + (reduced ? 0 : Math.round(Math.sin(T * 1.4 + b.ph) * 1.5));
      g.globalAlpha = 0.25; rect(g, x, y, b.s, b.s, '#9fb4e8'); g.globalAlpha = 1;
    }
    // glowing particles in the deep
    const gl = Math.max(0, Math.min(1, (depthM - 1200) / 2400));
    if (gl > 0) for (let i = 0; i < Math.round(8 + gl * 40); i++) {
      const p = st.glow[i]; const y = ((((p.y - T * p.v - cam * 0.5) % H) + H) % H);
      const tw = reduced ? 1 : (Math.floor(T * 2 + p.ph) % 3) / 2;
      g.globalAlpha = (0.25 + 0.5 * tw) * Math.max(0.3, gl); rect(g, p.x, y, 2, 2, p.c);
      g.globalAlpha = 0.14 * Math.max(0.3, gl); rect(g, p.x - 2, y, 6, 2, p.c); rect(g, p.x, y - 2, 2, 6, p.c); g.globalAlpha = 1;
    }

    // waterline: the start buoy rides the swell; the swell + ruler are drawn on the 2 px layer
    if (wy > -10 && wy < H + 10) { const bxc = Math.round(W * 0.24); drawBuoy(bxc, wy + swell(bxc * st.scale, T) / st.scale, T, reduced); }
    drawEdge(wy * st.scale, T, 6 * st.scale);

    // Vermi (lower left), the rival, pulse + sparkles
    const drawVermi = (x, y, tint, a, sx = 1, sy = 1, pose = null) => {
      const ms = sw('mascot'); const k = 1;
      const c = st.vermiCanvas || (st.vermiCanvas = document.createElement('canvas')); c.width = 16 * k; c.height = 16 * k;
      const jg = c.getContext('2d');
      if (pose && sw(pose.name)) sprite(jg, pose.name, 0, 0, k, pose.frame);
      else if (ms) sprite(jg, 'mascot', 0, 0, k, reduced ? 0 : Math.floor(T * 1.4) % 2);
      else { jg.fillStyle = '#ff4fa3'; jg.fillRect(6, 4, 20, 14); }
      if (tint) { jg.globalCompositeOperation = 'source-atop'; jg.globalAlpha = a; jg.fillStyle = tint; jg.fillRect(0, 0, c.width, c.height); }
      g.imageSmoothingEnabled = false;
      const ga = g.globalAlpha; g.globalAlpha = ga * 0.9;
      g.drawImage(c, Math.round(x + 16 - 8 * sx), Math.round(y + 16 - 8 * sy), Math.round(16 * sx), Math.round(16 * sy));
      g.globalAlpha = ga;
    };
    if (st.rival != null) {
      const ry = baseY + Math.round(st.rival * PX_PER_M - st.depthM * PX_PER_M);
      if (ry > wy && ry < H) { g.globalAlpha = 0.9; drawVermi(Math.round(W * 0.32), ry + bob, '#5ee0ff', 0.55); g.globalAlpha = 1; }
    }
    let tint = null, ta = 0, sx = 1, sy = 1, yo = 0;
    const pl = st.pulse; const pt = pl ? (now - pl.t0) / 700 : 2;
    if (pl && pt < 1) { tint = TIER_RGB[pl.tier] || '#ff4fa3'; ta = 0.6 * (1 - Math.floor(pt * 4) / 4); }
    let pose = null;   // Luna's authored poses when present; otherwise the mascot stretched/squashed
    if (dph === 'wind') { if (sw('vermi-squash')) pose = { name: 'vermi-squash', frame: 0 }; else { sx = 1 + 0.25 * dp; sy = 1 - 0.25 * dp; } }
    else if (dph === 'dive') { if (sw('mascot-dive')) pose = { name: 'mascot-dive', frame: Math.floor(now / 120) % 2 }; else if (sw('vermi-dive')) pose = { name: 'vermi-dive', frame: Math.floor(now / 90) % 3 }; else { sx = 0.78; sy = 1.3; } }
    else if (dph === 'land') { const k = Math.min(3, Math.floor(dp * 4)); yo = [0, -4, -6, -2][k]; if (sw('vermi-land')) pose = { name: 'vermi-land', frame: Math.min(2, Math.floor(dp * 3)) }; else [sx, sy] = [[1.3, 0.7], [1.15, 0.88], [0.95, 1.08], [1, 1]][k]; }
    if (st.sad && now - st.sad.t0 < 1400) { tint = '#8d86b8'; ta = 0.55; sx = 1.1; sy = 0.85; yo = 4; if (sw('mascot')) pose = { name: 'mascot', frame: 3 }; }
    if (dv && dv.flash && now - dv.flash < 260) { tint = '#ffffff'; ta = 0.75; }
    // bubble trail streaming up from Vermi while diving
    if ((dph === 'dive' || (st.sad && now - st.sad.t0 < 500)) && !reduced) {
      const n = dph === 'dive' ? 2 : 1;
      for (let i = 0; i < n; i++) st.trail.push({ x: vx + 8 + Math.random() * 16, y: baseY + 6 + bob, vy: 2 + Math.max(0, camVel) * 0.5 + Math.random() * 2, life: 1, len: dph === 'dive' ? Math.min(10, 1 + camVel) : 1 });
    }
    st.trail = st.trail.filter((b) => { b.y -= b.vy; b.life -= 0.045; return b.life > 0 && b.y > -10; });
    for (const b of st.trail) { g.globalAlpha = Math.max(0, b.life) * 0.7; rect(g, Math.round(b.x), Math.round(b.y), 1 + (b.life > 0.5 ? 1 : 0), Math.max(1, Math.round(b.len)), '#cfe9ff'); }
    g.globalAlpha = 1;
    drawVermi(vx, baseY + bob + yo, tint, ta, sx, sy, pose);
    if (pl && pt < 1) {
      const col = TIER_RGB[pl.tier] || '#ff4fa3'; const step = Math.floor(pt * 4);
      if (sw('shockwave')) { g.globalAlpha = 0.9 - step * 0.15; tinted(g, 'shockwave', vx + 16 - 36, baseY + 14 + bob - 36, 3, step, col); g.globalAlpha = 1; }
      else for (let i = 0; i < 2; i++) { const r = 18 + (step + i) * 7; g.globalAlpha = 0.7 - step * 0.15; const cx = vx + 16, cy = baseY + 14 + bob; for (let a = 0; a < 24; a++) { const an = (a / 24) * Math.PI * 2; rect(g, cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.8, 2, 2, col); } }
      g.globalAlpha = 1;
      if (pl.tier === 'mythic') for (let i = 0; i < 10; i++) {
        const an = (i / 10) * Math.PI * 2 + 0.3, r = 14 + pt * 42, sx = vx + 16 + Math.cos(an) * r, sy = baseY + 14 + Math.sin(an) * r * 0.8 + bob;
        const c2 = ['#ffffff', '#5ee0ff', '#ff9ad5'][(i + step) % 3];
        rect(g, sx - 1, sy, 3, 1, c2); rect(g, sx, sy - 1, 1, 3, c2);
      }
    }

    // tier banner while landing
    if (dph === 'land' || (st.banner && dv == null && st.banner.static)) {
      const tier = dv ? dv.tier : st.banner.tier, label = TIER_INFO[tier].label.toUpperCase(), n = label.length;
      const sc = Math.max(1, Math.min(3, Math.floor((W * 0.9) / (4 * n)))), by = Math.round(H * 0.34), bw = 4 * n * sc, bx = Math.round((W - bw) / 2);
      const a = dph === 'land' ? (dp < 0.7 ? 1 : 1 - (dp - 0.7) / 0.3) : 1;
      g.globalAlpha = 0.6 * a; rect(g, 0, by - 4 * sc, W, 5 * sc + 8 * sc, '#07060d');
      g.globalAlpha = a; text(g, label, bx + sc, by + sc, '#07060d', sc); text(g, label, bx, by, TIER_RGB[tier], sc); g.globalAlpha = 1;
      if (tier === 'mythic') for (let i = 0; i < 6; i++) { const ph = ((dp || 0) * 3 + i / 6) % 1, ax = bx + (bw * (i + 0.5)) / 6, ay = by - 6 - ph * 10; rect(g, ax - 1, ay, 3, 1, '#ffffff'); rect(g, ax, ay - 1, 1, 3, '#ffffff'); }
    }
    g.restore();
  }

  const ctl = {
    relayout: layout,
    setDepth(m, { instant = false } = {}) {
      st.depthM = Math.max(0, m); const to = Math.round(st.depthM * PX_PER_M);
      if (instant || isReduced()) { st.cam = to; st.camTween = null; } else if (to !== st.cam) st.camTween = { from: st.cam, to, t0: performance.now() };
      frame();
    },
    pulse(tier) { st.pulse = { tier, t0: performance.now() }; st.answered++; frame(); },
    setRival(m, { ms = 0 } = {}) {
      if (ms > 0 && st.rival != null && !isReduced()) st.rivalTween = { from: st.rival, to: m, t0: performance.now(), ms }; else { st.rival = m; st.rivalTween = null; }
      frame();
    },
    /** Plunge from fromM to toM; the camera follows. Callbacks: onProgress(m) each frame, onLand() at the stop, onDone() after the landing banner. */
    dive({ fromM, toM, points, tier, onProgress, onLand, onDone }) {
      const now = performance.now(), dur = 700 + points * 18, fromPx = Math.round(fromM * PX_PER_M), toPx = Math.round(toM * PX_PER_M);
      st.camTween = null; st.cam = fromPx; st.depthM = toM; st.sad = null;
      const dv = { t0: now, dur, fromPx, toPx, fromM, toM, points, tier, landed: false, passed: new Set(), flash: 0, flashCol: null, onProgress, onLand, onDone };
      if (isReduced() || document.documentElement.classList.contains('easy-read')) {
        // no camera movement: show the final depth and the banner straight away
        st.cam = toPx; st.dive = null; st.pulse = null; st.answered++; st.banner = { tier, static: true };
        if (onProgress) onProgress(toM); if (onLand) onLand(); frame();
        setTimeout(() => { st.banner = null; frame(); if (onDone) onDone(); }, 700);
        return;
      }
      st.dive = dv; sfxPlay('dive'); frame();
    },
    skip() {
      const dv = st.dive; if (!dv) return false;
      const e = performance.now() - dv.t0, landStart = WIND + dv.dur;
      dv.t0 = performance.now() - (e < landStart ? landStart : landStart + LAND);   // jump to the landing / to the end
      frame(); return true;
    },
    /** Timeout or 0 points: no dive. Vermi droops and a little bloop of bubbles rises. */
    sad() { st.sad = { t0: performance.now() }; sfxPlay('bloop'); frame(); },
    get diving() { return !!st.dive; },
  };

  function tick(now) {
    if (st.stopped) return;
    st.raf = requestAnimationFrame(tick);
    if (document.hidden || isReduced()) return;
    if (now - st.last < 15) return;          // ~15 fps idle, ~30 fps while diving: stepped, pixel-y
    st.t += Math.min(0.1, (now - st.last) / 1000 || 0.016); st.last = now;
    frame();
  }

  layout();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
  if (ro) { ro.observe(host); st.observers.push(() => ro.disconnect()); }
  const mo = new MutationObserver(() => layout());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  st.observers.push(() => mo.disconnect());
  const onVis = () => { if (!document.hidden) st.last = performance.now(); };
  document.addEventListener('visibilitychange', onVis);
  st.observers.push(() => document.removeEventListener('visibilitychange', onVis));
  st.raf = requestAnimationFrame(tick);
  return ctl;
}

export function stopScene() {
  if (!S) return;
  S.stopped = true;
  cancelAnimationFrame(S.raf);
  S.observers.forEach((f) => { try { f(); } catch { /* ignore */ } });
  S.canvas.remove(); S.edge && S.edge.remove();
  S = null;
}
