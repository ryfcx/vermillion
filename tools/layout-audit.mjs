// Layout audit: loads every screen at several viewport sizes and reports
//   OVERFLOW  the page scrolls sideways
//   OFFSCREEN a visible control/text sticks out past the left/right edge
//   CLIPPED   text is cut off inside its box
//   OVERLAP   two unrelated visible elements cover each other
//   UNREACH   a control sits below the fold of a screen that can't scroll
//   HANG      the page's main thread is blocked, so nothing renders
// Usage: node tools/layout-audit.mjs [baseUrl] [--shots dir]
// Needs puppeteer-core (npm i puppeteer-core) and Google Chrome.
import puppeteer from 'puppeteer-core';

const base = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:8642/').replace(/\/?$/, '/');
const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORTS = [[1280, 800], [1024, 768], [768, 1024], [390, 844], [360, 640], [844, 390]];
const ROUTES = ['#/', '#/packs', '#/archive/daily', '#/stats', '#/history', '#/how-to-play', '#/guides', '#/faq', '#/about',
  '#/account', '#/leaderboard', '#/friends', '#/online', '#/play/daily/practice', '#/play/endless', '#/play/duel'];
// Extra UI states: [label, route, async (page) => {}]
const STATES = [
  ['menu-open', '#/', async (p) => { await clickFirst(p, ['[aria-label="Open menu"]', '.menu-btn', 'button[aria-label*="menu" i]']); }],
  ['settings-open', '#/', async (p) => { await clickFirst(p, ['[aria-label="Settings"]', '[aria-label*="settings" i]']); }],
  ['play-answered', '#/play/daily/practice', async (p) => {
    const sel = 'input[type="text"], input:not([type]), textarea';
    await p.waitForSelector(sel, { timeout: 4000 }).catch(() => {});
    await p.type(sel, 'zzzz', { delay: 10 }).catch(() => {}); await p.keyboard.press('Enter').catch(() => {});
    await sleep(600);
    await p.type(sel, 'apple', { delay: 10 }).catch(() => {}); await p.keyboard.press('Enter').catch(() => {});
    await sleep(1800);
  }],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickFirst(p, sels) {
  for (const s of sels) { const el = await p.$(s); if (el) { await el.click().catch(() => {}); await sleep(700); return; } }
}

function audit() {
  const W = innerWidth, H = innerHeight, out = [];
  const label = (e) => {
    const t = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('alt') || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    const cls = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${e.tagName.toLowerCase()}${cls}${t ? ` "${t}"` : ''}`;
  };
  const visible = (e) => {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return false;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    // content of a closed <details> is not painted (Chrome still reports a box for it)
    const det = e.closest('details'); if (det && !det.open && !e.closest('summary')) return false;
    for (let a = e; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; if (a.hasAttribute('hidden') || a.getAttribute('aria-hidden') === 'true' && a !== e && a.inert) return false; }
    return true;
  };
  // Visible box after clipping by overflow ancestors.
  const clipRect = (e) => {
    let r = e.getBoundingClientRect(); let { left, top, right, bottom } = r;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY)) {
        const q = a.getBoundingClientRect();
        left = Math.max(left, q.left); top = Math.max(top, q.top); right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom);
      }
    }
    return { left, top, right, bottom, w: right - left, h: bottom - top };
  };
  const hasOwnText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const isControl = (e) => e.matches('button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])');
  const all = [...document.body.querySelectorAll('*')].filter((e) => !['SCRIPT', 'STYLE', 'BR', 'OPTION'].includes(e.tagName));
  const items = all.filter((e) => {
    if (!visible(e)) return false;
    const r = e.getBoundingClientRect();
    if ((e.tagName === 'CANVAS' || e.tagName === 'IMG' || e.tagName === 'svg') && r.width * r.height > W * H * 0.25) return false; // backgrounds
    if (getComputedStyle(e).position === 'fixed' && r.width >= W - 1 && r.height >= H - 1) return false;             // full-screen layers
    return isControl(e) || hasOwnText(e) || ['CANVAS', 'IMG', 'svg', 'INPUT'].includes(e.tagName);
  });

  const doc = document.scrollingElement;
  if (doc.scrollWidth > W + 1) out.push(['OVERFLOW', `page is ${doc.scrollWidth}px wide in a ${W}px window`]);

  const canScrollY = doc.scrollHeight > H + 1 && getComputedStyle(document.body).overflowY !== 'hidden' && getComputedStyle(doc).overflowY !== 'hidden';
  for (const e of items) {
    const r = e.getBoundingClientRect(), c = clipRect(e);
    if (c.w <= 0 || c.h <= 0) continue; // fully clipped by a scroller: intentional
    if (r.right > W + 1 || r.left < -1) {
      // only if the overflowing part is actually painted (not clipped by an ancestor)
      if (c.right > W + 1 || c.left < -1) out.push(['OFFSCREEN', `${label(e)} spans x ${Math.round(r.left)}..${Math.round(r.right)} (window ${W})`]);
    }
    if (isControl(e) && r.top > H && !canScrollY && getComputedStyle(e).position !== 'fixed') out.push(['UNREACH', `${label(e)} at y ${Math.round(r.top)} but the screen can't scroll (h ${H})`]);
    if (hasOwnText(e) && e.childElementCount === 0) {
      const s = getComputedStyle(e);
      if ((e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis') ||
          (e.scrollHeight > e.clientHeight + 2 && /(hidden|clip)/.test(s.overflowY) && e.clientHeight > 0))
        out.push(['CLIPPED', `${label(e)} text ${e.scrollWidth}×${e.scrollHeight} in a ${e.clientWidth}×${e.clientHeight} box`]);
    }
  }
  // Overlaps: unrelated pairs whose painted boxes intersect, where one actually covers the other at that spot.
  const boxes = items.map((e) => ({ e, c: clipRect(e) })).filter((b) => b.c.w > 0 && b.c.h > 0);
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    // ignore siblings inside the same label/control (icon + text in one button)
    const ca = A.e.closest('button, a, label, summary'), cb = B.e.closest('button, a, label, summary');
    if (ca && ca === cb) continue;
    // An open menu/dialog layer is meant to sit over page content. It is only a problem
    // when it covers a fixed control (e.g. the corner buttons that open/close it).
    const LAYER = '.drawer, .drawer-scrim, [role="dialog"], dialog, [aria-modal="true"], .modal, .sheet';
    const la = A.e.closest(LAYER), lb = B.e.closest(LAYER);
    if (la !== lb) {
      const other = la ? B.e : A.e;
      const fixedCtl = isControl(other) && (() => { for (let x = other; x; x = x.parentElement) if (getComputedStyle(x).position === 'fixed') return true; return false; })();
      if (!fixedCtl) continue;
    }
    const ix = Math.min(A.c.right, B.c.right) - Math.max(A.c.left, B.c.left);
    const iy = Math.min(A.c.bottom, B.c.bottom) - Math.max(A.c.top, B.c.top);
    if (ix < 3 || iy < 3) continue;
    const cx = Math.max(A.c.left, B.c.left) + ix / 2, cy = Math.max(A.c.top, B.c.top) + iy / 2;
    if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
    const top = document.elementFromPoint(cx, cy);
    const hitsA = top && (A.e === top || A.e.contains(top)), hitsB = top && (B.e === top || B.e.contains(top));
    if (!hitsA && !hitsB) continue;
    const key = [label(A.e), label(B.e)].sort().join(' × ');
    if (seen.has(key)) continue; seen.add(key);
    out.push(['OVERLAP', `${label(A.e)} × ${label(B.e)} (${Math.round(ix)}×${Math.round(iy)}px at ${Math.round(cx)},${Math.round(cy)})`]);
  }
  return out;
}

const launch = () => puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'], protocolTimeout: 30000 });
let browser = await launch();
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(() => r('__HANG__'), ms))]);
let total = 0;
const jobs = [...ROUTES.map((r) => [r.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'home', r, null]), ...STATES];
for (const [w, h] of VIEWPORTS) {
  for (const [name, route, act] of jobs) {
    let page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    // fresh profile per page: no saved results, first-visit state
    await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(2200);
    if (act) await act(page);
    // A screen whose main thread never yields is the worst bug of all: nothing paints.
    let alive = await withTimeout(page.evaluate(() => 1).catch(() => '__HANG__'), 5000);
    if (alive === '__HANG__') {
      // Retry once in a fresh browser: a busy machine (other Chrome instances) can stall one page.
      await page.close().catch(() => {}); await browser.close().catch(() => {}); browser = await launch();
      page = await browser.newPage(); await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await sleep(2200); if (act) await act(page);
      alive = await withTimeout(page.evaluate(() => 1).catch(() => '__HANG__'), 8000);
    }
    let issues;
    if (alive === '__HANG__') {
      issues = [['HANG', 'the page stopped responding (an endless loop blocks the browser, so nothing is drawn)']];
      await browser.close().catch(() => {}); browser = await launch();
    } else {
      issues = await withTimeout(page.evaluate(audit), 20000).catch((e) => [['ERROR', e.message]]);
      if (issues === '__HANG__') issues = [['HANG', 'the page stopped responding during the audit']];
      if (shots) await withTimeout(page.screenshot({ path: `${shots}/${name}-${w}x${h}.png` }).catch(() => {}), 8000);
    }
    if (issues.length) {
      console.log(`\n${w}x${h}  ${name}  (${route})`);
      for (const [k, m] of issues) console.log(`  ${k.padEnd(9)} ${m}`);
      total += issues.length;
    }
    await page.close().catch(() => {});
  }
}
await browser.close();
console.log(`\n${total} issue(s) across ${VIEWPORTS.length} sizes × ${jobs.length} screens`);
process.exit(total ? 1 : 0);
