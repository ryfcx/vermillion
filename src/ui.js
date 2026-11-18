// Vermillion v2 — UI rendering. All DOM lives here. Every string is set via textContent
// (never innerHTML), so player input and data files can't inject markup.

import { px, sfx, assets, hasSprite, createDisplay, displayKindFor, units, DISPLAYS, TIER_COLOR } from './displays.js';
import { href } from './router.js';
import { TIER_INFO, extremes } from './game.js';
import { startScene, stopScene } from './scene.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const TIER_SPRITE = { none: 'tierNone', common: 'tierCommon', uncommon: 'tierUncommon', rare: 'tierRare', mythic: 'tierMythic' };
const MODE_TITLE = { daily: 'Daily Descent', endless: 'Endless Descent', duel: 'Duel' };
const THEME_LABEL = { neon: 'Neon', midnight: 'Midnight', crt: 'CRT' };
const TIERS = ['common', 'uncommon', 'rare', 'mythic'];

function reducedMotion() {
  const c = document.documentElement.classList;
  return c.contains('reduce-motion') || c.contains('easy-read')
    || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function countUp(el, to, render, ms = 900) {
  if (reducedMotion() || to <= 0 || document.hidden) { el.textContent = render(to); return; }
  setTimeout(() => { el.textContent = render(to); }, ms + 60);   // rAF can be throttled in hidden panes
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = render(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Tiny markdown-lite renderer: paragraphs, "## " headings, "- " bullets, **bold**. */
function inline(text) {
  const out = [];
  text.split('**').forEach((part, i) => { if (part) out.push(i % 2 ? h('b', { text: part }) : part); });
  return out;
}
export function renderBody(body) {
  const frag = document.createDocumentFragment();
  let list = null;
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { list = null; continue; }
    if (line.startsWith('## ')) { list = null; frag.append(h('h2', { text: line.slice(3) })); continue; }
    if (/^[-*] /.test(line)) {
      if (!list) { list = h('ul'); frag.append(list); }
      list.append(h('li', {}, inline(line.slice(2))));
      continue;
    }
    list = null;
    frag.append(h('p', {}, inline(line)));
  }
  return frag;
}

export function createUI(root, on) {
  let packs = [];
  let P = null;           // play screen refs
  let page = null;        // current <main>
  let toastHost = null;
  let route = { name: 'home' };

  const packById = (id) => packs.find((p) => p.id === id);
  const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());

  /* ---------------------------------------------------------------- shell ---------- */
  function link(label, to, { icon, cls = 'nav-link', current } = {}) {
    return h('a', { class: cls, href: to, 'aria-current': current ? 'page' : false }, icon && px(icon, 2), label);
  }

  let drawerEl = null, scrimEl = null, stackEl = null, popEl = null, menuBtnEl = null, popOpen = false, drawerOpen = false;
  const icon = (name, fallback, scale = 2) => (hasSprite(name) ? px(name, scale) : h('span', { class: 'ico', 'aria-hidden': 'true', text: fallback }));

  function buildShell() {
    toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    const logo = hasSprite('logo') ? px('logo', 3) : null;
    const brand = h('a', { class: 'brand', href: href.home(), 'aria-label': 'Vermillion home' }, logo, h('span', { class: logo ? 'sr-only' : 'brand-text', text: 'VERMILLION' }));
    menuBtnEl = h('button', { class: 'sq-btn menu-trigger', type: 'button', 'aria-label': 'Open menu', 'aria-controls': 'drawer', 'aria-expanded': 'false', onclick: (e) => { e.stopPropagation(); toggleDrawer(); } }, icon('menu', '☰'));
    stackEl = h('div', { class: 'icon-stack', role: 'toolbar', 'aria-label': 'Sound and display settings' });
    const top = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' }, menuBtnEl, brand, h('span', { class: 'spacer' }), stackEl));
    scrimEl = h('div', { class: 'drawer-scrim', onclick: () => closeDrawer() });
    drawerEl = h('aside', { class: 'drawer', id: 'drawer', 'aria-label': 'Menu', 'data-open': 'false' });
    popEl = h('div', { class: 'settings-pop', id: 'settings-pop', role: 'dialog', 'aria-label': 'Settings', 'data-open': 'false' });
    page = h('main', { class: 'page', id: 'page', tabindex: '-1' });
    const footer = h('footer', { class: 'footer' }, h('div', { class: 'footer-inner' },
      h('div', {}, h('b', { text: 'Vermillion' }), ' — free, original and ad-free. No accounts. Your scores live only in this browser.'),
      h('div', { class: 'footer-links' }, link('About', href.about(), { cls: '' }), link('Guides', href.guides(), { cls: '' }), link('FAQ', href.faq(), { cls: '' }), link('Stats', href.stats(), { cls: '' }))));
    root.replaceChildren(top, page, footer, scrimEl, drawerEl, popEl, toastHost);
    renderDrawer();
    renderStack();
    document.addEventListener('click', (e) => {
      if (popOpen && !popEl.contains(e.target) && !e.target.closest('.settings-trigger')) closePop();
      const t = e.target.closest && e.target.closest('.btn, .sq-btn, .tool-btn, .drawer a, .mode-card, .pack-card a, .day-card, .descent-btn, .featured');
      if (t) sfx('click');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (drawerOpen) { closeDrawer(); menuBtnEl.focus(); }
      if (popOpen) { closePop(); stackEl.querySelector('.settings-trigger')?.focus(); }
    });
    window.addEventListener('hashchange', () => { closeDrawer(); closePop(); });
  }

  /* drawer: every route in one place, identical on every page */
  function renderDrawer() {
    const item = (label, to, ico) => h('a', { class: 'drawer-link', href: to, tabindex: drawerOpen ? 0 : -1 }, ico ? px(ico, 2) : h('span', { class: 'ico', text: '▸' }), h('span', { text: label }));
    drawerEl.replaceChildren(
      h('div', { class: 'drawer-head' }, h('span', { class: 'drawer-title', text: 'MENU' }),
        h('button', { class: 'sq-btn small', type: 'button', 'aria-label': 'Close menu', tabindex: drawerOpen ? 0 : -1, onclick: () => { closeDrawer(); menuBtnEl.focus(); } }, h('span', { class: 'ico', 'aria-hidden': 'true', text: '✕' }))),
      h('nav', { class: 'drawer-scroll', 'aria-label': 'Site' },
        h('div', { class: 'drawer-group', text: 'Play' }),
        item('Home', href.home(), null), item('Daily Descent', href.daily(), 'daily'), item('Endless Descent', href.endless(), 'endless'), item('Duel', href.duel(), 'duel'),
        h('div', { class: 'drawer-group', text: 'Themed packs' }),
        packs.map((p) => item(p.name, href.pack(p.id), p.icon)),
        item('All packs', href.packs(), 'archive'),
        h('div', { class: 'drawer-group', text: 'Explore' }),
        item('Archive', href.archive('daily'), 'archive'), item('My stats', href.stats(), 'stats'), item('History', href.history(), 'stats'),
        item('Guides', href.guides(), 'guides'), item('How to play', href.how(), null), item('FAQ', href.faq(), null), item('About', href.about(), null),
        h('div', { class: 'drawer-group', text: 'Settings' }),
        h('button', { class: 'drawer-link', type: 'button', tabindex: drawerOpen ? 0 : -1, onclick: () => { closeDrawer(); openPop(); } }, icon('gear', '⚙'), h('span', { text: 'Settings & display…' }))));
  }
  function openDrawer() {
    closePop(); drawerOpen = true; drawerEl.dataset.open = 'true'; scrimEl.dataset.open = 'true'; menuBtnEl.setAttribute('aria-expanded', 'true');
    drawerEl.querySelectorAll('a, button').forEach((n) => { n.tabIndex = 0; });
    setTimeout(() => drawerEl.querySelector('.drawer-link')?.focus(), 30);
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerOpen = false; drawerEl.dataset.open = 'false'; scrimEl.dataset.open = 'false'; menuBtnEl.setAttribute('aria-expanded', 'false');
    drawerEl.querySelectorAll('a, button').forEach((n) => { n.tabIndex = -1; });
  }
  function toggleDrawer() { drawerOpen ? closeDrawer() : openDrawer(); }

  /* right-hand icon stack: sound, settings, display theme */
  function renderStack(s = on.getSettings()) {
    if (!stackEl) return;
    stackEl.replaceChildren(
      h('button', { class: 'sq-btn', type: 'button', 'aria-pressed': String(!!s.sound), 'aria-label': `Sound ${s.sound ? 'on' : 'off'}`, title: s.sound ? 'Sound on' : 'Sound off', onclick: () => on.toggleSetting('sound') }, icon(s.sound ? 'soundOn' : 'soundOff', s.sound ? '♪' : '×')),
      h('button', { class: 'sq-btn settings-trigger play-hide', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(popOpen), 'aria-controls': 'settings-pop', 'aria-label': 'Settings', title: 'Settings', onclick: (e) => { e.stopPropagation(); popOpen ? closePop() : openPop(); } }, icon('gear', '⚙')),
      h('button', { class: 'sq-btn play-hide', type: 'button', 'aria-label': `Display theme: ${THEME_LABEL[s.theme] || 'Neon'}. Click to change.`, title: `Display: ${THEME_LABEL[s.theme] || 'Neon'}`, onclick: () => on.cycleTheme() }, icon('palette', '◐')));
    if (popOpen) renderPop(s);
  }
  function renderPop(s = on.getSettings()) {
    const sw = (key, label, hint) => h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!s[key]), onclick: () => on.toggleSetting(key) },
      h('span', { class: 'sw-box', 'aria-hidden': 'true' }), h('span', {}, h('b', { text: label }), h('small', { text: hint })));
    const vol = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round((s.volume ?? 0.6) * 100)), 'aria-label': 'Volume', oninput: (e) => { on.setSettings({ volume: Number(e.target.value) / 100 }); } });
    const themeBtn = (id) => h('button', { class: `btn small ${s.theme === id ? 'primary' : 'ghost'}`, type: 'button', 'aria-pressed': String(s.theme === id), onclick: () => on.setSettings({ theme: id }) }, THEME_LABEL[id]);
    popEl.replaceChildren(
      h('div', { class: 'pop-title', text: 'SETTINGS' }),
      sw('easyRead', 'Easy Read', 'Bigger, calmer type'),
      sw('reducedMotion', 'Reduce motion', 'Stills the scene and animations'),
      sw('sound', 'Sound', 'Chiptune effects'),
      h('label', { class: 'vol' }, h('b', { text: 'Volume' }), vol),
      h('div', { class: 'pop-group' }, h('b', { text: 'Display' }), h('div', { class: 'row' }, themeBtn('neon'), themeBtn('midnight'), themeBtn('crt'))));
  }
  function openPop() { closeDrawer(); renderPop(); popOpen = true; popEl.dataset.open = 'true'; stackEl.querySelector('.settings-trigger')?.setAttribute('aria-expanded', 'true'); }
  function closePop() { if (!popEl) return; popOpen = false; popEl.dataset.open = 'false'; stackEl?.querySelector('.settings-trigger')?.setAttribute('aria-expanded', 'false'); }

  function toolbar(extra) {
    return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Game tools' }, h('span', { class: 'spacer' }), extra);
  }

  function mount(...nodes) {
    stopPlay();
    root.classList.remove('is-home', 'is-play');
    page.className = 'page';
    page.replaceChildren(...nodes.flat(Infinity).filter((n) => n && n.nodeType));
    window.scrollTo(0, 0);
  }
  function stopPlay() {
    if (P && P.display) P.display.destroy();
    if (P && P.enter) document.removeEventListener('keydown', P.enter);
    P = null;
    if (!keepScene) { stopScene(); if (sceneHost) { sceneHost.remove(); sceneHost = null; sceneCtl = null; } }
  }
  function pageTitle(t) { document.title = t ? `${t} — Vermillion` : 'Vermillion — the rare-answer pixel trivia game'; }
  function toast(text) {
    if (!toastHost) return;
    const el = h('div', { class: 'toast-pop', text });
    toastHost.append(el);
    setTimeout(() => el.remove(), 2800);
  }
  function setRoute(r) {
    route = r;
    drawerEl?.querySelectorAll('a').forEach((x) => x.removeAttribute('aria-current'));
    const to = r.name === 'home' ? href.home() : { packs: href.packs(), guides: href.guides(), guide: href.guides(), how: href.how(), faq: href.faq(), about: href.about(), stats: href.stats(), history: href.history() }[r.name];
    if (to) drawerEl?.querySelector(`a[href="${to}"]`)?.setAttribute('aria-current', 'page');
  }

  /* ---------------------------------------------------------------- vermi ---------- */
  function vermi(scale = 12, frame = 0) {
    const c = px('mascot', scale);
    if (hasSprite('mascot') && frame) { try { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); assets.sprites.drawSprite(g, 'mascot', 0, 0, scale, frame); } catch { /* ignore */ } }
    c.style.width = ''; c.style.height = '';
    return c;
  }

  /* ---------------------------------------------------------------- generic pages ---------- */
  function showLoading(msg = 'Descending') {
    pageTitle('');
    mount(h('div', { class: 'loading' }, h('div', {}, h('div', { class: 'vermi' }, vermi(8)), h('p', {}, msg, h('span', { class: 'dots' }))))); 
  }
  function showError(message, retry, title = 'The abyss is not answering.') {
    mount(h('div', { class: 'box hi error-box', role: 'alert' },
      vermi(6, 2), h('h2', { text: title }), h('p', { text: message }),
      h('div', { class: 'actions' }, retry && h('button', { class: 'btn primary', onclick: retry }, 'Try again'), h('a', { class: 'btn ghost', href: href.home() }, 'Home'))));
  }
  function showNotFound() { pageTitle('Lost'); showError('That page sank without a trace.', null, 'Page not found'); }

  const statusPill = (r) => r
    ? h('span', { class: 'pill good' }, `Done · ${r.total} pts`)
    : h('span', { class: 'pill pink' }, 'New');

  /* ---------------------------------------------------------------- home ---------- */
  function showHome({ stats, dailyDone, dayKey, packDone = {}, guides = [], faq = [], featured, descent = 1 }) {
    pageTitle('');
    const modeCard = (icon, title, text, to) => h('a', { class: 'box mode-card', href: to }, px(icon, 3), h('div', {}, h('h3', { text: title }), h('p', { text })));
    const packCard = (p) => {
      const done = packDone[p.id];
      return h('article', { class: 'box pack-card' },
        h('div', { class: 'pc-head' }, px(p.icon, 3), h('div', {}, h('h3', { text: p.name }), h('div', { class: 'pc-meta' }, h('span', { class: 'pill', text: DISPLAYS[displayKindFor('pack', p.id)]?.title || 'Pack' }), statusPill(done)))),
        h('p', { text: p.blurb }),
        h('div', { class: 'pc-actions' },
          h('a', { class: 'btn small primary', href: href.pack(p.id) }, done ? 'Today ✓' : 'Today'),
          h('a', { class: 'btn small ghost', href: href.archive(p.id) }, 'Archive'),
          h('a', { class: 'btn small ghost', href: href.packPractice(p.id) }, 'Practice')));
    };
    const strat = guides.filter((g) => g.group === 'strategy').slice(0, 3);
    const teaser = h('div', { class: 'teaser' }, strat.map((g) =>
      h('div', { class: 'box' }, h('h3', { text: g.title }), h('p', { text: g.summary }), h('a', { class: 'btn small ghost', href: href.guide(g.slug) }, 'Read guide'))));
    const faqPrev = h('div', { class: 'faq-list' }, faq.slice(0, 4).map((f) => h('details', {}, h('summary', { text: f.q }), h('div', { class: 'ans', text: f.a }))));

    /* wordmark: Luna's `logo` sprite at the largest integer scale that fits */
    const logoDef = hasSprite('logo') ? assets.sprites.SPRITES.logo : null;
    const wordmark = h('h1', { class: 'wordmark', 'aria-label': 'Vermillion' });
    const fitLogo = () => {
      if (!wordmark.isConnected) { window.removeEventListener('resize', fitLogo); return; }
      if (!logoDef) { wordmark.replaceChildren(h('span', { class: 'wm-text', text: 'VERMILLION' })); return; }
      const avail = Math.min(window.innerWidth - (window.innerWidth < 560 ? 128 : 32), 720);   // leave room for the icon stack on phones
      const scale = Math.max(1, Math.min(8, Math.floor(avail / logoDef.w)));
      const c = px('logo', scale); c.style.width = `${logoDef.w * scale}px`; c.style.height = `${logoDef.h * scale}px`;
      wordmark.replaceChildren(c);
    };
    window.addEventListener('resize', fitLogo);

    /* how-to-play inline explainer */
    const steps = h('ol', { class: 'ts-steps', id: 'ts-steps', hidden: true },
      h('li', {}, h('b', { text: '1 · READ' }), ' Seven prompts a day, the same for everyone. Each names a category.'),
      h('li', {}, h('b', { text: '2 · TYPE' }), ' One answer, 20 seconds. Press Enter to dive.'),
      h('li', {}, h('b', { text: '3 · BE RARE' }), ' Correct answers score 1 to 100. The obvious ones score low; the rare ones score high.'),
      h('li', {}, h('b', { text: '4 · SINK' }), ' Points become metres. Your depth is your score.'));
    const howBtn = h('button', { class: 'ts-link', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ts-steps', onclick: () => {
      const open = steps.hidden; steps.hidden = !open; howBtn.setAttribute('aria-expanded', String(open)); howBtn.firstChild.textContent = open ? '▾ ' : '▸ ';
    } }, '▸ ', 'HOW TO PLAY');

    const featuredCard = featured && h('a', { class: 'featured', href: href.pack(featured.id), 'aria-label': `Today's featured pack: ${featured.name}. Play.` },
      h('span', { class: 'f-tab', text: "TODAY'S FEATURED PACK" }),
      h('span', { class: 'f-body' }, px(featured.icon, 4), h('span', { class: 'f-name', text: featured.name }),
        h('span', { class: 'f-go', text: packDone[featured.id] ? 'Done ✓' : 'Play →' })));

    // Inline 8x8 glyph sprites (Luna); until they land, fall back to the plain text character.
    const glyph = (name, ch) => (hasSprite(name) ? h('span', { class: `glyph${name === 'glyph-down' && downFlipped() ? ' flip' : ''}`, 'aria-hidden': 'true' }, px(name, 2)) : h('span', { class: 'glyph', 'aria-hidden': 'true', text: ch }));
    const startBtn = h('a', { class: 'descent-btn', href: href.daily() },
      h('span', { class: 'db-main' }, glyph('glyph-down', '▼'), h('span', { text: dailyDone ? "VIEW TODAY'S RESULT" : "START TODAY'S DESCENT" }), glyph('glyph-down', '▼')),
      dailyDone && h('span', { class: 'db-sub', text: `You reached ${fmt(dailyDone.depth)} m` }));

    const foot = h('div', { class: 'ts-foot' },
      h('span', { class: 'descent-no', text: `DESCENT #${descent}` }),
      h('div', { class: 'ts-btns' },
        h('a', { class: 'ts-btn', href: href.archive('daily'), 'aria-label': 'Archive' }, 'ARCHIVE', glyph('glyph-archive', '⟲')),
        h('a', { class: 'ts-btn', href: href.packs() }, 'THEMED PACKS'),
        h('a', { class: 'ts-btn', href: href.endless(), 'aria-label': 'Endless' }, 'ENDLESS', glyph('glyph-endless', '∞')),
        h('a', { class: 'ts-btn', href: href.duel(), 'aria-label': 'Duel' }, 'DUEL', glyph('glyph-duel', '⚔'))));

    /* Vermi sits on the waterline as a crisp DOM sprite (integer scale 6 desktop / 4 phones) */
    const vermiEl = h('div', { class: 'vermi-surface', 'aria-hidden': 'true' });
    let vermiTimer = 0, vermiFrame = 0;
    const placeVermi = () => {
      if (!vermiEl.isConnected) { window.removeEventListener('resize', placeVermi); clearInterval(vermiTimer); return; }
      const sc = window.innerWidth < 560 ? 4 : 6;
      const c = px('mascot', sc); c.style.width = `${16 * sc}px`; c.style.height = `${16 * sc}px`;
      // find the lowest painted row so the tentacle tips just dip under the waterline
      let low = 11;
      try { const d = assets.sprites.SPRITES.mascot; low = Math.max(...d.frames.slice(0, 2).map((f) => f.reduce((m, row, i) => (/[^.]/.test(row) ? i : m), 0))); } catch { /* keep default */ }
      vermiEl.style.setProperty('--vs', `${sc}px`);
      vermiEl.style.setProperty('--sink', `${(16 - low - 1) * sc - Math.round(sc * 0.6)}px`);
      vermiEl.replaceChildren(c);
      vermiEl._sc = sc;
      clearInterval(vermiTimer);
      vermiTimer = setInterval(() => {
        if (document.hidden || document.documentElement.classList.contains('reduce-motion')) return;
        vermiFrame = (vermiFrame + 1) % 2;
        try { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); assets.sprites.drawSprite(g, 'mascot', 0, 0, sc, vermiFrame); } catch { /* ignore */ }
      }, 900);
    };
    window.addEventListener('resize', placeVermi);

    const sky = h('div', { class: 'ts-sky' },
      vermiEl,
      wordmark,
      h('p', { class: 'tagline', 'aria-label': 'The Daily Descent' }, 'THE DAILY DESCENT'),
      h('p', { class: 'infoline', text: '7 prompts · 20 seconds · the rarer the answer, the deeper you sink' }));
    const water = h('div', { class: 'ts-water' },
      h('div', { class: 'ts-col' },
        h('div', { class: 'ts-links' }, howBtn, h('a', { class: 'ts-link', href: href.faq() }, 'FAQ')),
        steps, featuredCard, startBtn, foot));
    const screen = h('section', { class: 'title-screen', 'aria-label': 'Vermillion title screen' }, sky, water, h('div', { class: 'scanlines', 'aria-hidden': 'true' }));

    const deeper = h('div', { class: 'deeper' }, h('div', { class: 'deeper-inner' },
      stats && stats.runs > 0 && h('p', { class: 'statline' },
        h('span', {}, 'Runs ', h('b', { text: fmt(stats.runs) })), h('span', {}, 'Deepest ', h('b', { text: `${fmt(stats.bestDepth)} m` })), h('span', {}, 'Daily streak ', h('b', { text: fmt(stats.dailyStreak) }))),
      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { text: 'Modes' })),
        h('div', { class: 'mode-grid' },
          modeCard('endless', 'Endless Descent', 'Seven fresh prompts, as many runs as you like. We avoid recent repeats.', href.endless()),
          modeCard('duel', 'Duel', 'Play 7 prompts in 15 s each, send a link, and see who dives deeper. Same answer? Both halved.', href.duel()))),
      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { text: 'Themed packs' }), h('a', { class: 'btn small ghost', href: href.packs() }, 'See all packs')),
        h('div', { class: 'pack-grid' }, packs.map(packCard))),
      strat.length > 0 && h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { text: 'Dive smarter' }), h('a', { class: 'btn small ghost', href: href.guides() }, 'All guides')), teaser),
      faq.length > 0 && h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { text: 'Questions' }), h('a', { class: 'btn small ghost', href: href.faq() }, 'Full FAQ')), faqPrev)));

    mount(screen, deeper);
    root.classList.add('is-home');
    page.classList.add('home');
    fitLogo(); placeVermi();
    startScene(screen, { getWaterY: () => sky.offsetHeight, getVermiX: () => { const r = vermiEl.getBoundingClientRect(), hr = screen.getBoundingClientRect(); return r.left + r.width / 2 - hr.left; } });
  }

  function showPacks({ packDone = {}, counts = {} }) {
    pageTitle('Packs');
    mount(h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: '14 themed packs' }), h('h1', { text: 'Packs' })), h('a', { class: 'btn ghost', href: href.archive('daily') }, 'Daily archive')),
      h('p', { class: 'lead' }, 'Each pack has its own Daily challenge, an archive of every past day, and endless practice, all free. Every pack also has its own progress display.'),
      h('div', { class: 'pack-grid', style: 'margin-top:14px' }, packs.map((p) => h('article', { class: 'box pack-card' },
        h('div', { class: 'pc-head' }, px(p.icon, 3), h('div', {}, h('h3', { text: p.name }), h('div', { class: 'pc-meta' }, statusPill(packDone[p.id]), counts[p.id] != null && h('span', { class: 'pill', text: `${counts[p.id]} prompts` })))),
        h('p', { text: p.blurb }),
        h('p', { class: 'muted' }, `Progress: ${DISPLAYS[displayKindFor('pack', p.id)]?.title}, scored in ${DISPLAYS[displayKindFor('pack', p.id)]?.unit}.`),
        h('div', { class: 'pc-actions' }, h('a', { class: 'btn small primary', href: href.pack(p.id) }, 'Today'), h('a', { class: 'btn small ghost', href: href.archive(p.id) }, 'Archive'), h('a', { class: 'btn small ghost', href: href.packPractice(p.id) }, 'Practice'))))));
  }

  function showArchive({ target, days, status, today }) {
    const isDaily = target === 'daily';
    const pack = isDaily ? null : packById(target);
    pageTitle('Archive');
    const played = days.filter((d) => status[d]).length;
    const tab = (id, label, icon) => h('a', { class: `btn small ${id === target ? 'primary' : 'ghost'}`, href: href.archive(id), 'aria-current': id === target ? 'page' : false }, px(icon, 2), label);
    mount(
      h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Every day since launch' }), h('h1', { text: `${isDaily ? 'Daily' : pack?.name || target} archive` })),
        h('span', { class: 'pill cyan', text: `${played} of ${days.length} played` })),
      h('div', { class: 'tabs', role: 'navigation', 'aria-label': 'Archive type' }, tab('daily', 'Daily', 'daily'), packs.map((p) => tab(p.id, p.name, p.icon))),
      h('p', { class: 'muted' }, 'Each past day is a challenge of its own: your first play counts as that day’s result, replays are practice. All free, always.'),
      h('div', { class: 'archive-grid' }, days.map((d) => {
        const r = status[d];
        const to = isDaily ? href.daily(d) : href.pack(target, d);
        return h('a', { class: `day-card${r ? ' done' : ''}${d === today ? ' today' : ''}`, href: to },
          h('span', { class: 'd', text: d.slice(5) }), h('span', { class: 'muted', text: d.slice(0, 4) }),
          h('span', { class: 's', text: r ? `${isDaily ? fmt(r.depth) + ' m' : fmt(r.total) + ' pts'}` : d === today ? 'Today' : 'Not played' }));
      })));
  }

  function showStats({ stats, packsList }) {
    pageTitle('Stats');
    const s = stats;
    const stat = (v, l) => h('div', { class: 'stat' }, h('b', { text: v }), h('span', { text: l }));
    const tc = s.tierCounts || {};
    const totalAnswers = Object.values(tc).reduce((a, b) => a + b, 0) || 1;
    const barRow = (key) => h('div', { class: `bar-row tier-${key}` },
      h('span', { class: 'name' }, px(TIER_SPRITE[key], 1), TIER_INFO[key].label),
      h('div', { class: 'track' }, h('i', { style: `--w:${Math.round(((tc[key] || 0) / totalAnswers) * 100)}%` })),
      h('span', { class: 'val', text: fmt(tc[key] || 0) }));
    const perPack = packs.filter((p) => s.perPack && s.perPack[p.id]);
    mount(
      h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Saved only in this browser' }), h('h1', { text: 'Your depths' })), h('a', { class: 'btn ghost', href: href.history() }, 'Run history')),
      h('div', { class: 'stat-grid' },
        stat(fmt(s.runs), 'Runs'), stat(`${fmt(s.bestDepth)} m`, 'Deepest run'), stat(fmt(s.totalPoints), 'Total points'), stat(String(s.avgPoints || 0), 'Average points'),
        stat(fmt(s.dailyStreak), 'Daily streak'), stat(fmt(s.bestStreak), 'Best streak'), stat(fmt(s.mythicCount), 'Mythic answers'), stat(fmt(s.rareCount), 'Rare answers')),
      s.runs === 0 && h('p', { class: 'muted', style: 'margin-top:14px', text: 'No descents yet. The abyss is patient.' }),
      h('section', { class: 'section box' }, h('h2', { text: 'How rare are your answers?' }), h('div', { class: 'bars' }, ['none', ...TIERS].map(barRow))),
      h('section', { class: 'section box' }, h('h2', { text: 'Pack bests' }),
        perPack.length
          ? h('div', { class: 'hist-list' }, perPack.map((p) => h('div', { class: 'hist-item' }, px(p.icon, 2), h('div', {}, h('b', { text: p.name }), h('div', { class: 'when', text: `${s.perPack[p.id].runs} runs` })), h('div', { class: 'num', text: `${units(displayKindFor('pack', p.id), s.perPack[p.id].best).text}` }))))
          : h('p', { class: 'muted', text: 'Play a themed pack to see your best here.' })));
  }

  function showHistory({ runs, filter, onOpen }) {
    pageTitle('History');
    const tab = (id, label) => h('button', { class: `btn small ${filter === id ? 'primary' : 'ghost'}`, onclick: () => on.historyFilter(id) }, label);
    mount(
      h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Your last 50 runs' }), h('h1', { text: 'History' })), h('a', { class: 'btn ghost', href: href.stats() }, 'Stats')),
      h('div', { class: 'tabs' }, tab('all', 'All'), tab('daily', 'Daily'), tab('endless', 'Endless'), tab('duel', 'Duel'), tab('pack', 'Packs')),
      runs.length === 0 ? h('div', { class: 'box' }, h('p', { class: 'muted', text: 'Nothing here yet. Finish a run and it will show up.' }), h('a', { class: 'btn primary', href: href.endless() }, 'Start an Endless run'))
        : h('div', { class: 'hist-list' }, runs.map((r, i) => {
          const kind = displayKindFor(r.mode === 'pack' ? 'pack' : r.mode, r.packId);
          const pk = packById(r.packId);
          const title = r.mode === 'pack' ? `${pk?.name || r.packId}` : MODE_TITLE[r.mode] || r.mode;
          return h('button', { class: 'box hist-item', style: 'text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%', onclick: () => onOpen(i) },
            px(r.mode === 'pack' ? pk?.icon || 'archive' : r.mode, 2),
            h('div', {}, h('b', { text: title }), ' ', r.official ? h('span', { class: 'pill good', text: 'Official' }) : h('span', { class: 'pill', text: r.practice ? 'Practice' : 'Played' }),
              h('div', { class: 'when', text: `${r.dayKey || new Date(r.finishedAt).toISOString().slice(0, 10)} · ${new Date(r.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }),
              h('div', { class: 'mini' }, (r.answers || []).map((a) => h('i', { class: `t-${a.tier || tierName(a.points)}` })))),
            h('div', { class: 'num' }, units(kind, r.total).text));
        })));
  }
  function tierName(p) { return p <= 0 ? 'none' : p <= 20 ? 'common' : p <= 50 ? 'uncommon' : p <= 80 ? 'rare' : 'mythic'; }

  /* ---------------------------------------------------------------- content pages ---------- */
  function tierLegend() {
    return h('div', { class: 'tier-legend' }, ['common', 'uncommon', 'rare', 'mythic'].map((k) =>
      h('div', { class: `item tier-${k}` }, px(TIER_SPRITE[k], 2), h('div', {}, h('b', { text: TIER_INFO[k].label }), `${TIER_INFO[k].min}–${TIER_INFO[k].max} pts`))));
  }

  function showHow() {
    pageTitle('How to play');
    mount(h('div', { class: 'page-narrow', style: 'margin:0 auto' },
      h('span', { class: 'eyebrow', text: 'Two minutes to learn' }), h('h1', { text: 'How to play' }),
      h('ol', { class: 'steps', style: 'margin-top:20px' },
        h('li', {}, h('div', {}, h('b', { text: 'Read the prompt' }), 'Each run is 7 prompts. A prompt names a category: “a country ending in -stan”, “a word with no vowels but Y”, and so on.')),
        h('li', {}, h('div', {}, h('b', { text: 'Type one answer' }), 'You have 20 seconds per prompt (15 in a Duel). Press Enter to dive. If the answer isn’t in our bank you can try again while time remains.')),
        h('li', {}, h('div', {}, h('b', { text: 'Rare beats obvious' }), 'Every correct answer is worth 1–100 points. The first thing everyone thinks of scores least. Deep cuts carry you down.')),
        h('li', {}, h('div', {}, h('b', { text: 'Run out of time? Zero.' }), 'If the clock empties, that prompt scores 0. We show you what you could have said.')),
        h('li', {}, h('div', {}, h('b', { text: 'Read the feedback' }), 'After each answer you’ll see its rarity tier, a fun fact, deeper cuts and the most common answer. That is how you get better.'))),
      h('h2', { style: 'margin:26px 0 12px', text: 'Rarity tiers' }), tierLegend(),
      h('section', { class: 'section' }, h('h2', { text: 'Modes' }),
        h('div', { class: 'grid cols-2', style: 'margin-top:12px' },
          h('div', { class: 'box' }, h('h3', { text: 'Daily Descent' }), h('p', { text: 'The same 7 prompts for everyone each UTC day. One official attempt, plus unlimited practice. Depth: 1 point = 10 m.' })),
          h('div', { class: 'box' }, h('h3', { text: 'Endless Descent' }), h('p', { text: 'Fresh random prompts whenever you want them. We avoid ones you saw recently.' })),
          h('div', { class: 'box' }, h('h3', { text: 'Duel' }), h('p', { text: 'Play 7 prompts, then share your link. Your rival plays the same prompts in 15 s each. If you both give the same answer, both scores for that prompt are halved.' })),
          h('div', { class: 'box' }, h('h3', { text: 'Themed packs' }), h('p', { text: 'Fourteen packs, each with a Daily, an archive back to launch day, and practice. Each has its own progress display and units.' })))),
      h('section', { class: 'section box cyan' }, h('h2', { text: 'Good to know' }),
        h('ul', { class: 'prose' },
          h('li', { text: 'Hints are free. Revealing one never costs points, but it is marked on your results.' }),
          h('li', { text: 'Spelling is forgiving: small typos and common alternate names are accepted.' }),
          h('li', { text: 'Everything is free: no ads, no accounts, no locked packs or archive days.' }),
          h('li', { text: 'Easy Read makes the text larger, simplifies the font and switches off motion.' }))),
      h('div', { class: 'cta-row' }, h('a', { class: 'btn primary', href: href.endless() }, 'Try an Endless run'), h('a', { class: 'btn ghost', href: href.guides() }, 'Read the guides'))));
  }

  function showGuides({ guides }) {
    pageTitle('Guides');
    const groups = [['strategy', 'Strategy'], ['category', 'By category'], ['practice', 'Practice']];
    mount(h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Free, original guides' }), h('h1', { text: 'Guides' }))),
      h('div', { class: 'guide-groups' }, groups.map(([key, label]) => {
        const list = guides.filter((g) => g.group === key);
        return list.length > 0 && h('section', {}, h('h2', { style: 'margin-bottom:12px', text: label }),
          h('div', { class: 'pack-grid' }, list.map((g) => h('a', { class: 'box guide-card', href: href.guide(g.slug) }, h('h3', { text: g.title }), h('p', { text: g.summary })))));
      })));
  }
  function showGuide({ guide, prev, next }) {
    pageTitle(guide.title);
    mount(h('div', { class: 'page-narrow', style: 'margin:0 auto' },
      h('div', { class: 'crumbs' }, h('a', { class: 'btn small ghost', href: href.guides() }, '← Guides'), h('span', { class: 'pill', text: guide.group })),
      h('h1', { text: guide.title }),
      h('p', { class: 'lead muted', style: 'margin-top:12px', text: guide.summary }),
      h('article', { class: 'prose box', style: 'margin-top:14px' }, renderBody(guide.body)),
      h('div', { class: 'actions', style: 'margin-top:16px;justify-content:space-between' },
        prev ? h('a', { class: 'btn small ghost', href: href.guide(prev.slug) }, `← ${prev.title}`) : h('span'),
        next ? h('a', { class: 'btn small ghost', href: href.guide(next.slug) }, `${next.title} →`) : h('span')),
      h('div', { class: 'cta-row' }, h('a', { class: 'btn primary', href: href.endless() }, 'Practice this now'))));
  }
  function showFaq({ faq }) {
    pageTitle('FAQ');
    mount(h('div', { class: 'page-narrow', style: 'margin:0 auto' }, h('span', { class: 'eyebrow', text: 'Quick answers' }), h('h1', { text: 'FAQ', style: 'margin-bottom:18px' }),
      h('div', { class: 'faq-list' }, faq.map((f) => h('details', {}, h('summary', { text: f.q }), h('div', { class: 'ans', text: f.a })))),
      h('p', { class: 'muted', style: 'margin-top:18px' }, 'Still stuck? The ', h('a', { href: href.how() }, 'How to play'), ' page covers the basics.')));
  }
  function showAbout() {
    pageTitle('About');
    mount(h('div', { class: 'page-narrow', style: 'margin:0 auto' }, h('span', { class: 'eyebrow', text: 'About' }), h('h1', { text: 'About Vermillion' }),
      h('div', { class: 'prose', style: 'margin-top:18px' },
        h('div', { class: 'hero-art', style: 'min-height:140px' }, h('div', { class: 'vermi' }, vermi(9, 1))),
        h('p', {}, 'Vermillion is a rare-answer trivia game. You score by naming correct answers that few other people would think of, and every point pulls you deeper. It belongs to a genre of “pick something uncommon” word-and-trivia games, but every prompt, answer, line of copy, sprite and sound here is our own.'),
        h('h2', { text: 'Free, always' }), h('p', {}, 'No ads, no paywalls, no accounts, no locked modes. Every pack and archive day is open to everyone.'),
        h('h2', { text: 'Your data' }), h('p', {}, 'Scores, settings and history are saved only in your browser’s local storage. Nothing is sent anywhere. Clearing site data resets your stats.'),
        h('h2', { text: 'Made with' }), h('ul', {}, h('li', { text: 'Plain HTML, CSS and JavaScript: no frameworks, no build step.' }), h('li', { text: 'Pixel art and chiptune sound effects made in code.' }), h('li', { text: 'Fonts: Press Start 2P and VT323, both under the SIL Open Font License.' }), h('li', { text: 'Mascot: Vermi, a small glowing jellyfish who loves a deep cut.' })),
        h('div', { class: 'cta-row' }, h('a', { class: 'btn primary', href: href.daily() }, 'Play Daily'), h('a', { class: 'btn ghost', href: href.faq() }, 'FAQ')))));
  }

  /* ---------------------------------------------------------------- play: inside the scene ---------- */
  let sceneCtl = null, sceneHost = null, keepScene = false;
  // glyph-down must point down: if the sprite's widest row is at the bottom it is drawn as a ▲, so flip it
  const downFlipped = () => { try { const f = assets.sprites.SPRITES['glyph-down'].frames[0]; const n = (r) => (r.match(/[^.]/g) || []).length; const rows = f.filter((r) => n(r)); return n(rows[0]) < n(rows[rows.length - 1]); } catch { return false; } };
  const gdown = () => (hasSprite('glyph-down') ? h('span', { class: `glyph${downFlipped() ? ' flip' : ''}`, 'aria-hidden': 'true' }, px('glyph-down', 2)) : h('span', { class: 'glyph', 'aria-hidden': 'true', text: '▼' }));
  // pixel-notched card: border layer (.nb) + dark inner layer (.ni); the drop shadow lives on the wrapper
  const notch = (cls, ...kids) => h('div', { class: `nw ${cls || ''}` }, h('div', { class: 'nb' }, h('div', { class: 'ni' }, ...kids)));

  function ensurePlayScene(depthM, instant) {
    if (sceneHost) { stopScene(); sceneHost.remove(); }
    sceneHost = h('div', { class: 'scene-fixed', 'aria-hidden': 'true' });
    root.insertBefore(sceneHost, page);
    sceneCtl = startScene(sceneHost, { mode: 'play' });
    sceneCtl.setDepth(depthM, { instant: instant !== false });
  }

  function tween(el, to, render, ms = 800) {
    const from = el._v || 0; el._v = to;
    if (reducedMotion() || from === to || document.hidden) { el.textContent = render(to); return; }
    setTimeout(() => { el.textContent = render(to); }, ms + 60);
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = render(Math.round(from + (to - from) * (Math.floor(p * 8) / 8)));
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function hudFor(kind, total) {
    const u = units(kind, total);
    if (kind === 'trench' || kind === 'split') return { label: 'DEPTH', to: u.value, render: (n) => `${fmt(n)} m` };
    return { label: String(DISPLAYS[kind]?.unit || 'score').toUpperCase(), to: u.value, render: (n) => fmt(n) };
  }

  function beginPlay(meta, state) {
    stopPlay();
    root.classList.add('is-home', 'is-play');
    page.className = 'page play-page';
    const kind = meta.displayKind || displayKindFor(meta.mode, meta.packId);
    const mini = kind !== 'trench' && kind !== 'split';
    const rival = !!meta.rival;

    ensurePlayScene(0, true);

    const depthLabel = h('span', { class: 'hud-label', text: 'DEPTH' });
    const depthVal = h('span', { class: 'hud-val cyan', text: '0 m' });
    const rivalVal = h('span', { class: 'hud-rival', hidden: !rival }, 'RIVAL ', h('b', { text: '0 m' }));
    const scoreVal = h('span', { class: 'hud-val pink', text: '0' });
    const pips = h('div', { class: 'hud-pips', 'aria-hidden': 'true' });
    const count = h('div', { class: 'hud-count', 'aria-live': 'polite' });
    const hud = h('header', { class: 'hud', 'aria-label': 'Run status' },
      notch('hud-panel', depthLabel, depthVal, rivalVal),
      h('div', { class: 'hud-mid' }, pips, count),
      notch('hud-panel', h('span', { class: 'hud-label', text: 'SCORE' }), scoreVal));
    const miniHost = mini ? h('div', { class: 'hud-mini' }) : null;

    const modeBadge = h('div', { class: 'run-badges' },
      meta.official && h('span', { class: 'pill good', text: 'Official' }), meta.practice && h('span', { class: 'pill', text: 'Practice' }),
      meta.archive && h('span', { class: 'pill cyan', text: 'Archive day' }), meta.dayKey && h('span', { class: 'pill', text: meta.dayKey }));

    const cardSlot = h('div', { class: 'card-slot' });
    const stage = h('main', { class: 'stage', id: 'stage', tabindex: '-1' }, modeBadge, cardSlot);

    // bottom answer dock: ring timer, input, SINK button, thin timer bar
    const ringNum = h('span', { class: 'ring-num', 'aria-hidden': 'true' });
    const ring = h('div', { class: 'ring', 'aria-hidden': 'true' });
    const ringWrap = h('div', { class: 'ring-wrap', role: 'timer', 'aria-label': 'Time left' }, ring, ringNum);
    const input = h('input', {
      class: 'answer-input', type: 'text', id: 'answer', name: 'answer', placeholder: 'type one answer…', autocomplete: 'off', autocapitalize: 'none',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer', maxlength: '80', autofocus: true,
      onkeydown: (e) => { if (e.key.length === 1) sfx('type'); },
    });
    const timerFill = h('i');
    const timerBar = h('div', { class: 'dock-bar', 'aria-hidden': 'true' }, timerFill);
    const msg = h('div', { class: 'dock-msg', role: 'status', 'aria-live': 'polite' });
    const form = h('form', { class: 'dock', onsubmit: (e) => { e.preventDefault(); on.submit(input.value); } },
      msg,
      h('div', { class: 'dock-in' }, ringWrap, h('div', { class: 'dock-field' }, input, timerBar), h('button', { class: 'sink-btn', type: 'submit' }, 'SINK ', gdown())));

    page.replaceChildren(...[hud, miniHost, stage, form].filter(Boolean));
    window.scrollTo(0, 0);
    P = { meta, kind, hud, pips, count, depthLabel, depthVal, rivalVal, scoreVal, cardSlot, stage, ring, ringWrap, ringNum, timerFill, form, input, msg, hintBtn: null, hintBox: null, lastSecs: null, display: null, msgTimer: 0, enter: null };
    page.classList.toggle('has-mini', mini);

    if (mini) {
      const real = createDisplay(kind, miniHost);
      P.display = real;
    } else {
      // the scene IS the trench; this shim just keeps the old display API
      P.display = { update() {}, celebrate() {}, setRival() {}, destroy() {} };
    }
    if (rival) P.display.setRival(0);
    updateHud(state);
    showPrompt(state);
  }

  function updateHud(state, rivalPoints) {
    const hd = hudFor(P.kind, state.total);
    P.depthLabel.textContent = hd.label;
    tween(P.depthVal, hd.to, hd.render);
    tween(P.scoreVal, state.total, (n) => fmt(n));
    if (rivalPoints != null) P.rivalVal.querySelector('b').textContent = `${fmt(rivalPoints * 10)} m`;
  }

  function pipRow(state) {
    P.pips.replaceChildren(...Array.from({ length: state.count }, (_, i) => {
      const a = state.answers[i];
      return h('i', { class: `pip${i === state.index && state.phase === 'playing' ? ' cur' : ''}${a ? ` t-${a.tier}` : ''}` });
    }));
    P.count.textContent = `PROMPT ${state.index + 1} OF ${state.count}`;
  }

  const playCard = (cls, ...kids) => h('div', { class: `cardwrap ${cls || ''}` }, h('section', { class: 'pcard nb' }, h('div', { class: 'pc-in ni' }, ...kids)));

  function showPrompt(state) {
    if (!P) return;
    pipRow(state);
    P.lastSecs = null;
    if (P.enter) { document.removeEventListener('keydown', P.enter); P.enter = null; }
    const p = state.prompt;
    const hintBtn = h('button', { class: 'hint-btn', type: 'button', onclick: () => on.hint() }, hasSprite('hint') ? px('hint', 2) : h('span', { class: 'q', 'aria-hidden': 'true', text: '?' }), ' HINT');
    const hintBox = h('div', { class: 'hint-box', role: 'note', hidden: true });
    const card = playCard('prompt-card',
      h('div', { class: 'pc-label', text: `PROMPT ${state.index + 1} OF ${state.count}${p.category ? ` · ${String(p.category).toUpperCase()}` : ''}` }),
      h('h1', { class: `prompt-text${p.text.length > 140 ? ' xlong' : p.text.length > 90 ? ' long' : ''}`, text: p.text }),
      hintBox,
      h('div', { class: 'pc-foot' }, h('span', { class: 'rare-line' }, gdown(), ' the rarer the answer, the deeper you sink ', gdown()), hintBtn));
    P.cardSlot.replaceChildren(card);
    P.hintBtn = hintBtn; P.hintBox = hintBox;
    P.form.hidden = false;
    P.input.value = ''; P.input.disabled = false;
    P.msg.textContent = ''; P.msg.classList.remove('on');
    window.scrollTo(0, 0);
    updateTimer(state);
    P.input.focus({ preventScroll: true });
  }

  function showHint(text) {
    if (!P || !P.hintBox) return;
    P.hintBox.hidden = false;
    P.hintBox.textContent = `Hint: ${text}`;
    P.hintBtn.disabled = true;
    sfx('click');
    P.input && P.input.focus({ preventScroll: true });
  }

  function updateTimer(state) {
    if (!P) return;
    const frac = state.timeLimitMs ? Math.max(0, Math.min(1, state.remainingMs / state.timeLimitMs)) : 0;
    P.ring.style.setProperty('--f', (Math.ceil(frac * 24) / 24).toFixed(3));   // drains in 24 pixel-ish steps
    P.timerFill.style.width = `${frac * 100}%`;
    const secs = Math.ceil(state.remainingMs / 1000);
    if (P.lastSecs !== secs) {
      P.ringNum.textContent = String(secs);
      if (state.phase === 'playing' && secs <= 5 && secs > 0 && P.lastSecs != null) sfx('tick');
      P.lastSecs = secs;
    }
    P.ringWrap.classList.toggle('crit', state.phase === 'playing' && secs <= 5);
    P.form.classList.toggle('crit', state.phase === 'playing' && secs <= 5);
  }

  function showReject(kind) {
    if (!P || !P.msg) return;
    P.msg.textContent = kind === 'empty' ? 'Type an answer first.' : 'Not in our bank, so try another!';
    P.msg.classList.add('on');
    clearTimeout(P.msgTimer); P.msgTimer = setTimeout(() => P && P.msg.classList.remove('on'), 2800);
    P.input.classList.remove('shake'); void P.input.offsetWidth; P.input.classList.add('shake');
    if (kind === 'unknown') sfx('unknown');
    P.input.focus({ preventScroll: true });
    P.input.select();
  }

  function showResult(state, opts = {}) {
    if (!P) return;
    const r = state.last, kind = P.kind;
    pipRow(state);
    updateHud(state, opts.rivalPoints);
    P.display.update(state.total, state.maxPoints);
    if (opts.rivalPoints != null) { P.display.setRival(opts.rivalPoints); sceneCtl && sceneCtl.setRival(opts.rivalPoints * 10); }
    P.display.celebrate(r.tier);
    if (sceneCtl) { sceneCtl.pulse(r.timedOut ? 'none' : r.tier); sceneCtl.setDepth(state.total * 10); }
    sfx(r.timedOut ? 'timeout' : r.tier);
    updateTimer({ ...state, remainingMs: 0, phase: 'result' });
    P.form.hidden = true; P.msg.classList.remove('on');

    const u = units(kind, r.points);
    const lastOne = state.index + 1 >= state.count;
    const nextBtn = h('button', { class: 'sink-btn next-btn', id: 'next', type: 'button', onclick: () => { sfx('next'); on.next(); } }, lastOne ? 'SEE RESULTS ' : 'NEXT ', gdown());
    const ptsEl = h('span', { class: 'pts' }, h('span', { class: 'n' }, '0'), ' pts');
    const meters = Math.round(r.points * 10);
    const unitText = kind === 'trench' || kind === 'split' ? `+${fmt(meters)} m` : kind === 'arcade' ? `score +${fmt(u.value)}` : `${u.value > 0 ? '+' : ''}${fmt(u.value)} ${u.unit}`;
    const rv = r.reveal;
    const chip = (a) => h('span', { class: `chip${a.points > 80 ? ' mythic' : ''}` }, h('span', { text: a.name }), h('b', { text: `${a.points}` }));

    const sections = [
      h('div', { class: 'fb-top' },
        h('span', { class: 'tier-badge' }, r.timedOut ? 'Time’s up' : TIER_INFO[r.tier].label),
        r.category && h('span', { class: 'pill', text: r.category }),
        r.usedHint && h('span', { class: 'pill', text: 'Hint used' }),
        r.attempts > 0 && h('span', { class: 'pill', text: `${r.attempts} retr${r.attempts === 1 ? 'y' : 'ies'}` })),
    ];
    if (r.timedOut) {
      sections.push(h('div', { class: 'fb-answer', text: 'The dark swallowed that one.' }), h('p', { class: 'muted', text: 'No answer in time, so this prompt scores 0. Here are some rare answers you could have given:' }));
    } else {
      sections.push(
        h('div', { class: 'fb-answer', text: r.answerName }),
        h('div', { class: 'fb-points' }, ptsEl, h('span', { class: 'unit', text: `· ${unitText}` })),
        rv.rank != null && h('div', {}, h('div', { class: 'meter' }, h('i', { style: `--w:${Math.max(4, rv.rank)}%` })), h('div', { class: 'meter-label' }, h('span', { text: 'common' }), h('span', { text: rv.rarerThan != null ? `Rarer than ${rv.rarerThan} of the ${rv.totalAnswers} answers in our bank` : '' }), h('span', { text: 'rarest' }))));
    }
    if (!r.timedOut && r.note) sections.push(h('div', { class: 'fb-note' }, h('b', { text: 'About this answer' }), r.note));
    if (r.fact) sections.push(h('div', { class: 'fb-note fact' }, h('b', { text: 'Did you know?' }), r.fact));
    if (rv.deeper.length) {
      sections.push(h('div', {}, h('div', { class: 'fb-sub', text: r.timedOut ? 'Rarest answers' : 'Deeper cuts' }), h('div', { class: 'chips' }, rv.deeper.map(chip))));
    } else if (!r.timedOut) {
      sections.push(h('div', { class: 'fb-note', style: '--tier:var(--cyan)' }, h('b', { text: 'Deepest cut' }), 'You found the rarest answer we know for this prompt. Nobody goes deeper.'));
    }
    if (rv.commonest && !r.timedOut) {
      sections.push(h('div', {}, h('div', { class: 'fb-sub', text: 'Most common' }), r.answerName === rv.commonest.name ? h('p', { class: 'muted', text: 'You picked the most common answer. Safe, but shallow.' }) : h('div', { class: 'chips' }, chip(rv.commonest))));
    }
    sections.push(h('div', { class: 'fb-actions' }, h('span', { class: 'muted', text: `${rv.totalAnswers} answers in our bank` }), nextBtn));

    const fb = playCard(`feedback tier-${r.tier}`, h('div', { class: 'fb-body', 'aria-live': 'polite' }, sections));
    P.cardSlot.replaceChildren(fb);
    countUp(ptsEl.querySelector('.n'), r.points, (n) => `+${n}`, 700);
    // brief guard so a held Enter key can't skip the feedback screen; then Enter advances
    nextBtn.disabled = true;
    setTimeout(() => { nextBtn.disabled = false; nextBtn.focus({ preventScroll: true }); }, 350);
    P.enter = (e) => { if (e.key === 'Enter' && !e.repeat && !nextBtn.disabled && nextBtn.isConnected && document.activeElement !== nextBtn) { e.preventDefault(); nextBtn.click(); } };
    document.addEventListener('keydown', P.enter);
  }

  /* ---------------------------------------------------------------- results ---------- */
  function showRun(view) {
    const { run, promptOf, kind, meta = {}, stats, link, duel, nextPack, replay, canReplay, canChallenge } = view;
    const u = units(kind, duel ? duel.myTotal : run.total);
    pageTitle('Results');
    sfx(duel ? (duel.myTotal >= duel.theirTotal ? 'duelWin' : 'duelLose') : (replay ? 'click' : 'finish'));
    const valueEl = h('div', { class: 'value', 'aria-label': u.text });
    const banners = [];
    if (meta.newBest) banners.push(h('span', { class: 'pill pink', text: 'New personal best!' }));
    if (run.official) banners.push(h('span', { class: 'pill good', text: 'Official result' }));
    if (run.practice) banners.push(h('span', { class: 'pill', text: 'Practice (not official)' }));
    const body = [
      h('section', { class: 'box hi score-hero' },
        h('div', { class: 'label', text: replay ? `${meta.title || 'Run'} · ${run.dayKey || ''}` : `${meta.title || 'Your descent'} complete` }),
        valueEl,
        h('div', { class: 'sub', text: (kind === 'trench' || kind === 'split' ? `${fmt(duel ? duel.myTotal : run.total)} points · ${depthName((duel ? duel.myTotal : run.total) * 10)}` : `${fmt(run.total)} points`) + (duel ? ' after matching answers were halved' : '') }),
        h('div', { class: 'sqs', role: 'img', 'aria-label': 'Tier squares' }, run.answers.map((a) => h('span', { class: `sq t-${a.tier || tierName(a.points)}` }))),
        h('div', { class: 'chips', style: 'justify-content:center;margin-top:12px' }, banners)),
    ];
    // personal stats
    if (stats && !replay) {
      body.push(h('div', { class: 'stat-grid', style: 'margin-top:14px' },
        h('div', { class: 'stat' }, h('b', { text: `${fmt(stats.bestDepth)} m` }), h('span', { text: 'Personal best depth' })),
        h('div', { class: 'stat' }, h('b', { text: fmt(stats.dailyStreak) }), h('span', { text: 'Daily streak' })),
        h('div', { class: 'stat' }, h('b', { text: fmt(stats.runs) }), h('span', { text: 'Runs played' })),
        h('div', { class: 'stat' }, h('b', { text: fmt(run.answers.filter((a) => a.tier === 'rare' || a.tier === 'mythic').length) }), h('span', { text: 'Rare+ answers this run' }))));
    }
    if (duel) {
      const winner = duel.myTotal === duel.theirTotal ? 0 : duel.myTotal > duel.theirTotal ? 1 : -1;
      body.push(h('section', { class: 'box cyan duel-banner section' },
        h('h2', { text: winner === 1 ? 'You out-dove them!' : winner === -1 ? 'They dove deeper' : 'A dead heat' }),
        h('p', { class: 'muted', text: duel.collisions.length ? `${duel.collisions.length} matching answer${duel.collisions.length > 1 ? 's' : ''} halved both scores.` : 'No matching answers. Pure originality.' }),
        h('div', { class: 'duel-score' },
          h('div', { class: `side${winner === 1 ? ' win' : ''}` }, h('span', { text: 'You' }), h('b', { text: `${fmt(duel.myTotal * 10)} m` })),
          h('div', { class: 'vs', text: 'VS' }),
          h('div', { class: `side${winner === -1 ? ' win' : ''}` }, h('span', { text: 'Challenger' }), h('b', { text: `${fmt(duel.theirTotal * 10)} m` })))));
    }
    // table
    const rows = run.answers.map((a, i) => {
      const p = promptOf(a.promptId), ex = p ? extremes(p) : { rarest: null };
      const hit = duel && duel.collisions.includes(i);
      const theirA = duel && duel.theirAnswers[i];
      const cells = [
        h('td', {}, h('div', { text: `${i + 1}. ${p ? p.text : a.promptId}` }), h('div', { class: 'q', text: p?.category || '' })),
        h('td', {}, h('span', { class: `dot t-${a.tier || tierName(a.points)}` }), a.answerName || (a.timedOut ? 'No answer (timed out)' : a.input || 'No answer'), a.usedHint && h('span', { class: 'pill', style: 'margin-left:8px', text: 'hint' }), hit && h('div', { class: 'pill', style: 'margin-top:4px', text: 'same answer, halved' })),
        h('td', { class: 'num', text: duel ? `${duel.mine[i]}` : `${a.points}` }),
      ];
      if (duel) cells.push(h('td', {}, theirA?.answerName || 'No answer', h('div', { class: 'q', text: `${duel.theirs[i]} pts` })));
      else cells.push(h('td', { class: 'q', text: ex.rarest ? `${ex.rarest.name} (${ex.rarest.points})` : '' }));
      return h('tr', { class: hit ? 'collide' : '' }, cells);
    });
    body.push(h('section', { class: 'box section' },
      h('h2', { text: duel ? 'Head to head' : 'Prompt by prompt' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'rtable' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Prompt' }), h('th', { text: duel ? 'You' : 'Your answer' }), h('th', { text: 'Pts' }), h('th', { text: duel ? 'Challenger' : 'Rarest possible' }))),
        h('tbody', {}, rows)))));
    if (link) {
      const input = h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Duel link', onfocus: (e) => e.target.select() });
      body.push(h('section', { class: 'box cyan section' }, h('h2', { text: 'Challenge a friend' }), h('p', { class: 'muted', text: 'They play the same 7 prompts (15 s each). If you both give the same answer, both scores for that prompt are halved.' }),
        h('div', { class: 'linkbox' }, input, h('button', { class: 'btn small primary', onclick: () => on.copyLink(link) }, 'Copy link'))));
    }
    const toastLine = h('div', { class: 'toast', role: 'status' });
    P2.toast = toastLine;
    body.push(toastLine,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => on.share(run) }, px('share', 2), 'Share'),
        canReplay && h('button', { class: 'btn', onclick: () => on.playAgain() }, meta.replayLabel || 'Play again'),
        canChallenge && h('button', { class: 'btn cyan', onclick: () => on.challenge(run) }, px('duel', 2), 'Challenge a friend'),
        h('a', { class: 'btn ghost', href: href.home() }, 'Home')));
    if (nextPack) {
      body.push(h('section', { class: 'box section' }, h('div', { class: 'next-pack' }, px(nextPack.icon, 3),
        h('div', { style: 'flex:1;min-width:200px' }, h('h3', { text: `Next up: ${nextPack.name}` }), h('p', { class: 'muted', style: 'margin:6px 0 0', text: nextPack.blurb })),
        h('a', { class: 'btn primary', href: href.pack(nextPack.id) }, 'Try it'))));
    }
    const finalDepth = (duel ? duel.myTotal : run.total) * 10;
    keepScene = !!sceneCtl;                 // stay in the same scene, now at the run's final depth
    mount(h('main', { class: 'stage results-stage', id: 'stage', tabindex: '-1' }, playCard('results-card', body)));
    keepScene = false;
    root.classList.add('is-home', 'is-play');
    page.className = 'page play-page';
    if (sceneCtl) sceneCtl.setDepth(finalDepth); else ensurePlayScene(finalDepth, true);
    if (P2.toast) P2.toast = toastLine;
    const numSpan = h('span');
    valueEl.replaceChildren(numSpan);
    if (kind === 'arcade') countUp(numSpan, u.value, (n) => String(n).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1,$2'), 1200);
    else countUp(numSpan, u.value, (n) => `${fmt(n)}${u.unit ? ' ' + (u.value === 1 && DISPLAYS[kind].unit1 ? DISPLAYS[kind].unit1 : u.unit) : ''}`, 1200);
  }
  const P2 = { toast: null };
  function inlineToast(text) { if (P2.toast && P2.toast.isConnected) P2.toast.textContent = text; else toast(text); }
  function depthName(d) {
    return d <= 0 ? 'never left the surface' : d < 1000 ? 'sunlit shallows' : d < 2500 ? 'twilight zone' : d < 4500 ? 'midnight zone' : d < 6000 ? 'the trench' : 'hadal depths';
  }

  /* ---------------------------------------------------------------- settings sync ---------- */
  function applySettings(s = {}) {
    const el = document.documentElement;
    el.classList.toggle('easy-read', !!s.easyRead);
    el.classList.toggle('reduce-motion', !!s.reducedMotion);
    el.dataset.theme = s.theme || 'neon';
    renderStack(s);
  }

  function showInvite({ total, onAccept }) {
    pageTitle('Duel challenge');
    mount(h('div', { class: 'box hi error-box page-narrow', style: 'margin:30px auto' },
      vermi(8, 1), h('span', { class: 'eyebrow', text: 'Incoming duel' }), h('h2', { text: 'You’ve been challenged!' }),
      h('p', {}, 'Someone reached ', h('b', { text: `${fmt(total * 10)} m` }), ' on these 7 prompts. You get the same prompts with 15 seconds each. If you both give the same answer, both scores for that prompt are halved.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: onAccept }, 'Accept the duel'), h('a', { class: 'btn ghost', href: href.home() }, 'Not now'))));
  }
  function setPacks(list) { packs = list || []; if (drawerEl) renderDrawer(); }
  function init() { buildShell(); }

  return {
    init, setPacks, setRoute, applySettings, toast, inlineToast, showLoading, showError, showNotFound,
    showHome, showPacks, showArchive, showStats, showHistory, showHow, showGuides, showGuide, showFaq, showAbout,
    showInvite, beginPlay, showPrompt, updateTimer, showHint, showReject, showResult, showRun, stopPlay,
    get playing() { return !!P; },
    get playRefs() { return P; },
    TIER_COLOR,
  };
}
