// Vermillion v2 — UI rendering. All DOM lives here. Every string is set via textContent
// (never innerHTML), so player input and data files can't inject markup.

import { px, sfx, assets, hasSprite, createDisplay, displayKindFor, units, DISPLAYS, TIER_COLOR } from './displays.js';
import { href } from './router.js';
import { TIER_INFO, extremes } from './game.js';
import { startScene, stopScene } from './scene.js';
import { normalize } from './matcher.js';
import { ONLINE } from './config.js';

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
const MODE_TITLE = { daily: 'Daily Game', endless: 'Endless', duel: 'Duel' };
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
    chipEl = h('a', { class: 'acct-chip', href: href.account(), hidden: true });
    const top = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' }, menuBtnEl, brand, h('span', { class: 'spacer' }), chipEl, stackEl));
    scrimEl = h('div', { class: 'drawer-scrim', onclick: () => closeDrawer() });
    drawerEl = h('aside', { class: 'drawer', id: 'drawer', 'aria-label': 'Menu', 'data-open': 'false' });
    popEl = h('div', { class: 'settings-pop', id: 'settings-pop', role: 'dialog', 'aria-label': 'Settings', 'data-open': 'false' });
    page = h('main', { class: 'page', id: 'page', tabindex: '-1' });
    const footer = h('footer', { class: 'footer' }, h('div', { class: 'footer-inner' },
      h('div', {}, h('b', { text: 'Vermillion' }), ' — free, original and ad-free. An account is optional: solo games work offline and save in this browser.'),
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
      const ae = document.activeElement, typing = ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openDrawer(); return; }
      if (e.key !== 'Escape') return;
      if (drawerOpen) { closeDrawer(); menuBtnEl.focus(); }
      if (popOpen) { closePop(); stackEl.querySelector('.settings-trigger')?.focus(); }
    });
    window.addEventListener('hashchange', () => { closeDrawer(); closePop(); });
  }

  /* drawer: every route in one place, identical on every page, with live search */
  let content = { guides: [], faq: [] }, searchInput = null, searchBox = null, defaultNav = null, activeIdx = -1, searchIdx = [];

  const fold = (t) => normalize(t) || String(t || '').toLowerCase().trim();
  const foldChars = (t) => Array.from(String(t || '')).map((c) => (c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() || c)[0]);
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), prev2 = prev;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);   // swapped neighbours count as one typo
      }
      prev2 = prev; prev = cur;
    }
    return prev[n];
  }
  // 4 = substring of a title word, 3 = typo-close to a title word, 2/1 = same against the rest of the text, 0 = no match
  function tokenScore(t, e) {
    const tol = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0;
    const test = (words, hi, lo) => {
      if (words.some((w) => w.startsWith(t))) return hi + 1;
      if (words.some((w) => w.includes(t))) return hi;
      if (tol && words.some((w) => w.length >= 3 && (lev(t, w) <= tol || lev(t, w.slice(0, t.length + 1)) <= tol))) return lo;
      return 0;
    };
    return Math.max(test(e.titleWords, 4, 3), test(e.words, 2, 1));
  }
  function buildIndex() {
    const idx = [];
    const add = (group, title, sub, to, icon, extra = '') => {
      const words = (s) => fold(s).split(' ').filter(Boolean);
      idx.push({ group, title, sub, to, icon, titleWords: words(title), words: words(`${title} ${sub} ${extra}`) });
    };
    add('Modes', 'Daily Game', 'Seven questions, the same for everyone, once a day.', href.daily(), 'daily', 'daily today descent');
    add('Modes', 'Endless', 'Fresh questions, as many games as you like.', href.endless(), 'endless', 'endless practice descent');
    add('Modes', 'Duel', 'Send a link and see who scores more.', href.duel(), 'duel', 'duel challenge friend versus');
    for (const p of packs) add('Topics', p.name, p.blurb || '', href.pack(p.id), p.icon, `${p.id} pack packs topic themed ${DISPLAYS[displayKindFor('pack', p.id)]?.title || ''}`);
    for (const o of ONLINE_PAGES) { add('Online', o.title, o.sub, o.to, o.icon, o.extra); idx[idx.length - 1].disabled = !onlineUsable(); }
    add('Pages', 'All topics', 'Every topic in one place.', href.packs(), 'archive', 'packs themed');
    add('Pages', 'Past games', 'Play any earlier day since launch.', href.archive('daily'), 'archive', 'archive past days history calendar');
    add('Pages', 'My stats', 'Your depths, streaks and rarest answers.', href.stats(), 'stats', 'statistics scores streak');
    add('Pages', 'History', 'Your last 50 games.', href.history(), 'stats', 'runs games past results');
    add('Pages', 'Guides', 'Strategy and tips.', href.guides(), 'guides');
    add('Pages', 'How to play', 'Two minutes to learn.', href.how(), null, 'rules tutorial help');
    add('Pages', 'FAQ', 'Common questions.', href.faq(), null, 'questions help');
    add('Pages', 'About', 'What Vermillion is.', href.about(), null, 'credits free ads');
    for (const g of content.guides) add('Guides', g.title, g.summary || '', href.guide(g.slug), 'guides');
    for (const f of content.faq) add('FAQ', f.q, '', href.faq(), null);
    searchIdx = idx;
  }
  function search(q) {
    const tokens = fold(q).split(' ').filter(Boolean);
    if (!tokens.length) return null;
    const order = ['Modes', 'Online', 'Topics', 'Pages', 'Guides', 'FAQ'];
    const hits = [];
    for (const e of searchIdx) {
      let score = 0;
      for (const t of tokens) { const v = tokenScore(t, e); if (!v) { score = 0; break; } score += v; }
      if (score) hits.push({ e, score });
    }
    hits.sort((a, b) => order.indexOf(a.e.group) - order.indexOf(b.e.group) || b.score - a.score);
    return { tokens, groups: order.map((g) => [g, hits.filter((x) => x.e.group === g).slice(0, 8).map((x) => x.e)]).filter(([, l]) => l.length) };
  }
  function highlight(text, tokens) {
    const chars = Array.from(String(text || '')), f = foldChars(text).join('');
    const on = new Array(chars.length).fill(false);
    for (const t of tokens) { let i = f.indexOf(t); while (i >= 0) { for (let k = i; k < i + t.length; k++) on[k] = true; i = f.indexOf(t, i + 1); } }
    const out = []; let buf = '', mark = false;
    const flush = () => { if (buf) out.push(mark ? h('mark', { text: buf }) : buf); buf = ''; };
    chars.forEach((c, i) => { if (on[i] !== mark) { flush(); mark = on[i]; } buf += c; });
    flush();
    return out;
  }
  function renderResults() {
    const q = searchInput.value;
    const res = search(q);
    const box = drawerEl.querySelector('.drawer-results');
    activeIdx = -1;
    defaultNav.hidden = !!res; box.hidden = !res;
    if (!res) { box.replaceChildren(); return; }
    if (!res.groups.length) { box.replaceChildren(h('div', { class: 'sr-empty', role: 'status' }, h('b', { text: 'Nothing down here…' }), h('span', { text: 'Try a topic, a game mode, or a word like “streak”.' }))); return; }
    let n = 0;
    box.replaceChildren(...res.groups.flatMap(([g, list]) => [
      h('div', { class: 'm-label' }, h('span', { text: g.toUpperCase() }), h('i', { 'aria-hidden': 'true' })),
      ...list.map((e) => h(e.disabled ? 'span' : 'a', { class: `drawer-link result${e.disabled ? ' disabled' : ''}`, href: e.disabled ? false : e.to, id: `sr-${n++}`, role: 'option', 'aria-disabled': e.disabled ? 'true' : false },
        h('span', { class: 'sr-text' }, h('span', { class: 'sr-title' }, highlight(e.title, res.tokens), e.disabled && h('span', { class: 'pill', text: 'Offline' })), e.sub && h('span', { class: 'sr-sub' }, highlight(e.sub, res.tokens))))),
    ]));
    setActive(0);
  }
  function setActive(i) {
    const items = [...drawerEl.querySelectorAll('.drawer-results .result')];
    if (!items.length) return;
    activeIdx = (i + items.length) % items.length;
    items.forEach((el, k) => { el.classList.toggle('active', k === activeIdx); el.setAttribute('aria-selected', String(k === activeIdx)); });
    searchInput.setAttribute('aria-activedescendant', items[activeIdx].id);
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function renderDrawer() {
    // a quiet 2-column tile grid and a few link rows (Krillion-style); monochrome icons, tinted by the text colour
    const ico = (name, fallback) => (hasSprite(name) ? px(name, 1) : h('span', { class: 'ico', 'aria-hidden': 'true', text: fallback }));
    const tile = (label, to, name, fallback, extra = {}) => h(to ? 'a' : 'button', { class: `m-tile${extra.disabled ? ' disabled' : ''}`, ...(to ? { href: to } : { type: 'button', onclick: extra.onclick }), ...(extra.disabled ? { 'aria-disabled': 'true', title: extra.title } : {}), tabindex: drawerOpen ? 0 : -1 },
      h('span', { class: 'm-ico' }, extra.node || ico(name, fallback)), h('span', { class: 'm-lab', text: label }));
    const row = (title, sub, to, name, fallback, accent, arrow = '→', extra = '') => h('a', { class: `m-row ${accent} ${extra}`, href: to, tabindex: drawerOpen ? 0 : -1, onclick: () => closeDrawer() },
      h('span', { class: 'm-ico' }, ico(name, fallback)), h('span', { class: 'm-rt' }, h('b', { text: title }), h('small', { text: sub })), h('span', { class: 'm-arrow', 'aria-hidden': 'true', text: arrow }));
    const label = (t) => h('div', { class: 'm-label' }, h('span', { text: t }), h('i', { 'aria-hidden': 'true' }));
    searchInput = h('input', {
      class: 'drawer-search', type: 'search', placeholder: 'search…', 'aria-label': 'Search game modes, topics, pages, guides and FAQ', autocomplete: 'off', spellcheck: 'false',
      role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'drawer-results',
      oninput: renderResults,
      onkeydown: (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
        else if (e.key === 'Enter') { const el = drawerEl.querySelector('.drawer-results .result.active'); if (el && !el.classList.contains('disabled')) { e.preventDefault(); el.click(); } }
      },
    });
    searchBox = h('div', { class: 'drawer-searchbox' }, searchInput);
    const chargeNode = hasSprite('charge-idle') ? px('charge-idle', 1) : null;
    defaultNav = h('nav', { class: 'drawer-nav', 'aria-label': 'Site' },
      row('HOME', 'back to the title screen', href.home(), 'ico-daily', '⌂', 'cyan', '←', 'm-home'),
      label('PLAY'),
      h('div', { class: 'm-grid' },
        tile('Daily game', href.daily(), 'ico-daily', '▼'), tile('Endless', href.endless(), 'ico-endless', '∞'),
        tile('Depth charge', href.party(), 'ico-duel', '●', { node: chargeNode }),
        tile('Past games', href.archive('daily'), 'ico-past', '↺'), tile('Topics', href.packs(), 'ico-topics', '▦'),
        tile('My Vermillion', href.account(), 'ico-me', '☺'), tile('Friends', href.friends(), 'ico-friends', '☻'),
        tile('Settings', null, 'ico-gear', '⚙', { onclick: () => { closeDrawer(); openPop(); } }), tile('FAQ', href.faq(), 'ico-faq', '?')),
      h('div', { class: 'm-rows' },
        row('LEADERBOARD', "today's top scores", href.leaderboard(), 'ico-board', '▤', 'pink'),
        row('LIVE GAME', 'same 7 questions, same time', href.online(), 'ico-live', '⇄', 'cyan'),
        row('DUEL', 'challenge a friend with a link', href.duel(), 'ico-duel', '✕', 'pink', '↗'),
        row('HOW TO PLAY', 'the rules in 30 seconds', href.how(), 'ico-how', '▯', 'cyan'),
        row('PRIVACY', 'what we keep and why', href.about(), 'ico-privacy', '◇', 'pink')));
    drawerEl.replaceChildren(
      h('div', { class: 'drawer-head' }, h('div', {}, h('a', { class: 'm-eyebrow', href: href.home(), text: 'VERMILLION', tabindex: drawerOpen ? 0 : -1, onclick: () => closeDrawer() }), h('span', { class: 'm-title', text: 'MENU', 'data-t': 'MENU' })),
        h('button', { class: 'm-close', type: 'button', 'aria-label': 'Close menu', tabindex: drawerOpen ? 0 : -1, onclick: () => { closeDrawer(); menuBtnEl.focus(); } }, 'X')),
      searchBox,
      h('div', { class: 'drawer-scroll' }, defaultNav, h('div', { class: 'drawer-results', id: 'drawer-results', role: 'listbox', 'aria-label': 'Search results', hidden: true })));
    buildIndex();
    markCurrent();
  }
  function setContent(c) { content = { guides: c.guides || [], faq: c.faq || [] }; buildIndex(); }
  function openDrawer() {
    closePop(); drawerOpen = true; drawerEl.dataset.open = 'true'; scrimEl.dataset.open = 'true'; menuBtnEl.setAttribute('aria-expanded', 'true');
    drawerEl.querySelectorAll('a, button').forEach((n) => { n.tabIndex = 0; });
    setTimeout(() => { searchInput.focus(); searchInput.select(); }, 30);
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerOpen = false; drawerEl.dataset.open = 'false'; scrimEl.dataset.open = 'false'; menuBtnEl.setAttribute('aria-expanded', 'false');
    if (searchInput && searchInput.value) { searchInput.value = ''; renderResults(); }
    drawerEl.querySelectorAll('a, button').forEach((n) => { n.tabIndex = -1; });
  }
  function toggleDrawer() { drawerOpen ? closeDrawer() : openDrawer(); }

  /* right-hand icon stack: sound, settings, display theme */
  function renderStack(s = on.getSettings()) {
    if (!stackEl) return;
    stackEl.replaceChildren(
      h('button', { class: 'sq-btn', type: 'button', 'aria-pressed': String(!!s.sound), 'aria-label': `Sound ${s.sound ? 'on' : 'off'}`, title: s.sound ? 'Sound on' : 'Sound off', onclick: () => on.toggleSetting('sound') }, icon(s.sound ? 'soundOn' : 'soundOff', s.sound ? '♪' : '×')),
      h('button', { class: 'sq-btn settings-trigger play-hide', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(popOpen), 'aria-controls': 'settings-pop', 'aria-label': 'Settings', title: 'Settings', onclick: (e) => { e.stopPropagation(); popOpen ? closePop() : openPop(); } }, icon('gear', '⚙')),
      h('button', { class: 'sq-btn play-hide theme-btn', type: 'button', 'aria-label': `Display theme: ${THEME_LABEL[s.theme] || 'Neon'}. Click to change.`, title: `Display: ${THEME_LABEL[s.theme] || 'Neon'}`, onclick: () => on.cycleTheme() }, icon('palette', '◐')),
      h('a', { class: 'sq-btn acct-btn', href: href.account(), 'aria-label': A.user ? `Account: ${nameOf(A.profile)}` : 'Account', title: 'Account' }, avatarEl(A.user && A.available ? A.profile?.avatar : 'mascot')));
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
  /* open the popover to the LEFT of the gear button so the corner buttons stay visible and clickable */
  function placePop() {
    const b = stackEl && stackEl.querySelector('.settings-trigger');
    if (!b || !popEl) return;
    const r = b.getBoundingClientRect(), vw = window.innerWidth;
    popEl.style.left = 'auto'; popEl.style.right = `${Math.max(8, vw - r.left + 10)}px`; popEl.style.top = `${Math.max(8, r.top)}px`;
    popEl.style.maxWidth = `${Math.max(180, r.left - 18)}px`; popEl.style.maxHeight = `${Math.max(160, window.innerHeight - r.top - 12)}px`; popEl.style.overflowY = 'auto';
  }
  function openPop() { closeDrawer(); renderPop(); popOpen = true; popEl.dataset.open = 'true'; placePop(); stackEl.querySelector('.settings-trigger')?.setAttribute('aria-expanded', 'true'); }
  function closePop() { if (!popEl) return; popOpen = false; popEl.dataset.open = 'false'; stackEl?.querySelector('.settings-trigger')?.setAttribute('aria-expanded', 'false'); }

  function toolbar(extra) {
    return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Game tools' }, h('span', { class: 'spacer' }), extra);
  }

  function mount(...nodes) {
    stopPlay(); stopLive();
    root.classList.remove('is-home', 'is-play');
    root.classList.add('is-page');
    page.className = 'page';
    page.dataset.route = route?.name || '';
    // every inner page: a 40-px wordmark that links home, a 13-px sub line, then one centred column (CSS hides this on the title and game screens)
    const head = h('div', { class: 'pg-head' }, h('a', { class: 'pg-mark', href: href.home(), text: 'VERMILLION', 'aria-label': 'Vermillion home' }), h('p', { class: 'pg-sub', text: SUBS[curTitle] || String(curTitle || '').toLowerCase() }));
    page.replaceChildren(head, ...nodes.flat(Infinity).filter((n) => n && n.nodeType));
    window.scrollTo(0, 0);
  }
  function stopPlay() {
    if (P && P.display) P.display.destroy();
    if (P && P.enter) document.removeEventListener('keydown', P.enter);
    if (P && P.skipFn) { document.removeEventListener('keydown', P.skipFn); document.removeEventListener('pointerdown', P.skipFn); }
    P = null;
    if (!keepScene) hideScene();
  }
  let curTitle = '';
  const SUBS = { Topics: 'Topics · beyond the daily game' };
  function pageTitle(t) { curTitle = t || ''; document.title = t ? `${t} — Vermillion` : 'Vermillion — the rare-answer pixel trivia game'; }
  function toast(text) {
    if (!toastHost) return;
    const el = h('div', { class: 'toast-pop', text });
    toastHost.append(el);
    setTimeout(() => el.remove(), 2800);
  }
  function setRoute(r) { route = r; markCurrent(); }
  function markCurrent() {
    const r = route; if (!r) return;
    drawerEl?.querySelectorAll('a').forEach((x) => x.removeAttribute('aria-current'));
    const to = r.name === 'home' ? href.daily() : {  party: href.party(), packs: href.packs(), guides: href.guides(), guide: href.guides(), how: href.how(), faq: href.faq(), about: href.about(), stats: href.stats(), history: href.history(), account: href.account(), leaderboard: href.leaderboard(), friends: href.friends(), online: href.online() }[r.name];
    if (r.name === 'home') drawerEl?.querySelectorAll(`.m-home[href="${href.home()}"]`).forEach((x) => x.setAttribute('aria-current', 'page'));
    const cur = r.name === 'play' ? ({ daily: href.daily(), endless: href.endless(), duel: href.duel() })[r.mode] : to;
    if (cur) drawerEl?.querySelector(`a[href="${cur}"]`)?.setAttribute('aria-current', 'page');
  }

  /* ---------------------------------------------------------------- vermi ---------- */
  function vermi(scale = 12, frame = 0) {
    const c = px('mascot', scale);
    if (hasSprite('mascot') && frame) { try { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); assets.sprites.drawSprite(g, 'mascot', 0, 0, scale, frame); } catch { /* ignore */ } }
    c.style.width = ''; c.style.height = '';
    return c;
  }

  /* ---------------------------------------------------------------- generic pages ---------- */
  function showLoading(msg = 'Loading') {
    pageTitle('');
    mount(h('div', { class: 'loading' }, h('div', {}, h('div', { class: 'vermi' }, vermi(8)), h('p', {}, msg, h('span', { class: 'dots' }))))); 
  }
  function showError(message, retry, title = 'Something went wrong.') {
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
          h('a', { class: 'btn small ghost', href: href.archive(p.id) }, 'Past games'),
          h('a', { class: 'btn small ghost', href: href.packPractice(p.id) }, 'Practice')));
    };
    const strat = guides.filter((g) => g.group === 'strategy').slice(0, 3);
    const teaser = h('div', { class: 'teaser' }, strat.map((g) =>
      h('div', { class: 'box' }, h('h3', { text: g.title }), h('p', { text: g.summary }), h('a', { class: 'btn small ghost', href: href.guide(g.slug) }, 'Read guide'))));
    const faqPrev = h('div', { class: 'faq-list' }, faq.slice(0, 4).map((f) => h('details', {}, h('summary', { text: f.q }), h('div', { class: 'ans', text: f.a }))));

    const featuredCard = featured && h('a', { class: 'featured', href: href.pack(featured.id), 'aria-label': `Today's topic: ${featured.name}. Play.` },
      h('span', { class: 'f-tab', text: "TODAY'S TOPIC" }),
      h('span', { class: 'f-body' }, px(featured.icon, 4), h('span', { class: 'f-name', text: featured.name }),
        packDone[featured.id] ? h('span', { class: 'f-count', text: 'Done ✓' }) : h('span', { class: 'f-count', id: 'played-today', hidden: true })));

    // Inline 8x8 glyph sprites (Luna); until they land, fall back to the plain text character.
    const glyph = (name, ch) => (hasSprite(name) ? h('span', { class: `glyph${name === 'glyph-down' && downFlipped() ? ' flip' : ''}`, 'aria-hidden': 'true' }, px(name, 2)) : h('span', { class: 'glyph', 'aria-hidden': 'true', text: ch }));
    const startBtn = h('a', { class: 'descent-btn', href: href.daily() },
      h('span', { class: 'db-main' }, glyph('glyph-down', '▼'), h('span', { text: dailyDone ? "SEE TODAY'S SCORE" : "PLAY TODAY'S GAME" }), glyph('glyph-down', '▼')));

    const foot = h('div', { class: 'ts-foot' },
      h('span', { class: 'descent-no', text: `GAME #${descent}${stats?.dailyStreak > 0 ? ` · STREAK ${stats.dailyStreak}` : ''}` }),
      h('div', { class: 'ts-btns' },
        h('a', { class: 'ts-btn', href: href.archive('daily'), 'aria-label': 'Past games' }, 'PAST GAMES ', h('span', { 'aria-hidden': 'true', text: '⟲' })),
        h('a', { class: 'ts-btn', href: href.packs() }, 'TOPICS'),
        h('a', { class: 'ts-btn', href: href.endless(), 'aria-label': 'Endless' }, 'ENDLESS ', h('span', { 'aria-hidden': 'true', text: '∞' }))));

    /* Vermi the fish swims in the water, below the waterline (integer scale 4, cycles `mascot-idle`) */
    const vermiEl = h('div', { class: 'vermi-fish', 'aria-hidden': 'true' });
    let vermiTimer = 0, vermiFrame = 0;
    const fishSprite = () => (hasSprite('mascot-idle') ? 'mascot-idle' : 'mascot');
    const placeVermi = () => {
      if (!vermiEl.isConnected) { clearInterval(vermiTimer); return; }
      const name = fishSprite(), c = px(name, 4); c.style.width = '64px'; c.style.height = '64px';
      vermiEl.replaceChildren(c);
      clearInterval(vermiTimer);
    };

    /* wordmark: one VT323 span per letter on a gentle arc, with a pink/cyan split */
    const WORD = [...'VERMILLION'];
    const wordmark = h('h1', { class: 'wordmark', 'aria-label': 'Vermillion' }, WORD.map((c, i) =>
      h('span', { class: 'wm-l', 'aria-hidden': 'true', style: `--i:${i};--arc:${Math.round(7 * (1 - Math.sin(Math.PI * i / (WORD.length - 1))))}px`, text: c })));

    /* how-to-play inline explainer (collapsed by default) */
    const steps = h('ol', { class: 'ts-steps', id: 'ts-steps', hidden: true },
      h('li', {}, h('b', { text: '1 · READ' }), ' Seven questions a day, the same for everyone. Each one names a topic.'),
      h('li', {}, h('b', { text: '2 · TYPE' }), ' One answer, 20 seconds. Press Enter to submit.'),
      h('li', {}, h('b', { text: '3 · BE RARE' }), ' Correct answers score 1 to 100. The obvious ones score low; the rare ones score high.'),
      h('li', {}, h('b', { text: '4 · SCORE' }), ' Points become metres. Your depth is your score.'));
    const howBtn = h('button', { class: 'ts-link how', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ts-steps', onclick: () => {
      const open = steps.hidden; steps.hidden = !open; howBtn.setAttribute('aria-expanded', String(open)); howBtn.firstChild.textContent = open ? '▾ ' : '▸ ';
    } }, '▸ ', 'HOW TO PLAY');

    const stage = h('div', { class: 'ts-stage' },
      wordmark,
      h('p', { class: 'tagline', 'aria-label': 'The daily rare-answer game' }, 'THE DAILY RARE-ANSWER GAME'),
      h('p', { class: 'infoline', text: '7 questions · 25 seconds each · rarer answers score more' }),
      vermiEl,
      h('div', { class: 'ts-col' },
        h('div', { class: 'ts-howrow' }, howBtn), h('div', { class: 'ts-faqrow' }, h('a', { class: 'ts-link small', href: href.faq() }, 'FAQ')), steps,
        featuredCard, startBtn, foot));
    const screen = h('section', { class: 'title-screen', 'aria-label': 'Vermillion title screen' }, stage, h('div', { class: 'scanlines', 'aria-hidden': 'true' }));

    mount(screen);
    root.classList.add('is-home');
    page.classList.add('home');
    placeVermi();
    ensureScene('title', {
      // the lower column is anchored to the bottom; the swell sits 18 px (at its lowest) above the HOW TO PLAY row
      getWaterY: () => {
        const how = stage.querySelector('.ts-howrow'), hr = screen.getBoundingClientRect();
        const y = how ? how.getBoundingClientRect().top - hr.top - 26 : screen.clientHeight * 0.55;
        screen.style.setProperty('--wy', `${Math.round(y)}px`);
        return y;
      },
      // the buoy sits on the waterline, left of the column
      getVermiX: () => { const col = stage.querySelector('.ts-col'), hr = screen.getBoundingClientRect(); const cl = col ? col.getBoundingClientRect().left - hr.left : 100; return window.innerWidth <= 560 ? hr.width * 0.2 : Math.max(60, cl - 56); },
    });
  }
  /** "N played today": only ever a real count (leaderboard rows), never an invented number. */
  function setPlayedToday(n) {
    const el = root.querySelector('#played-today');
    if (!el || !(n > 0)) return;
    el.hidden = false; el.replaceChildren(h('i', { 'aria-hidden': 'true' }), `${fmt(n)} played today`);
  }

  function showPacks({ packDone = {} }) {
    pageTitle('Topics');
    const short = (t) => { const x = String(t || '').split(/[.;:]/)[0].trim(); return x.length > 46 ? `${x.slice(0, 44).trim()}…` : x; };
    const cards = packs.map((p, i) => {
      const accent = i % 2 ? 'var(--cyan)' : 'var(--pink)', n = Array.isArray(p.chapters) ? p.chapters.length : 0;
      const art = hasSprite(`banner-${p.id}`) ? px(`banner-${p.id}`, 4) : h('div', { class: 'tp-ph' });
      return h('a', { class: 'tp-card', href: href.topic(p.id), style: `--ac:${accent}` },
        h('div', { class: 'tp-art' }, art, packDone[p.id] && h('span', { class: 'tp-chip', text: 'DONE' })),
        h('div', { class: 'tp-body' }, h('h2', { class: 'tp-name', text: p.name }),
          h('p', { class: 'tp-tag', text: `${n ? `${n} chapters · ` : ''}${short(p.blurb)}` }),
          h('div', { class: 'tp-rule', 'aria-hidden': 'true' }), h('span', { class: 'tp-cta', text: 'START THE TOPIC →' })));
    });
    mount(h('div', { class: 'tp-list' }, cards),
      h('div', { class: 'm-label' }, h('span', { text: 'THE LOGBOOK' }), h('i', { 'aria-hidden': 'true' })),
      h('a', { class: 'm-row cyan', href: href.archive('daily') }, h('span', { class: 'm-rt' }, h('b', { text: 'PAST GAMES ⟲' }), h('small', { text: 'Every past daily game, replayable.' }))),
      h('a', { class: 'tp-back', href: href.daily(), text: "← TODAY'S GAME" }));
  }

  /** A topic's chapter map: ten (or more) numbered chapters, each unlocked by finishing the one before. */
  function showTopic({ pack, progress, doneToday }) {
    pageTitle(pack.name);
    const n = Array.isArray(pack.chapters) ? pack.chapters.length : 0;
    const art = hasSprite(`banner-${pack.id}`) ? px(`banner-${pack.id}`, 4) : h('div', { class: 'tp-ph' });
    const rows = Array.from({ length: n }, (_, i) => {
      const num = i + 1, c = progress.chapters?.[num], open = num <= progress.unlocked, cur = open && !c?.completed && num === progress.unlocked;
      const label = c?.completed ? `BEST ${fmt(c.bestScore)}` : open ? 'PLAY →' : 'LOCKED';
      return h(open ? 'a' : 'div', { class: `ch-row${cur ? ' cur' : ''}${open ? '' : ' locked'}`, ...(open ? { href: href.chapter(pack.id, num) } : { 'aria-disabled': 'true' }) },
        h('span', { class: 'ch-n', text: String(num).padStart(2, '0') }), h('span', { class: 'ch-t', text: `CHAPTER ${num}` }), h('span', { class: 'ch-s', text: label }));
    });
    mount(h('div', { class: 'tp-card tp-static', style: '--ac: var(--pink)' }, h('div', { class: 'tp-art' }, art),
        h('div', { class: 'tp-body' }, h('h2', { class: 'tp-name', text: pack.name }), h('p', { class: 'tp-tag', text: `${n} chapters · ${pack.blurb || ''}` }))),
      h('div', { class: 'm-label' }, h('span', { text: 'CHAPTERS' }), h('i', { 'aria-hidden': 'true' })),
      h('div', { class: 'ch-list' }, rows),
      h('div', { class: 'tp-quiet' }, h('a', { href: href.pack(pack.id), text: doneToday ? 'TODAY: DONE ✓' : "PLAY TODAY'S GAME" }), h('a', { href: href.archive(pack.id), text: 'PAST GAMES ⟲' }), h('a', { href: href.packPractice(pack.id), text: 'PRACTICE' })),
      h('a', { class: 'tp-back', href: href.packs(), text: '← ALL TOPICS' }));
  }

  function showArchive({ target, days, status, today }) {
    const isDaily = target === 'daily';
    const pack = isDaily ? null : packById(target);
    pageTitle('Past games');
    const played = days.filter((d) => status[d]).length;
    const tab = (id, label, icon) => h('a', { class: `btn small ${id === target ? 'primary' : 'ghost'}`, href: href.archive(id), 'aria-current': id === target ? 'page' : false }, px(icon, 2), label);
    mount(
      h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Every day since launch' }), h('h1', { text: `${isDaily ? 'Daily Game' : pack?.name || target}: past games` })),
        h('span', { class: 'pill cyan', text: `${played} of ${days.length} played` })),
      h('div', { class: 'tabs', role: 'navigation', 'aria-label': 'Game type' }, tab('daily', 'Daily', 'daily'), packs.map((p) => tab(p.id, p.name, p.icon))),
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
      h('span', { class: 'name' }, px(TIER_SPRITE[key], 1), TIER_INFO[key].short),
      h('div', { class: 'track' }, h('i', { style: `--w:${Math.round(((tc[key] || 0) / totalAnswers) * 100)}%` })),
      h('span', { class: 'val', text: fmt(tc[key] || 0) }));
    const perPack = packs.filter((p) => s.perPack && s.perPack[p.id]);
    mount(
      h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Saved only in this browser' }), h('h1', { text: 'Your depths' })), h('a', { class: 'btn ghost', href: href.history() }, 'Game history')),
      h('div', { class: 'stat-grid' },
        stat(fmt(s.runs), 'Games'), stat(`${fmt(s.bestDepth)} m`, 'Deepest game'), stat(fmt(s.totalPoints), 'Total points'), stat(String(s.avgPoints || 0), 'Average points'),
        stat(fmt(s.dailyStreak), 'Daily streak'), stat(fmt(s.bestStreak), 'Best streak'), stat(fmt(s.mythicCount), TIER_INFO.mythic.short), stat(fmt(s.rareCount), 'Rare answers')),
      s.runs === 0 && h('p', { class: 'muted', style: 'margin-top:14px', text: 'No games yet. Play one and it will show up here.' }),
      h('section', { class: 'section box' }, h('h2', { text: 'How rare are your answers?' }), h('div', { class: 'bars' }, ['none', ...TIERS].map(barRow))),
      h('section', { class: 'section box' }, h('h2', { text: 'Topic bests' }),
        perPack.length
          ? h('div', { class: 'hist-list' }, perPack.map((p) => h('div', { class: 'hist-item' }, px(p.icon, 2), h('div', {}, h('b', { text: p.name }), h('div', { class: 'when', text: `${s.perPack[p.id].runs} games` })), h('div', { class: 'num', text: `${units(displayKindFor('pack', p.id), s.perPack[p.id].best).text}` }))))
          : h('p', { class: 'muted', text: 'Play a topic to see your best here.' })));
  }

  function showHistory({ runs, filter, onOpen }) {
    pageTitle('History');
    const tab = (id, label) => h('button', { class: `btn small ${filter === id ? 'primary' : 'ghost'}`, onclick: () => on.historyFilter(id) }, label);
    mount(
      h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Your last 50 games' }), h('h1', { text: 'History' })), h('a', { class: 'btn ghost', href: href.stats() }, 'Stats')),
      h('div', { class: 'tabs' }, tab('all', 'All'), tab('daily', 'Daily'), tab('endless', 'Endless'), tab('duel', 'Duel'), tab('pack', 'Topics')),
      runs.length === 0 ? h('div', { class: 'box' }, h('p', { class: 'muted', text: 'Nothing here yet. Finish a game and it will show up.' }), h('a', { class: 'btn primary', href: href.endless() }, 'Start an Endless game'))
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
        h('li', {}, h('div', {}, h('b', { text: 'Read the question' }), 'Each game is 7 questions. A question names a topic: “a country ending in -stan”, “a word with no vowels but Y”, and so on.')),
        h('li', {}, h('div', {}, h('b', { text: 'Type one answer' }), 'You have 20 seconds per question (15 in a Duel). Press Enter to submit. If the answer isn’t in our list you can try again while time remains.')),
        h('li', {}, h('div', {}, h('b', { text: 'Rare beats obvious' }), 'Every correct answer is worth 1–100 points. The first thing everyone thinks of scores least. Deep cuts carry you down.')),
        h('li', {}, h('div', {}, h('b', { text: 'Run out of time? Zero.' }), 'If the clock runs out, that question scores 0. We show you what you could have said.')),
        h('li', {}, h('div', {}, h('b', { text: 'Read the feedback' }), 'After each answer you’ll see how rare it was, a fun fact, rarer answers and the most common answer. That is how you get better.'))),
      h('h2', { style: 'margin:26px 0 12px', text: 'Rarity tiers' }), tierLegend(),
      h('section', { class: 'section' }, h('h2', { text: 'Modes' }),
        h('div', { class: 'grid cols-2', style: 'margin-top:12px' },
          h('div', { class: 'box' }, h('h3', { text: 'Daily Game' }), h('p', { text: 'The same 7 questions for everyone each day (UTC). One official try, plus unlimited practice. Depth: 1 point = 10 m.' })),
          h('div', { class: 'box' }, h('h3', { text: 'Endless' }), h('p', { text: 'Fresh random questions whenever you want them. We avoid ones you saw recently.' })),
          h('div', { class: 'box' }, h('h3', { text: 'Duel' }), h('p', { text: 'Play 7 prompts, then share your link. Your rival plays the same prompts in 15 s each. If you both give the same answer, both scores for that prompt are halved.' })),
          h('div', { class: 'box' }, h('h3', { text: 'Topics' }), h('p', { text: 'Fourteen topics, each with a daily game, past games back to launch day, and practice. Each has its own progress picture and units.' })))),
      h('section', { class: 'section box cyan' }, h('h2', { text: 'Good to know' }),
        h('ul', { class: 'prose' },
          h('li', { text: 'Hints are free. Revealing one never costs points, but it is marked on your results.' }),
          h('li', { text: 'Spelling is forgiving: small typos and common alternate names are accepted.' }),
          h('li', { text: 'Everything is free: no ads, no accounts, no locked topics or past games.' }),
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
        h('p', {}, 'Vermillion is a rare-answer trivia game. You score by naming correct answers that few other people would think of, and every point pulls you deeper. It belongs to a genre of “pick something uncommon” word-and-trivia games, but every question, answer, line of copy, sprite and sound here is our own.'),
        h('h2', { text: 'Free, always' }), h('p', {}, 'No ads, no paywalls, no accounts, no locked modes. Every topic and past game is open to everyone.'),
        h('h2', { text: 'Your data' }), h('p', {}, 'Scores, settings and history are saved only in your browser’s local storage. Nothing is sent anywhere. Clearing site data resets your stats.'),
        h('h2', { text: 'Made with' }), h('ul', {}, h('li', { text: 'Plain HTML, CSS and JavaScript: no frameworks, no build step.' }), h('li', { text: 'Pixel art and chiptune sound effects made in code.' }), h('li', { text: 'Font: VT323, under the SIL Open Font License.' }), h('li', { text: 'Mascot: Vermi, a small glowing vermilion fish who loves a deep cut.' })),
        h('div', { class: 'cta-row' }, h('a', { class: 'btn primary', href: href.daily() }, 'Play Daily'), h('a', { class: 'btn ghost', href: href.faq() }, 'FAQ')))));
  }

  /* ---------------------------------------------------------------- play: inside the scene ---------- */
  let sceneCtl = null, sceneHost = null, keepScene = false;
  // glyph-down must point down: if the sprite's widest row is at the bottom it is drawn as a ▲, so flip it
  const downFlipped = () => { try { const f = assets.sprites.SPRITES['glyph-down'].frames[0]; const n = (r) => (r.match(/[^.]/g) || []).length; const rows = f.filter((r) => n(r)); return n(rows[0]) < n(rows[rows.length - 1]); } catch { return false; } };
  const gdown = () => (hasSprite('glyph-down') ? h('span', { class: `glyph${downFlipped() ? ' flip' : ''}`, 'aria-hidden': 'true' }, px('glyph-down', 2)) : h('span', { class: 'glyph', 'aria-hidden': 'true', text: '▼' }));
  // pixel-notched card: border layer (.nb) + dark inner layer (.ni); the drop shadow lives on the wrapper
  const notch = (cls, ...kids) => h('div', { class: `nw ${cls || ''}` }, h('div', { class: 'nb' }, h('div', { class: 'ni' }, ...kids)));

  /* One persistent scene canvas for the whole app: created once, never re-created between routes. Title <-> game glides the waterline;
     other pages fade it out (and pause it) instead of destroying it. */
  function hideScene() { if (sceneHost) { sceneHost.classList.add('scene-hidden'); sceneCtl && sceneCtl.pause(); } }
  function ensureScene(kind, titleOpts) {
    const fresh = !sceneHost || !sceneHost.isConnected;
    if (fresh) {
      sceneHost = h('div', { class: 'scene-fixed scene-hidden', 'aria-hidden': 'true' });
      root.insertBefore(sceneHost, page);
      sceneCtl = startScene(sceneHost, kind === 'play' ? { mode: 'play' } : { mode: 'title', ...titleOpts });
    } else {
      if (titleOpts) sceneCtl.setOpts(titleOpts);
      sceneCtl.resume();
      if (sceneCtl.mode !== kind || kind === 'title') sceneCtl.setMode(kind, { ms: 900 });
    }
    sceneCtl.setVermiShown(true);
    requestAnimationFrame(() => sceneHost && sceneHost.classList.remove('scene-hidden'));
    return sceneCtl;
  }
  function ensurePlayScene(depthM, instant) {
    ensureScene('play');
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

    const modeBadge = null;   // Krillion has no chips under the HUD: practice / past-game info lives in the card label

    const cardSlot = h('div', { class: 'card-slot' });
    const stage = h('main', { class: 'stage', id: 'stage', tabindex: '-1' }, cardSlot);

    // bottom answer dock: ring timer, input, SINK button, thin timer bar
    const ringNum = h('span', { class: 'ring-num', 'aria-hidden': 'true' });
    const ring = h('div', { class: 'ring', 'aria-hidden': 'true' });
    const ringWrap = h('div', { class: 'ring-wrap', role: 'timer', 'aria-label': 'Time left' }, ring, ringNum);
    const input = h('input', {
      class: 'answer-input', type: 'text', id: 'answer', name: 'answer', placeholder: 'type one answer…', autocomplete: 'off', autocapitalize: 'none',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer', maxlength: '80', autofocus: true,
      onkeydown: (e) => { if (e.key.length === 1) sfx('type'); },
      oninput: () => { if (P && P.suggestOn) dismissSuggest(); },
    });
    const timerFill = h('i');
    const timerBar = h('div', { class: 'dock-bar', 'aria-hidden': 'true' }, timerFill);
    const msg = h('div', { class: 'dock-msg', role: 'status', 'aria-live': 'polite' });
    const sugName = h('b');
    const suggest = h('div', { class: 'dock-suggest', role: 'group', 'aria-label': 'Did you mean', hidden: true },
      h('span', { class: 'sg-q' }, 'Did you mean ', sugName, '?'),
      h('button', { class: 'sg-btn yes', type: 'button', onclick: () => acceptSuggest() }, 'YES ', h('span', { 'aria-hidden': 'true', text: '↵' })),
      h('button', { class: 'sg-btn no', type: 'button', onclick: () => { dismissSuggest(); P && P.input.focus({ preventScroll: true }); } }, 'NO'));
    const form = h('form', { class: 'dock', onsubmit: (e) => { e.preventDefault(); if (P && P.suggestOn) return acceptSuggest(); on.submit(input.value); } },
      msg, suggest,
      h('div', { class: 'dock-in' }, ringWrap, h('div', { class: 'dock-field' }, input, timerBar), h('button', { class: 'sink-btn', type: 'submit' }, 'GO')));

    page.replaceChildren(...[hud, miniHost, stage, form].filter(Boolean));
    window.scrollTo(0, 0);
    P = { meta, kind, hud, pips, count, depthLabel, depthVal, rivalVal, scoreVal, cardSlot, stage, ring, ringWrap, ringNum, timerFill, form, input, msg, hintBtn: null, hintBox: null, lastSecs: null, display: null, msgTimer: 0, enter: null, suggest, sugName, suggestOn: false };
    page.classList.toggle('has-mini', mini);

    if (mini) {
      const real = createDisplay(kind, miniHost);
      P.display = real;
    } else {
      // the scene IS the trench; this shim just keeps the old display API
      P.display = { update() {}, celebrate() {}, setRival() {}, destroy() {} };
    }
    if (rival) { P.display.setRival(0); sceneCtl && sceneCtl.setRival(0); }
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
    P.count.textContent = `QUESTION ${state.index + 1} OF ${state.count}`;
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
      h('div', { class: 'pc-label', text: `QUESTION ${state.index + 1} OF ${state.count}${P.meta.practice ? ' · PRACTICE' : ''}${P.meta.chapter ? ` · CHAPTER ${P.meta.chapter}` : ''}${P.meta.archive && P.meta.dayKey ? ` · ${P.meta.dayKey}` : ''}` }),
      h('h1', { class: `prompt-text${p.text.length > 140 ? ' xlong' : p.text.length > 90 ? ' long' : ''}`, text: p.text }),
      hintBox,
      h('div', { class: 'pc-foot' }, h('span', { class: 'rare-line' }, gdown(), ' rarer answers score more ', gdown()), hintBtn));
    P.cardSlot.replaceChildren(card);
    P.hintBtn = hintBtn; P.hintBox = hintBox;
    P.suggestOn = false; P.suggest.hidden = true;
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

  function showSuggest(sg) {
    if (!P || !sg) return;
    P.suggestOn = true; P.sugName.textContent = sg.name; P.suggest.hidden = false;
    P.msg.classList.remove('on');
    sfx('click');
  }
  function dismissSuggest() { if (!P) return; if (P.suggestOn) on.dismissSuggest(); P.suggestOn = false; P.suggest.hidden = true; }
  function acceptSuggest() { if (!P || !P.suggestOn) return; P.suggestOn = false; P.suggest.hidden = true; on.acceptSuggest(); }

  function showReject(kind, _rejected, note = null) {
    if (!P || !P.msg) return;
    dismissSuggest();
    const main = kind === 'empty' ? 'Type an answer first.' : 'Not in our bank, so try another!';
    P.msg.replaceChildren(main, ...(note ? [h('small', { class: 'dm-note', text: note })] : []));
    P.msg.classList.add('on');
    clearTimeout(P.msgTimer); P.msgTimer = setTimeout(() => P && P.msg.classList.remove('on'), note ? 3800 : 2800);
    P.input.classList.remove('shake'); void P.input.offsetWidth; P.input.classList.add('shake');
    if (kind === 'unknown') sfx('unknown');
    P.input.focus({ preventScroll: true });
    P.input.select();
  }
  /** Replace the quiet second line of the "not in our bank" message (e.g. once the review says the answer looks right). */
  function setRejectNote(text) {
    if (!P || !P.msg || !P.msg.classList.contains('on')) return;
    const n = P.msg.querySelector('.dm-note'); if (n) n.textContent = text;
    else P.msg.append(h('small', { class: 'dm-note', text }));
  }

  function showResult(state, opts = {}) {
    if (!P) return;
    const r = state.last, kind = P.kind;
    pipRow(state);
    const prevTotal = P.totalPts || 0; P.totalPts = state.total;
    updateTimer({ ...state, remainingMs: 0, phase: 'result' });
    P.suggestOn = false; P.suggest.hidden = true; P.msg.classList.remove('on');
    const land = (ms = 0) => {
      updateHud(state, opts.rivalPoints);
      P.display.update(state.total, state.maxPoints);
      if (opts.rivalPoints != null) { P.display.setRival(opts.rivalPoints); sceneCtl && sceneCtl.setRival(opts.rivalPoints * 10, { ms }); }
      P.display.celebrate(r.tier);
      sfx(r.timedOut ? 'timeout' : (r.points > 0 ? `land-${r.tier}` : 'land-none'));
    };
    let showCard;
    const dives = sceneCtl && r.points > 0 && !r.timedOut;
    if (dives) {
      // the dive: prompt card slides up and dims, dock dims, Vermi plunges to the rarity the answer earned
      P.diving = true; P.form.classList.add('dim'); P.input.blur();
      P.cardSlot.firstElementChild && P.cardSlot.firstElementChild.classList.add('diving');
      P.skipFn = (e) => {
        if (!P || !P.diving) return;
        if (e.type === 'keydown' && (e.repeat || (e.key !== 'Enter' && e.key !== ' '))) return;
        if (e.type === 'keydown') e.preventDefault();
        sceneCtl.skip();
      };
      document.addEventListener('keydown', P.skipFn); document.addEventListener('pointerdown', P.skipFn);
      const endDive = () => {
        if (!P) return;
        P.diving = false; document.removeEventListener('keydown', P.skipFn); document.removeEventListener('pointerdown', P.skipFn); P.skipFn = null;
        P.form.classList.remove('dim');
      };
      const diveMs = 700 + r.points * 18;
      sceneCtl.dive({
        fromM: prevTotal * 10, toM: state.total * 10, points: r.points, tier: r.tier,
        onProgress: (m) => { const hd = hudFor(kind, m / 10); P.depthVal.textContent = hd.render(hd.to); P.depthVal._v = hd.to; const sc = Math.max(0, Math.round(m / 10)); P.scoreVal.textContent = fmt(sc); P.scoreVal._v = sc; },   // depth and score move with the camera, in one ease
        onLand: () => { P.cardSlot.firstElementChild && P.cardSlot.firstElementChild.classList.add('landing'); land(Math.round(diveMs / 2)); },
        onDone: () => { endDive(); if (P && P.cardSlot) showCard(true); },
      });
    } else {
      if (sceneCtl) { sceneCtl.setDepth(state.total * 10); if (r.timedOut || r.points <= 0) sceneCtl.pulse('none'), sceneCtl.sad(); }
      land();
    }
    showCard = (fade) => {
    P.form.hidden = true;
    const u = units(kind, r.points);
    const lastOne = state.index + 1 >= state.count;
    const nextBtn = h('button', { class: 'next-btn', id: 'next', type: 'button', onclick: () => { sfx('next'); on.next(); } }, lastOne ? 'SEE SCORE ' : 'NEXT ', gdown());
    const ptsEl = h('span', { class: 'pts' }, h('span', { class: 'n' }, '0'), ' pts');
    const meters = Math.round(r.points * 10);
    const unitText = kind === 'trench' || kind === 'split' ? `+${fmt(meters)} m` : kind === 'arcade' ? `score +${fmt(u.value)}` : `${u.value > 0 ? '+' : ''}${fmt(u.value)} ${u.unit}`;
    const rv = r.reveal;
    const chip = (a) => h('span', { class: `chip${a.points > 80 ? ' mythic' : ''}` }, h('span', { text: a.name }), h('b', { text: `${a.points}` }));

    const tierName = r.timedOut ? 'TIME’S UP' : TIER_INFO[r.tier].label.toUpperCase();
    const iconName = `tier-${r.tier}`;
    const icon88 = hasSprite(iconName) ? px(iconName, 5) : null;
    if (icon88) { icon88.style.width = '88px'; icon88.style.height = '88px'; }
    const flavour = r.timedOut ? 'No answer in time, so this one scores 0.'
      : r.corrected ? `Autocorrected from “${r.typed || r.input}”`
      : r.note ? String(r.note).split(/(?<=[.!?])\s/)[0]
      : rv.rarerThan > 0 ? `Rarer than ${rv.rarerThan}% of answers` : 'A very common answer.';
    const sections = [
      icon88 && h('div', { class: 'rs-icon', 'aria-hidden': 'true' }, icon88),
      h('div', { class: 'rs-tier', text: tierName }),
      !r.timedOut && h('div', { class: 'rs-ans', text: `“${r.answerName}”` }),
      h('div', { class: 'rs-pts' }, ptsEl, h('span', { class: 'unit', text: ` · ${kind === 'trench' || kind === 'split' ? `sink ${fmt(meters)}m` : unitText}` })),
      flavour && h('div', { class: 'rs-flav', text: flavour }),
    ];
    const more = [];
    if (!r.timedOut && r.note) more.push(h('p', { class: 'rs-note', text: r.note }));
    if (r.fact) more.push(h('p', { class: 'rs-note', text: `Did you know? ${r.fact}` }));
    if (rv.deeper.length) more.push(h('div', {}, h('div', { class: 'fb-sub', text: r.timedOut ? 'Rarest answers' : 'Rarer answers' }), h('div', { class: 'chips' }, rv.deeper.map(chip))));
    else if (!r.timedOut) more.push(h('p', { class: 'rs-note', text: 'You found the rarest answer we know for this question.' }));
    if (rv.commonest && !r.timedOut && r.answerName !== rv.commonest.name) more.push(h('div', {}, h('div', { class: 'fb-sub', text: 'Most common' }), h('div', { class: 'chips' }, chip(rv.commonest))));
    if (more.length) sections.push(h('details', { class: 'rs-more' }, h('summary', { text: `MORE · ${rv.totalAnswers} ANSWERS IN OUR BANK` }), ...more));
    sections.push(h('div', { class: 'rs-actions' }, nextBtn));

    const fb = playCard(`feedback tier-${r.tier}`, h('div', { class: 'fb-body', 'aria-live': 'polite' }, sections));
    P.cardSlot.replaceChildren(fb);
    countUp(ptsEl.querySelector('.n'), r.points, (n) => `+${n}`, 700);
    // brief guard so a held Enter key can't skip the feedback screen; then Enter advances
    nextBtn.disabled = true;
    setTimeout(() => { nextBtn.disabled = false; nextBtn.focus({ preventScroll: true }); }, 350);
    P.enter = (e) => { if (e.key === 'Enter' && !e.repeat && !nextBtn.disabled && nextBtn.isConnected && document.activeElement !== nextBtn) { e.preventDefault(); nextBtn.click(); } };
    document.addEventListener('keydown', P.enter);
    if (fade) fb.classList.add('fade-in');
    };
    if (!dives) showCard(false);
  }

  /* ---------------------------------------------------------------- results ---------- */
  function showRun(view) {
    const { run, promptOf, kind, meta = {}, stats, link, duel, nextPack, replay, canReplay, canChallenge, rankSlot } = view;
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
        h('div', { class: 'label', text: replay ? `${meta.title || 'Game'} · ${run.dayKey || ''}` : `${meta.title || 'Your game'} complete` }),
        valueEl,
        h('div', { class: 'sub', text: (kind === 'trench' || kind === 'split' ? `${fmt(duel ? duel.myTotal : run.total)} points · ${depthName((duel ? duel.myTotal : run.total) * 10)}` : `${fmt(run.total)} points`) + (duel ? ' after matching answers were halved' : '') }),
        h('div', { class: 'sqs', role: 'img', 'aria-label': 'Tier squares' }, run.answers.map((a) => h('span', { class: `sq t-${a.tier || tierName(a.points)}` }))),
        h('div', { class: 'chips', style: 'justify-content:center;margin-top:12px' }, banners)),
    ];
    // "Your rank today" for an official Daily (filled in by setRank once the server answers)
    P2.rank = null;
    if (rankSlot && rankSlot !== 'offline') {
      P2.rank = h('div', { class: 'rank-line', role: 'status', 'aria-live': 'polite' });
      body.push(P2.rank);
      setRank({ kind: rankSlot });
    }
    // quick replay strip: one mini dive bar per question, coloured by tier
    body.push(h('div', { class: 'dive-strip', role: 'img', 'aria-label': 'Your seven dives' },
      run.answers.map((a, i) => h('div', { class: `ds-col t-${a.tier || tierName(a.points)}`, style: `--i:${i};--h:${Math.max(4, a.points)}` }, h('i'), h('span', { text: String(a.points) })))));
    // personal stats
    if (stats && !replay) {
      body.push(h('div', { class: 'stat-grid', style: 'margin-top:14px' },
        h('div', { class: 'stat' }, h('b', { text: `${fmt(stats.bestDepth)} m` }), h('span', { text: 'Personal best depth' })),
        h('div', { class: 'stat' }, h('b', { text: fmt(stats.dailyStreak) }), h('span', { text: 'Daily streak' })),
        h('div', { class: 'stat' }, h('b', { text: fmt(stats.runs) }), h('span', { text: 'Games played' })),
        h('div', { class: 'stat' }, h('b', { text: fmt(run.answers.filter((a) => a.tier === 'rare' || a.tier === 'mythic').length) }), h('span', { text: 'Rare+ answers this game' }))));
    }
    if (duel) {
      const winner = duel.myTotal === duel.theirTotal ? 0 : duel.myTotal > duel.theirTotal ? 1 : -1;
      body.push(h('section', { class: 'box cyan duel-banner section' },
        h('h2', { text: winner === 1 ? 'You scored higher!' : winner === -1 ? 'They scored higher' : 'A dead heat' }),
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
        h('td', {}, h('span', { class: `dot t-${a.tier || tierName(a.points)}` }), a.answerName || (a.timedOut ? 'No answer (timed out)' : a.input || 'No answer'), a.usedHint && h('span', { class: 'pill', style: 'margin-left:8px', text: 'hint' }), a.corrected && h('div', { class: 'q', text: `autocorrected from “${a.typed || a.input}”` }), hit && h('div', { class: 'pill', style: 'margin-top:4px', text: 'same answer, halved' })),
        h('td', { class: 'num', text: duel ? `${duel.mine[i]}` : `${a.points}` }),
      ];
      if (duel) cells.push(h('td', {}, theirA?.answerName || 'No answer', h('div', { class: 'q', text: `${duel.theirs[i]} pts` })));
      else cells.push(h('td', { class: 'q', text: ex.rarest ? `${ex.rarest.name} (${ex.rarest.points})` : '' }));
      return h('tr', { class: hit ? 'collide' : '' }, cells);
    });
    body.push(h('section', { class: 'box section' },
      h('h2', { text: duel ? 'Head to head' : 'Question by question' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'rtable' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Question' }), h('th', { text: duel ? 'You' : 'Your answer' }), h('th', { text: 'Pts' }), h('th', { text: duel ? 'Challenger' : 'Rarest possible' }))),
        h('tbody', {}, rows)))));
    if (link) {
      const input = h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Duel link', onfocus: (e) => e.target.select() });
      body.push(h('section', { class: 'box cyan section' }, h('h2', { text: 'Challenge a friend' }), h('p', { class: 'muted', text: 'They play the same 7 questions (15 s each). If you both give the same answer, both scores for that prompt are halved.' }),
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
    { const first = !sceneCtl || sceneCtl.mode !== 'play' || sceneHost.classList.contains('scene-hidden'); ensureScene('play'); sceneCtl.setDepth(finalDepth, { instant: first }); }
    if (P2.toast) P2.toast = toastLine;
    const numSpan = h('span');
    valueEl.replaceChildren(numSpan);
    if (kind === 'arcade') countUp(numSpan, u.value, (n) => String(n).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1,$2'), 1200);
    else countUp(numSpan, u.value, (n) => `${fmt(n)}${u.unit ? ' ' + (u.value === 1 && DISPLAYS[kind].unit1 ? DISPLAYS[kind].unit1 : u.unit) : ''}`, 1200);
  }
  const P2 = { toast: null, rank: null };
  function setRank(r) {
    const el = P2.rank;
    if (!el || !el.isConnected) return;
    if (r.kind === 'loading') { el.replaceChildren(h('span', { class: 'muted', text: 'Checking your rank…' })); return; }
    if (r.kind === 'signedout') { el.replaceChildren(h('a', { href: href.account(), text: 'Sign in to join the leaderboard' }), h('span', { class: 'muted', text: ' and see where you rank today.' })); return; }
    if (r.kind === 'ok') { el.replaceChildren(h('b', { text: `Your rank today: #${fmt(r.rank)}${r.of ? ` of ${r.of}` : ''}` }), ' ', h('a', { href: href.leaderboard(), text: 'See the leaderboard' })); return; }
    if (r.kind === 'queued') { el.replaceChildren(h('span', { class: 'muted', text: 'Your score is saved. Your rank will show once it reaches the leaderboard. ' }), h('a', { href: href.leaderboard(), text: 'Check the board' })); return; }
    el.replaceChildren();
  }
  function inlineToast(text) { if (P2.toast && P2.toast.isConnected) P2.toast.textContent = text; else toast(text); }
  function depthName(d) {
    return d <= 0 ? 'still at the surface' : d < 1000 ? 'shallow water' : d < 2500 ? 'deep water' : d < 4500 ? 'very deep water' : d < 6000 ? 'near the bottom' : 'the deepest part';
  }

  /* ================================================================ v3: accounts, boards, friends, live rooms (CONTRACT §8.6) ================ */
  const AVATARS = [['mascot', 'Vermi'], ['diver', 'Diver'], ['rocket', 'Rocket'], ['star', 'Star'], ['tree', 'Tree'], ['plane', 'Plane'], ['pack-space', 'Alien'], ['pack-nature', 'Pine'], ['pack-science', 'Mushroom'], ['pack-games', 'Pixel face'], ['pack-sports', 'Ring'], ['pack-geography', 'Eye']];
  const avatarId = (id) => (id === 'vermi' ? 'mascot' :  (AVATARS.some(([a]) => a === id) ? id : 'mascot'));
  const avatarEl = (id, cls = '') => h('span', { class: `avatar ${cls}`, 'aria-hidden': 'true' }, px(avatarId(id), 2));
  const CROWN = ['..X.X.X..', '.XX.XXX.X', '.XXXXXXXX', '.XXXXXXXX', '.XXXXXXXX'];
  function crownEl() {
    const sc = 3, c = document.createElement('canvas');
    c.width = 9 * sc; c.height = CROWN.length * sc; c.className = 'px crown'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Host');
    const g = c.getContext('2d');
    CROWN.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') { g.fillStyle = y === 0 || (y === 1 && row[x] === 'X' && x % 4 === 1) ? '#fff2b0' : '#ffd35e'; g.fillRect(x * sc, y * sc, sc, sc); } }));
    return c;
  }
  let A = { enabled: false, available: false, user: null, profile: null };
  let chipEl = null;
  const nameOf = (p) => (p && (p.username || p.profile?.username || p.name)) || 'Diver';
  const pidOf = (p) => (p && (p.id ?? p.user_id)) || '';

  /* an "Offline" pill on every online menu entry, which then can't be opened */
  const ONLINE_PAGES = [
    { title: 'Play online', sub: 'Create or join a live game with friends.', to: href.online(), icon: 'duel', extra: 'multiplayer live room code quick match versus friends' },
    { title: 'Leaderboard', sub: 'Today and all-time rankings.', to: href.leaderboard(), icon: 'stats', extra: 'rank ranking top scores board' },
    { title: 'Friends', sub: 'Add friends and compare scores.', to: href.friends(), icon: 'daily', extra: 'friend requests username' },
    { title: 'Account', sub: 'Your name, avatar and saved stats.', to: href.account(), icon: 'settings', extra: 'sign in sign up guest email profile username avatar' },
  ];
  const onlineUsable = () => A.enabled && A.available;

  function renderChip() {
    if (!chipEl) return;
    chipEl.replaceChildren();
    if (!A.enabled) { chipEl.hidden = true; return; }
    chipEl.hidden = false;
    const label = !A.available ? 'Offline' : A.user ? nameOf(A.profile) : 'Sign in';
    chipEl.classList.toggle('off', !A.available);
    chipEl.setAttribute('aria-label', !A.available ? 'Account (offline)' : A.user ? `Account: ${label}` : 'Sign in');
    chipEl.append(A.user && A.available ? avatarEl(A.profile?.avatar) : icon('settings', '☺'), h('span', { class: 'chip-name', text: label }));
  }
  function setAccount(a) {
    A = { ...A, ...a };
    renderChip(); renderStack();
    if (drawerEl) { renderDrawer(); }
  }

  /* ---------------------------------------------------------------- shared small pieces ---------- */
  const rowMsg = () => h('p', { class: 'form-msg', role: 'status', 'aria-live': 'polite' });
  function setMsg(el, text, kind) { el.textContent = text || ''; el.className = `form-msg${kind ? ` ${kind}` : ''}`; }
  /** Run an async action on a button: disables it, shows the error message if it fails. */
  async function withBusy(btn, msgEl, fn, okText) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Working…'; setMsg(msgEl, '');
    let r;
    try { r = await fn(); } catch { r = { ok: false, error: 'Something went wrong. Try again.' }; }
    if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    if (msgEl.isConnected) { if (r && r.ok) setMsg(msgEl, okText || '', 'good'); else setMsg(msgEl, (r && r.error) || 'Something went wrong. Try again.', 'bad'); }
    return r;
  }
  function emailForm({ cta, note, onSend }) {
    const msg = rowMsg();
    const input = h('input', { class: 'text-in', type: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', autocomplete: 'email', required: true, maxlength: '120' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, cta);
    const form = h('form', { class: 'inline-form', onsubmit: async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(v)) return setMsg(msg, 'Type a full email address, like name@example.com.', 'bad');
      const r = await withBusy(btn, msg, () => onSend(v));
      if (r && r.ok) { form.replaceChildren(h('div', { class: 'sent-note', role: 'status' }, h('b', { text: 'Check your email' }), h('span', { text: ` We sent a link to ${v}. Open it on this device to finish. You can close this tab.` }))); }
    } }, input, btn);
    return h('div', {}, note && h('p', { class: 'muted', text: note }), form, msg);
  }
  function statsCard(st) {
    const s = st || {};
    const cell = (v, l) => h('div', { class: 'stat' }, h('b', { text: fmt(v) }), h('span', { text: l }));
    return h('div', { class: 'stat-grid' },
      cell(s.runs, 'Games played'), cell(s.total_points, 'Total points'), cell(s.best_depth, 'Best depth (m)'),
      cell(s.daily_streak, 'Daily streak'), cell(s.best_streak, 'Best streak'), cell(s.rare_count, 'Rare answers'), cell(s.mythic_count, 'One in a Vermillion'));
  }

  /** An empty page for Sol's DEPTH CHARGE UI (src/party-ui.js) to mount into. */
  function showPartyHost() {
    pageTitle('Depth charge'); const host = h('div', { class: 'party-host' }); mount(host);
    root.classList.add('is-home', 'is-play'); page.className = 'page party-page';   // same calm shared scene as the game screen, no title UI
    ensureScene('play'); sceneCtl.setDepth(0, { instant: true }); sceneCtl.setVermiShown(false);
    return host;
  }
  function showOffline(title = 'This page') {
    pageTitle(title);
    mount(h('div', { class: 'box hi error-box page-narrow', style: 'margin:30px auto' }, vermi(6, 2), h('h2', { text: 'You’re offline' }),
      h('p', { text: ONLINE_OFF_TEXT() }),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: href.daily() }, 'Play the Daily Game'), h('a', { class: 'btn ghost', href: href.home() }, 'Home'))));
  }
  const ONLINE_OFF_TEXT = () => (A.enabled ? 'Online features need a connection. Your solo games still work and are saved in this browser.' : 'Online features are switched off. Your solo games still work and are saved in this browser.');

  /* ---------------------------------------------------------------- account ---------- */
  function showAccount({ user, profile, stats, actions }) {
    pageTitle('Account');
    const head = h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Online' }), h('h1', { class: 'page-title', text: 'Account' })));
    if (!user) {
      const guestMsg = rowMsg();
      const guestBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(guestBtn, guestMsg, actions.guest) }, 'Play as guest');
      mount(h('div', { class: 'page-narrow acct' }, head,
        h('section', { class: 'box hi' }, h('div', { class: 'acct-hero' }, vermi(6, 1), h('div', {}, h('h2', { text: 'Join the dive' }), h('p', { text: 'An account is optional. It puts you on the leaderboards, lets you add friends and play live games. Solo play never needs one.' }))),
          h('div', { class: 'actions' }, guestBtn), guestMsg, h('p', { class: 'muted small', text: 'A guest gets a random name. You can add an email later to keep your progress.' })),
        h('section', { class: 'box section' }, h('h2', { text: 'Sign in with email' }),
          emailForm({ cta: 'Send sign-in link', note: 'We email you a link. No password to remember.', onSend: actions.email }))));
      return;
    }
    // signed in
    let pick = avatarId(profile?.avatar);
    const nameIn = h('input', { class: 'text-in', type: 'text', value: profile?.username || '', maxlength: '16', 'aria-label': 'Username', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'name-help' });
    const saveMsg = rowMsg();
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Avatar' });
    const paint = () => grid.replaceChildren(...AVATARS.map(([id, label]) => h('button', { class: 'av-opt', type: 'button', role: 'radio', 'aria-checked': String(id === pick), 'aria-label': label, title: label, onclick: () => { pick = id; paint(); sfx('click'); } }, px(id, 3))));
    paint();
    const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save');
    const form = h('form', { class: 'box hi', onsubmit: async (e) => {
      e.preventDefault();
      const name = nameIn.value.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return setMsg(saveMsg, 'Use 3 to 16 letters, numbers or underscores.', 'bad');
      const r = await withBusy(saveBtn, saveMsg, () => actions.save({ username: name, avatar: pick }), 'Saved.');
      if (r && r.ok) sfx('next');
    } },
      h('div', { class: 'acct-top' }, avatarEl(pick, 'big'), h('div', {}, h('h2', { text: nameOf(profile) }), h('span', { class: `pill ${user.isGuest ? '' : 'good'}`, text: user.isGuest ? 'Guest' : 'Signed in' }), user.email && h('span', { class: 'muted small', text: ` ${user.email}` }))),
      h('label', { class: 'field' }, h('b', { text: 'Username' }), nameIn, h('small', { id: 'name-help', class: 'muted', text: '3 to 16 letters, numbers or underscores.' })),
      h('div', { class: 'field' }, h('b', { text: 'Avatar' }), grid),
      h('div', { class: 'actions' }, saveBtn), saveMsg);
    const out = rowMsg();
    const outBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => withBusy(outBtn, out, actions.signOut) }, 'Sign out');
    mount(h('div', { class: 'page-narrow acct' }, head, form,
      h('section', { class: 'box section' }, h('h2', { text: 'Your stats' }), statsCard(stats),
        h('div', { class: 'actions', style: 'margin-top:12px' }, h('a', { class: 'btn small', href: href.leaderboard() }, 'Leaderboard'), h('a', { class: 'btn small ghost', href: href.stats() }, 'This browser’s stats'))),
      user.isGuest && h('section', { class: 'box cyan section' }, h('h2', { text: 'Save your progress: add email' }),
        emailForm({ cta: 'Add email', note: 'Add an email so you can sign in on another device and keep your games and name.', onSend: actions.upgrade })),
      h('div', { class: 'actions section' }, outBtn), out));
  }

  /* ---------------------------------------------------------------- leaderboard ---------- */
  function showLeaderboard({ tab, scope, state, rows, meId, day, signedIn, error, onTab, onScope }) {
    pageTitle('Leaderboard');
    const tabBtn = (id, label, cur, fn) => h('button', { class: `tab-btn${cur ? ' on' : ''}`, type: 'button', 'aria-pressed': String(cur), onclick: fn }, label);
    const bar = h('div', { class: 'lb-bar' },
      h('div', { class: 'tabs', role: 'group', 'aria-label': 'Time range' }, tabBtn('daily', 'Today', tab === 'daily', () => onTab('daily')), tabBtn('all', 'All time', tab === 'all', () => onTab('all'))),
      h('div', { class: 'tabs', role: 'group', 'aria-label': 'Who' }, tabBtn('all', 'Everyone', scope === 'all', () => onScope('all')), tabBtn('friends', 'Friends', scope === 'friends', () => onScope('friends'))));
    const body = [];
    if (state === 'loading') body.push(h('p', { class: 'muted', role: 'status', text: 'Loading the board…' }));
    else if (state === 'error') body.push(h('div', { class: 'box hi', role: 'alert' }, h('p', { text: error || 'Couldn’t load the board.' }), h('button', { class: 'btn small', type: 'button', onclick: () => (tab === 'daily' ? onTab('daily') : onTab('all')) }, 'Try again')));
    else {
      const TOP = 50;
      const score = (r) => (tab === 'daily' ? `${fmt(r.depth ?? r.total * 10)} m` : `${fmt(r.total)} pts`);
      const sub = (r) => (tab === 'daily' ? `${fmt(r.total)} pts` : `${fmt(r.games)} game${r.games === 1 ? '' : 's'}`);
      const rowEl = (r) => h('li', { class: `lb-row${r.user_id === meId ? ' me' : ''}${r.rank <= 3 ? ` top${r.rank}` : ''}` },
        h('span', { class: 'lb-rank', text: `#${r.rank}` }), avatarEl(r.avatar), h('span', { class: 'lb-name' }, nameOf(r), r.user_id === meId && h('span', { class: 'pill pink', text: 'You' })),
        h('span', { class: 'lb-score' }, h('b', { text: score(r) }), h('small', { text: sub(r) })));
      const shown = rows.slice(0, TOP);
      const mine = rows.find((r) => r.user_id === meId);
      if (!rows.length) {
        body.push(h('div', { class: 'box' }, h('p', { text: scope === 'friends' ? (signedIn ? 'None of your friends have a score here yet.' : 'Sign in to see how your friends are doing.') : tab === 'daily' ? 'Nobody has played today’s Daily Game yet. Be the first!' : 'No scores yet.' }),
          h('div', { class: 'actions' }, scope === 'friends' && signedIn && h('a', { class: 'btn small', href: href.friends() }, 'Add friends'), tab === 'daily' && h('a', { class: 'btn small primary', href: href.daily() }, 'Play today’s game'))));
      } else {
        body.push(h('ol', { class: 'lb-list', 'aria-label': `${tab === 'daily' ? `Today (${day})` : 'All time'} ${scope === 'friends' ? 'friends' : 'everyone'}` }, shown.map(rowEl)));
        if (mine && rows.indexOf(mine) >= TOP) body.push(h('div', { class: 'lb-gap', 'aria-hidden': 'true', text: '· · ·' }), h('ol', { class: 'lb-list' }, rowEl(mine)));
        if (rows.length > TOP && !mine) body.push(h('p', { class: 'muted small', text: `Showing the top ${TOP} of ${rows.length}.` }));
      }
      if (!mine && state === 'ok') {
        if (!signedIn) body.push(h('p', { class: 'lb-note' }, h('a', { href: href.account(), text: 'Sign in' }), ' to join the leaderboard.'));
        else if (tab === 'daily' && rows.length) body.push(h('p', { class: 'lb-note' }, 'You haven’t played today’s Daily Game. ', h('a', { href: href.daily(), text: 'Play it now' }), ' to get on the board.'));
      }
    }
    mount(h('div', { class: 'page-narrow' }, h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Online' }), h('h1', { class: 'page-title', text: 'Leaderboard' }))), bar, h('div', { class: 'lb' }, body)));
  }

  /* ---------------------------------------------------------------- friends ---------- */
  function showFriends({ state, error, data, todayBy = {}, actions }) {
    pageTitle('Friends');
    const wrap = (...k) => mount(h('div', { class: 'page-narrow' }, h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Online' }), h('h1', { class: 'page-title', text: 'Friends' }))), k));
    if (state === 'loading') return wrap(h('p', { class: 'muted', role: 'status', text: 'Loading…' }));
    if (state === 'signedout') return wrap(h('div', { class: 'box hi' }, h('p', { text: 'Sign in (or play as a guest) to add friends.' }), h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: href.account() }, 'Account'))));
    if (state === 'error') return wrap(h('div', { class: 'box hi', role: 'alert' }, h('p', { text: error || 'Couldn’t load your friends.' }), h('a', { class: 'btn small', href: href.friends() }, 'Try again')));
    const { friends = [], incoming = [], outgoing = [] } = data;
    const addMsg = rowMsg();
    const nameIn = h('input', { class: 'text-in', type: 'text', placeholder: 'their username', 'aria-label': 'Friend’s username', maxlength: '16', autocomplete: 'off', spellcheck: 'false' });
    const addBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Add friend');
    const addForm = h('form', { class: 'inline-form', onsubmit: async (e) => {
      e.preventDefault();
      const v = nameIn.value.trim();
      if (!v) return setMsg(addMsg, 'Type your friend’s username.', 'bad');
      const r = await withBusy(addBtn, addMsg, () => actions.add(v), `Request sent to ${v}.`);
      if (r && r.ok) nameIn.value = '';
    } }, nameIn, addBtn);
    const person = (p, ...right) => h('li', { class: 'fr-row' }, avatarEl(p.avatar), h('span', { class: 'fr-name', text: nameOf(p) }), h('span', { class: 'fr-right' }, right));
    const act = (label, cls, fn) => { const b = h('button', { class: `btn small ${cls}`, type: 'button', onclick: async () => { b.disabled = true; const r = await fn(); if (r && !r.ok && b.isConnected) { b.disabled = false; toast(r.error || 'Couldn’t do that. Try again.'); } } }, label); return b; };
    const sections = [h('section', { class: 'box hi' }, h('h2', { text: 'Add a friend' }), addForm, addMsg)];
    if (incoming.length) sections.push(h('section', { class: 'box cyan section' }, h('h2', { text: `Requests (${incoming.length})` }), h('ul', { class: 'fr-list' },
      incoming.map((p) => person(p, act('Accept', 'primary', () => actions.accept(pidOf(p))), act('Decline', 'ghost', () => actions.remove(pidOf(p))))))));
    sections.push(h('section', { class: 'box section' }, h('h2', { text: `Your friends (${friends.length})` }),
      friends.length ? h('ul', { class: 'fr-list' }, friends.map((p) => {
        const t = todayBy[pidOf(p)];
        return person(p, h('span', { class: `fr-today${t ? '' : ' none'}`, text: t ? `${fmt(t.total)} pts today` : 'Hasn’t played today' }), act('Remove', 'ghost', () => actions.remove(pidOf(p))));
      })) : h('p', { class: 'muted', text: 'No friends yet. Add someone by their username.' })));
    if (outgoing.length) sections.push(h('section', { class: 'box section' }, h('h2', { text: 'Waiting for a reply' }), h('ul', { class: 'fr-list' }, outgoing.map((p) => person(p, h('span', { class: 'muted', text: 'Pending' }), act('Cancel', 'ghost', () => actions.remove(pidOf(p))))))));
    wrap(sections);
  }

  /* ---------------------------------------------------------------- play online ---------- */
  function showOnline({ packs: plist, signedIn, actions }) {
    pageTitle('Play online');
    const msg = rowMsg();
    const sel = h('select', { class: 'text-in', 'aria-label': 'Question set' }, h('option', { value: '', text: 'Everyday questions' }), (plist || []).map((p) => h('option', { value: p.id, text: p.name })));
    const mk = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(mk, msg, () => actions.create(sel.value)) }, 'Create game');
    const code = h('input', { class: 'text-in code-in', type: 'text', placeholder: 'ABCDE', 'aria-label': 'Game code', maxlength: '5', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
      oninput: () => { code.value = code.value.replace(/[^A-Za-z]/g, '').toUpperCase(); } });
    const jn = h('button', { class: 'btn', type: 'submit' }, 'Join');
    const joinForm = h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); if (code.value.length !== 5) return setMsg(msg, 'A game code has 5 letters.', 'bad'); withBusy(jn, msg, () => actions.join(code.value)); } }, code, jn);
    const qk = h('button', { class: 'btn cyan', type: 'button', onclick: () => withBusy(qk, msg, actions.quick) }, 'Quick match');
    const gMsg = rowMsg();
    const gBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(gBtn, gMsg, actions.guest) }, 'Play as guest');
    const gate = !signedIn && h('section', { class: 'box hi', style: 'margin-bottom:18px' }, h('h2', { text: 'One quick step' }), h('p', { text: 'Live games need a name. Play as a guest in one tap, or sign in with your email.' }),
      h('div', { class: 'actions' }, gBtn, h('a', { class: 'btn ghost', href: href.account() }, 'Sign in with email')), gMsg);
    const card = (title, text, ...kids) => h('section', { class: 'box online-card' }, h('h2', { text: title }), h('p', { class: 'muted', text }), kids);
    mount(h('div', { class: 'page-narrow' }, h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'eyebrow', text: 'Online' }), h('h1', { class: 'page-title', text: 'Play online' }))),
      h('p', { class: 'lede', text: 'Everyone gets the same 7 questions at the same time. Pick answers few others will pick. If two players give the same answer, both get half the points.' }),
      gate,
      h('div', { class: `online-grid${signedIn ? '' : ' locked'}`, inert: signedIn ? false : true },
        card('Create a game', 'Pick a question set, then share the code or link.', h('label', { class: 'field' }, h('b', { text: 'Questions' }), sel), mk),
        card('Join with code', 'Got a 5-letter code from a friend?', joinForm),
        card('Quick match', 'Jump into an open game with other players, or start one.', qk)),
      msg));
  }

  function showRoomSignIn({ code, actions }) {
    pageTitle(`Game ${code}`);
    const gMsg = rowMsg();
    const gBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(gBtn, gMsg, actions.guest) }, 'Play as guest');
    mount(h('div', { class: 'page-narrow' }, h('section', { class: 'box hi', style: 'margin-top:20px' }, h('span', { class: 'eyebrow', text: 'You’re invited' }), h('h1', { class: 'page-title', text: `Join game ${code}` }),
      h('p', { text: 'Pick a name to play. A guest gets a random one, and you can change it later.' }), h('div', { class: 'actions' }, gBtn), gMsg),
      h('section', { class: 'box section' }, h('h2', { text: 'Or sign in with email' }), emailForm({ cta: 'Send sign-in link', note: 'When you open the link we’ll bring you back to this game.', onSend: actions.email }))));
  }

  /* ---------------------------------------------------------------- live games ---------- */
  let LV = null;   // live screen refs: { key, ... }
  function stopLive() { if (LV && LV.cleanup) LV.cleanup(); LV = null; }

  const placeOf = (list, score) => 1 + list.filter((p) => p.score > score).length;
  const sortPlayers = (list) => list.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.joined_at || '').localeCompare(String(b.joined_at || '')));
  const packLabel = (v) => (v.pack ? v.pack.name : 'Everyday questions');

  function renderLive(v) {
    const key = v.kind === 'round' ? `round-${v.round}` : v.kind === 'reveal' ? `reveal-${v.round}${v.last ? '-last' : ''}` : v.kind;
    if (!LV || LV.key !== key) {
      keepScene = v.kind !== 'lobby'; stopPlay(); keepScene = false; stopLiveInner();
      ({ lobby: buildLobby, countdown: buildCountdown, round: buildRound, reveal: buildReveal, final: buildFinal })[v.kind](v, key);
    }
    if (LV && LV.update) LV.update(v);
  }
  function stopLiveInner() { if (LV && LV.cleanup) LV.cleanup(); LV = null; }

  /* ---- lobby */
  function buildLobby(v, key) {
    pageTitle(`Game ${v.code}`);
    const code = h('div', { class: 'room-code', role: 'img', 'aria-label': `Game code ${v.code.split('').join(' ')}` }, [...v.code].map((c) => h('span', { text: c })));
    const link = h('input', { class: 'text-in', type: 'text', readonly: true, value: v.link, 'aria-label': 'Invite link', onfocus: (e) => e.target.select() });
    const copyBtn = h('button', { class: 'btn small primary', type: 'button', onclick: () => v.actions.copyLink() }, 'Copy invite link');
    const list = h('ul', { class: 'player-list', 'aria-label': 'Players' });
    const hint = h('p', { class: 'muted', role: 'status' });
    const startBtn = h('button', { class: 'btn primary big', type: 'button' }, 'START GAME');
    const msg = rowMsg();
    startBtn.onclick = async () => { const r = await withBusy(startBtn, msg, () => v.actions.start()); if (r && r.ok) sfx('next'); };
    const leave = h('button', { class: 'btn ghost', type: 'button', onclick: () => LV.last.actions.leave() }, 'Leave');
    mount(h('div', { class: 'page-narrow lobby' },
      h('section', { class: 'box hi' }, h('span', { class: 'eyebrow', text: 'Game lobby' }), h('p', { class: 'muted', style: 'margin:0 0 6px', text: 'Friends join with this code:' }), code,
        h('div', { class: 'linkbox' }, link, copyBtn), h('p', { class: 'muted small', style: 'margin:10px 0 0', id: 'lobby-set' })),
      h('section', { class: 'box section' }, h('h2', {}, 'Players ', h('span', { class: 'pill', id: 'lobby-count' })), list),
      h('div', { class: 'actions section' }, startBtn, leave), hint, msg));
    let sig = '';
    LV = {
      key, last: v, cleanup() {},
      update(view) {
        LV.last = view;
        const s = view.active.map((p) => `${p.user_id}|${p.username}|${p.avatar}`).join(',') + view.hostId;
        if (s !== sig) {
          sig = s;
          list.replaceChildren(...view.active.map((p) => h('li', { class: `pl-row${p.user_id === view.myId ? ' me' : ''}` }, avatarEl(p.avatar), h('span', { class: 'pl-name' }, nameOf(p), p.user_id === view.myId && h('span', { class: 'pill pink', text: 'You' })), p.user_id === view.hostId && crownEl())));
          if (view.active.length > (LV.n || 0)) sfx('click'); LV.n = view.active.length;
        }
        root.querySelector('#lobby-count').textContent = `${view.active.length} / ${view.room.max_players || 8}`;
        root.querySelector('#lobby-set').textContent = `${packLabel(view)} · ${view.count} questions · ${Math.round((view.room.timer_ms || 25000) / 1000)} seconds each`;
        startBtn.hidden = !view.isHost; startBtn.disabled = view.active.length < 2 || startBtn.dataset.busy === '1';
        hint.textContent = view.isHost ? (view.active.length < 2 ? 'You need at least 2 players to start. Share the code!' : 'Ready when you are.') : 'Waiting for the host to start the game…';
      },
    };
  }

  /* ---- play-style frame shared by countdown / round / reveal */
  function liveFrame(v, { rail = true } = {}) {
    root.classList.add('is-home', 'is-play');
    page.className = 'page play-page live-page';
    const me = v.me ? (v.me.score || 0) : 0;
    { const first = !sceneCtl || sceneCtl.mode !== 'play' || sceneHost.classList.contains('scene-hidden'); ensureScene('play'); sceneCtl.setDepth(me * 10, { instant: first }); }
    const hudDepth = h('span', { class: 'hud-val cyan', text: `${fmt(me * 10)} m` });
    const hudScore = h('span', { class: 'hud-val pink', text: fmt(me) });
    hudDepth._v = me * 10; hudScore._v = me;
    const pips = h('div', { class: 'hud-pips', 'aria-hidden': 'true' });
    const count = h('div', { class: 'hud-count', 'aria-live': 'polite' });
    const hud = h('header', { class: 'hud', 'aria-label': 'Game status' }, notch('hud-panel', h('span', { class: 'hud-label', text: 'DEPTH' }), hudDepth), h('div', { class: 'hud-mid' }, pips, count), notch('hud-panel', h('span', { class: 'hud-label', text: 'SCORE' }), hudScore));
    const railEl = rail ? h('aside', { class: 'rail', 'aria-label': 'Live scoreboard' }, h('div', { class: 'rail-title', text: 'SCOREBOARD' }), h('ol', { class: 'rail-list' })) : null;
    return { hud, hudDepth, hudScore, pips, count, railEl };
  }
  function paintRail(F, v) {
    if (!F.railEl) return;
    const sorted = sortPlayers(v.active);
    F.railEl.querySelector('.rail-list').replaceChildren(...sorted.map((p) => h('li', { class: `rail-row${p.user_id === v.myId ? ' me' : ''}${v.answered && v.answered[p.user_id] ? ' done' : ''}` },
      h('span', { class: 'rr-place', text: String(placeOf(sorted, p.score || 0)) }), avatarEl(p.avatar), h('span', { class: 'rr-name', text: nameOf(p) }), h('b', { class: 'rr-score', text: fmt(p.score || 0) }),
      v.kind === 'round' && h('span', { class: 'rr-check', 'aria-label': v.answered && v.answered[p.user_id] ? 'answered' : 'thinking', text: v.answered && v.answered[p.user_id] ? '✓' : '…' }))));
  }
  function paintPips(F, v, round) {
    F.pips.replaceChildren(...Array.from({ length: v.count }, (_, i) => h('i', { class: `pip${i + 1 === round && v.kind === 'round' ? ' cur' : ''}${i + 1 < round ? ' t-common' : ''}` })));
    F.count.textContent = `QUESTION ${Math.min(round, v.count)} OF ${v.count}`;
  }
  function paintHud(F, v) {
    const me = v.me ? (v.me.score || 0) : 0;
    tween(F.hudDepth, me * 10, (n) => `${fmt(n)} m`);
    tween(F.hudScore, me, (n) => fmt(n));
  }

  /* ---- 3-2-1 */
  function buildCountdown(v, key) {
    pageTitle('Get ready');
    const F = liveFrame(v);
    const num = h('div', { class: 'cd-num', 'aria-hidden': 'true' });
    const say = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'assertive' });
    const card = h('div', { class: 'cd-overlay' }, h('div', { class: 'cd-label', text: 'GET READY' }), num, h('div', { class: 'cd-sub', text: `${packLabel(v)} · first answer in ${Math.round((v.room.timer_ms || 20000) / 1000)} seconds` }), say);
    page.replaceChildren(F.hud, F.railEl, h('main', { class: 'stage', id: 'stage', tabindex: '-1' }, card));
    paintPips(F, v, 1);
    let lastN = null;
    LV = { key, cleanup() {}, update(view) {
      paintRail(F, view); paintHud(F, view);
      if (view.secs !== lastN) { lastN = view.secs; num.textContent = String(view.secs); num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); say.textContent = String(view.secs); sfx(view.secs <= 1 ? 'next' : 'tick'); }
    } };
  }

  /* ---- a live question */
  function buildRound(v, key) {
    pageTitle(`Question ${v.round}`);
    const F = liveFrame(v);
    const p = v.prompt || { text: '…', category: '' };
    const card = playCard('prompt-card',
      h('div', { class: 'pc-label', text: `QUESTION ${v.round} OF ${v.count} · LIVE` }),
      h('h1', { class: `prompt-text${p.text.length > 140 ? ' xlong' : p.text.length > 90 ? ' long' : ''}`, text: p.text }),
      h('div', { class: 'pc-foot' }, h('span', { class: 'rare-line' }, gdown(), ' rarer answers score more ', gdown()), h('span', { class: 'muted small', text: 'One answer, no hints' })));
    const stage = h('main', { class: 'stage', id: 'stage', tabindex: '-1' }, h('div', { class: 'card-slot' }, card));
    const ringNum = h('span', { class: 'ring-num', 'aria-hidden': 'true' });
    const ring = h('div', { class: 'ring', 'aria-hidden': 'true' });
    const ringWrap = h('div', { class: 'ring-wrap', role: 'timer', 'aria-label': 'Time left' }, ring, ringNum);
    const input = h('input', { class: 'answer-input', type: 'text', id: 'answer', name: 'answer', placeholder: 'type one answer…', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer', maxlength: '80', onkeydown: (e) => { if (e.key.length === 1) sfx('type'); } });
    const timerFill = h('i');
    const msg = h('div', { class: 'dock-msg', role: 'status', 'aria-live': 'polite' });
    const sub = h('button', { class: 'sink-btn', type: 'submit' }, 'GO');
    const form = h('form', { class: 'dock', onsubmit: async (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) { msg.textContent = 'Type an answer first.'; msg.classList.add('on'); return; }
      msg.classList.remove('on'); input.disabled = true; sub.disabled = true;
      const r = await LV.last.actions.submit(t);
      if (r && !r.ok && form.isConnected) { input.disabled = false; sub.disabled = false; input.focus(); msg.textContent = r.error || 'That didn’t send. Try again.'; msg.classList.add('on'); }
    } }, msg, h('div', { class: 'dock-in' }, ringWrap, h('div', { class: 'dock-field' }, input, h('div', { class: 'dock-bar', 'aria-hidden': 'true' }, timerFill)), sub));
    page.replaceChildren(F.hud, F.railEl, stage, form);
    window.scrollTo(0, 0);
    paintPips(F, v, v.round);
    input.focus({ preventScroll: true });
    let lastSecs = null, locked = false, lockedText = '';
    LV = { key, last: v, cleanup() {}, update(view) {
      LV.last = view;
      paintRail(F, view);
      const frac = view.timerMs ? Math.max(0, Math.min(1, view.remainingMs / view.timerMs)) : 0;
      ring.style.setProperty('--f', (Math.ceil(frac * 24) / 24).toFixed(3));
      timerFill.style.width = `${frac * 100}%`;
      const secs = Math.ceil(view.remainingMs / 1000);
      if (secs !== lastSecs) { ringNum.textContent = String(secs); if (secs <= 5 && secs > 0 && lastSecs != null) sfx('tick'); lastSecs = secs; }
      ringWrap.classList.toggle('crit', secs <= 5 && !view.closed); form.classList.toggle('crit', secs <= 5 && !view.closed);
      const m = view.mine;
      if (m) {
        if (!locked) { locked = true; input.disabled = true; sub.disabled = true; sfx('next'); }
        lockedText = m.pending ? 'Sending…' : `Locked in: ${m.answerName || m.input}.${m.tier ? ` ${TIER_INFO[m.tier] ? TIER_INFO[m.tier].label : ''}.` : ''} Waiting for the others…`;
        msg.textContent = lockedText; msg.classList.add('on');
        if (input.value !== m.input) input.value = m.input;
      } else if (view.closed) {
        input.disabled = true; sub.disabled = true; msg.textContent = 'Time’s up. Waiting for the others…'; msg.classList.add('on');
      }
    } };
  }

  /* ---- 6 s reveal */
  function buildReveal(v, key) {
    pageTitle(`Round ${v.round} results`);
    const F = liveFrame(v);
    const standings = h('ol', { class: 'standings', 'aria-label': 'Standings' });
    const answersEl = h('ul', { class: 'rv-list', 'aria-label': 'Everyone’s answers' });
    const bar = h('i'), barWrap = h('div', { class: 'rv-bar', 'aria-hidden': 'true' }, bar);
    const nextLine = h('p', { class: 'muted rv-next', role: 'status' });
    const p = v.prompt;
    const card = playCard('reveal-card',
      h('div', { class: 'pc-label', text: `QUESTION ${v.round} OF ${v.count} · RESULTS` }), h('h2', { class: 'rv-q', text: p ? p.text : '' }), answersEl,
      h('div', { class: 'fb-sub', text: 'Standings' }), standings, nextLine, barWrap);
    page.replaceChildren(F.hud, h('main', { class: 'stage', id: 'stage', tabindex: '-1' }, h('div', { class: 'card-slot' }, card)));
    paintPips(F, { ...v, kind: 'reveal' }, v.round + 1);
    F.count.textContent = `RESULTS ${v.round}/${v.count}`;
    let sig = '', animated = false, order = [], ROW = 44;
    const pointsOf = (r) => (r.answer ? r.answer.points || 0 : 0);
    const paintStand = (view, final) => {
      const gain = new Map(view.rows.map((r) => [r.player.user_id, pointsOf(r)]));
      const pl = view.active.concat(view.players.filter((q) => q.left_at && (q.score || 0) > 0 && !view.active.includes(q)));
      const withScore = pl.map((q) => ({ q, score: final ? (q.score || 0) : (q.score || 0) - (gain.get(q.user_id) || 0), gain: gain.get(q.user_id) || 0 }));
      withScore.sort((a, b) => b.score - a.score || String(a.q.joined_at || '').localeCompare(String(b.q.joined_at || '')));
      standings.style.height = `${withScore.length * ROW}px`;
      withScore.forEach((s, i) => {
        let row = standings.querySelector(`[data-id="${CSS.escape(s.q.user_id)}"]`);
        if (!row) {
          row = h('li', { class: 'st-row', 'data-id': s.q.user_id }, h('span', { class: 'st-place' }), avatarEl(s.q.avatar), h('span', { class: 'st-name', text: nameOf(s.q) }), h('span', { class: 'st-gain' }), h('b', { class: 'st-score' }));
          standings.append(row);
        }
        row.classList.toggle('me', s.q.user_id === view.myId);
        row.style.top = `${i * ROW}px`;
        row.querySelector('.st-place').textContent = String(1 + withScore.filter((x) => x.score > s.score).length);
        row.querySelector('.st-score').textContent = fmt(s.score);
        row.querySelector('.st-gain').textContent = final && s.gain ? `+${s.gain}` : '';
      });
      order = withScore;
    };
    const fill = (view) => {
      const rows = view.rows.slice().sort((a, b) => pointsOf(b) - pointsOf(a));
      answersEl.replaceChildren(...rows.map((r) => {
        const a = r.answer, pts = a ? a.points || 0 : 0, tier = tierName(a ? a.base_points || a.points || 0 : 0);
        return h('li', { class: `rv-row${r.player.user_id === view.myId ? ' me' : ''}${a && a.shared ? ' shared' : ''}` }, avatarEl(r.player.avatar), h('span', { class: 'rv-name', text: nameOf(r.player) }),
          h('span', { class: 'rv-ans' }, h('span', { class: `dot t-${a ? tier : 'none'}` }), a ? (a.answer_name || (a.input ? `${a.input} (not counted)` : 'No answer')) : 'No answer', a && a.shared && h('span', { class: 'pill', text: 'SHARED ½' })),
          h('b', { class: 'rv-pts', text: pts ? `+${pts}` : '0' }));
      }));
    };
    LV = { key, cleanup() { clearTimeout(LV && LV.t); }, update(view) {
      LV.last = view;
      const s = view.rows.map((r) => `${r.player.user_id}:${r.answer ? r.answer.points : '-'}`).join(',');
      if (s !== sig) {
        sig = s; fill(view);
        if (!animated) {
          animated = true; paintStand(view, false);
          const go = () => { paintStand(view, true); sfx('next'); };
          if (reducedMotion()) go(); else LV.t = setTimeout(() => { if (LV && LV.key === key) go(); }, 1100);
        } else paintStand(view, true);
        paintHud(F, view);
      }
      const total = view.last ? 6000 : 6000;
      const left = Math.max(0, view.nextInMs);
      bar.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
      nextLine.textContent = view.last ? 'Final results in a moment…' : `Next question in ${Math.ceil(left / 1000)}…`;
    } };
  }

  /* ---- podium */
  function buildFinal(v, key) {
    pageTitle('Final standings');
    root.classList.add('is-home', 'is-play');
    page.className = 'page play-page live-page';
    const sorted = sortPlayers(v.players.filter((p) => !p.left_at || (p.score || 0) > 0));
    const me = v.me ? (v.me.score || 0) : 0;
    { const first = !sceneCtl || sceneCtl.mode !== 'play' || sceneHost.classList.contains('scene-hidden'); ensureScene('play'); sceneCtl.setDepth(me * 10, { instant: first }); }
    const place = (p) => placeOf(sorted, p.score || 0);
    const top = sorted.filter((p) => place(p) <= 3).slice(0, 3);
    const slot = (p, cls) => p && h('li', { class: `pod ${cls}` }, h('div', { class: 'pod-who' }, avatarEl(p.avatar, 'big'), h('b', { text: nameOf(p) }), h('span', { text: `${fmt(p.score || 0)} pts` })),
      h('div', { class: 'pod-block' }, h('span', { text: String(place(p)) })));
    const first = top.find((p) => place(p) === 1), second = top.find((p) => place(p) === 2 && p !== first), third = top.find((p) => place(p) === 3 && p !== second && p !== first);
    const podium = h('ol', { class: 'podium', 'aria-label': 'Top three' }, slot(second, 'second'), slot(first, 'first'), slot(third, 'third'));
    const iWon = v.me && place(v.me) === 1 && sorted.length > 1;
    const msg = rowMsg();
    const again = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(again, msg, async () => { await v.actions.again(); return { ok: true }; }) }, 'Play again');
    const card = playCard('results-card final-card',
      h('span', { class: 'eyebrow', text: 'Game over' }), h('h1', { class: 'page-title', text: iWon ? 'You won!' : 'Final standings' }), podium,
      h('ol', { class: 'final-list', 'aria-label': 'All players' }, sorted.map((p) => h('li', { class: `fl-row${p.user_id === v.myId ? ' me' : ''}` }, h('span', { class: 'lb-rank', text: `#${place(p)}` }), avatarEl(p.avatar), h('span', { class: 'lb-name', text: nameOf(p) }), p.left_at && h('span', { class: 'muted small', text: 'left' }), h('b', { text: `${fmt(p.score || 0)} pts` })))),
      h('div', { class: 'actions' }, again, h('button', { class: 'btn ghost', type: 'button', onclick: () => LV.last.actions.home() }, 'Home')), msg,
      h('p', { class: 'muted small', text: 'Play again makes a new game and copies its invite link. Send it to the same group.' }));
    page.replaceChildren(h('main', { class: 'stage results-stage', id: 'stage', tabindex: '-1' }, card));
    window.scrollTo(0, 0);
    sfx(iWon ? 'duelWin' : 'finish');
    LV = { key, last: v, cleanup() {}, update(view) { LV.last = view; } };
  }
  /* ================================================================ end v3 ================ */

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
      h('p', {}, 'Someone reached ', h('b', { text: `${fmt(total * 10)} m` }), ' on these 7 questions. You get the same questions with 15 seconds each. If you both give the same answer, both scores for that question are halved.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: onAccept }, 'Accept the duel'), h('a', { class: 'btn ghost', href: href.home() }, 'Not now'))));
  }
  function setPacks(list) { packs = list || []; if (drawerEl) renderDrawer(); }
  function init() { buildShell(); }

  return {
    setAccount, setRejectNote, showTopic, showPartyHost, showOffline, showAccount, showLeaderboard, showFriends, showOnline, showRoomSignIn, renderLive, stopLive, setRank,
    init, setPacks, setContent, setRoute, applySettings, toast, inlineToast, showLoading, showError, showNotFound,
    showHome, showPacks, showArchive, showStats, showHistory, showHow, showGuides, showGuide, showFaq, showAbout,
    setPlayedToday, showInvite, beginPlay, showPrompt, updateTimer, showHint, showReject, showSuggest, showResult, showRun, stopPlay,
    get playing() { return !!P; },
    get playRefs() { return P; },
    TIER_COLOR,
  };
}
