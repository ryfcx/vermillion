/** DEPTH CHARGE UI contract + browser tests. No live backend calls.
 * node tests/party-ui.test.mjs
 * node tests/party-ui.test.mjs --serve 8766  # fixture target for audit:layout
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = '/tmp/vermillion-party-ui-shots';

function fixture() {
  const ok = data => Promise.resolve({ ok: true, data });
  const calls = [], cleanup = { subscriptions: 0, ticks: 0 }, players = Array.from({ length: 10 }, (_, i) => ({
    user_id: `u${i + 1}`, username: i === 0 ? 'VermiFan' : `Diver_${i + 1}`, avatar: ['buddy-vermi', 'buddy-guppy', 'buddy-seahorse', 'buddy-octopus'][i % 4], seat: i + 1, hearts: 2, meter: i * 9, out_at: null, left_at: null, place: i + 1, rating_delta: i === 0 ? 18 : -6,
  }));
  let user = { id: 'u1' }, profile = { username: 'VermiFan', avatar: 'buddy-vermi' }, cb = null, answerStatus = 'miss', fetchFail = false;
  let state = { room: { id: 'r1', code: 'ABCD', host_id: 'u1', status: 'lobby', quick: false, rated: false, is_public: true, size_min: 2, size_max: 6, ready_at: null, question_no: 1, prompt_id: 'p1', holder_id: 'u1', turn_started_at: new Date(Date.now() - 1000).toISOString() }, prompt: { text: 'Name an animal with a tail.' }, players: players.slice(0, 3), used: [], events: [] };
  const online = {
    getUser: () => Promise.resolve(user), getProfile: () => ok(profile), getStats: () => ok({ best_streak: 30 }),
    updateProfile: changes => { calls.push(['profile', changes]); profile = { ...profile, ...changes }; return ok(profile); },
    signInGuest: () => { calls.push(['guest']); user = { id: 'u1' }; return ok(user); }, onAuth: () => () => calls.push(['auth-cleanup']),
  };
  const party = {
    publicRooms: () => { calls.push(['public']); return fetchFail ? Promise.resolve({ ok: false, error: 'Offline fixture' }) : ok([
      { code: 'WAVE', host_name: 'Ocean_friend', players: 2, size_max: 6, status: 'lobby' },
      { code: 'REEF', host_name: 'Coral', players: 10, size_max: 10, status: 'playing' },
      { code: 'FISH', host_name: 'A_friend_with_a_long_name', players: 4, size_max: 6, status: 'playing' },
    ]); },
    createRoom: options => { calls.push(['create', options]); state.room.quick = false; state.room.status = 'lobby'; return ok(state.room); },
    joinRoom: code => { calls.push(['join', code]); return code === 'FAIL' ? Promise.resolve({ ok: false, error: 'No room with that code.' }) : ok(state.room); },
    quickPlay: options => { calls.push(['quick', options]); state.room.quick = true; state.room.rated = options.rated; state.room.status = 'lobby'; state.room.ready_at = new Date(Date.now() + 15000).toISOString(); return ok(state.room); },
    getRoomState: () => { calls.push(['state']); return ok(structuredClone(state)); },
    subscribe: (id, fn) => { cb = fn; cleanup.subscriptions++; return () => { cleanup.subscriptions--; cb = null; }; },
    tick: () => { cleanup.ticks++; return ok(state.room); },
    startRoom: () => { calls.push(['start']); state.room.status = 'playing'; return ok(state.room); },
    leaveRoom: () => { calls.push(['leave']); return ok(true); },
    answer: (id, text) => { calls.push(['answer', id, text]); return answerStatus === 'used' ? Promise.resolve({ ok: false, status: 409, data: { status: 'used' } }) : ok({ status: answerStatus, points: 15 }); },
    sendTyping: (...args) => { calls.push(['typing', ...args]); return ok(true); },
  };
  function push(patch = {}) { state = { ...state, ...patch }; cb?.({ ok: true, data: structuredClone(state) }); }
  function configure(mode) {
    state.room.status = 'playing';
    if (mode === 'guest') user = null;
    if (['home', 'empty', 'offline', 'guest', 'rules'].includes(mode)) return false;
    if (mode === 'waiting' || mode === 'quick') { state.room.status = 'lobby'; state.room.quick = mode === 'quick'; state.room.ready_at = mode === 'quick' ? new Date(Date.now() + 12000).toISOString() : null; }
    if (mode === 'game10') state.players = players;
    if (mode === 'game2') state.players = players.slice(0, 2);
    if (mode === 'watching') state.room.holder_id = 'u2';
    if (mode === 'countdown') state.room.turn_started_at = new Date(Date.now() + 30000).toISOString();
    if (mode === 'out') { state.players = players; state.players[2].hearts = 0; state.players[2].out_at = new Date().toISOString(); }
    if (mode === 'long') { state.prompt.text = 'Name a magical creature or being in the Harry Potter books, including Fantastic Beasts and Where to Find Them.'; state.used = Array.from({ length: 30 }, (_, i) => ({ answer_name: `Already_said_${i}`, points: 15 })); }
    if (mode === 'winner') { state.room.status = 'finished'; state.room.winner_id = 'u1'; state.room.rated = true; state.players = players; }
    return true;
  }
  const modes = { '/': 'home', '/packs': 'out', '/archive/daily': 'guest', '/stats': 'winner', '/history': 'empty', '/how-to-play': 'rules', '/guides': 'long', '/faq': 'offline', '/about': 'boom', '/account': 'guest', '/leaderboard': 'watching', '/friends': 'quick', '/online': 'waiting', '/play/daily/practice': 'game2', '/play/endless': 'game10', '/play/duel': 'countdown' };
  const mode = new URLSearchParams(location.search).get('mode') || modes[location.hash.slice(1) || '/'] || 'home';
  const roomMode = configure(mode); fetchFail = mode === 'offline'; if (mode === 'empty') party.publicRooms = () => ok([]);
  const host = document.querySelector('.party-host');
  const controller = window.partyModule.mountParty(host, { party, online, sprites: window.partySprites, sfx: { play: name => calls.push(['sound', name]) }, bank: { prompts: [] }, navigate: to => calls.push(['navigate', to]), settings: { reducedMotion: mode === 'reduced', sound: false }, code: roomMode ? 'ABCD' : null });
  window.fixture = { calls, cleanup, controller, party, online, get state() { return state; }, setAnswer: value => { answerStatus = value; }, push, typing: text => cb?.({ ok: true, typing: { user_id: state.room.holder_id, text } }), unmount: window.partyModule.unmountParty };
  controller.ready.then(() => {
    if (mode === 'rules') document.querySelector('.dc-howto')?.click();
    if (mode === 'boom') setTimeout(() => { state.players[0].hearts = 1; push({ events: [{ id: 1, kind: 'boom', user_id: 'u1' }] }); }, 1400);
    document.documentElement.dataset.ready = 'true';
  });
  document.querySelector('[aria-label="Open menu"]').onclick = () => document.querySelector('.dc-howto')?.click();
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Party UI fixture</title><link rel="stylesheet" href="/assets/fonts/fonts.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/styles-party.css"><style>body{margin:0}#test-scene{position:fixed;inset:0;z-index:0;pointer-events:none}#root{position:relative;z-index:1}html{scroll-behavior:auto}</style></head><body><div id="test-scene"></div><div id="root" class="shell is-page is-home is-play"><header class="topbar"><div class="topbar-inner"><button type="button" class="menu-trigger" aria-label="Open menu">☰</button></div></header><main class="page party-page"><div class="pg-head">Shared heading must be hidden</div><div class="party-host"></div></main></div><script type="module">import * as ui from '/src/party-ui.js';import * as sprites from '/src/sprites.js';import {startScene} from '/src/scene.js';import {loadAssets} from '/src/displays.js';await loadAssets();await document.fonts.load('18px VT323');await document.fonts.ready;startScene(document.querySelector('#test-scene'),{getWaterY:()=>0,getVermiX:()=>-200});window.partyModule=ui;window.partySprites=sprites;(${fixture.toString()})();</script></body></html>`;

export async function startFixtureServer(port = 0) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__party-fixture')) { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(html); return; }
    const filename = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    try { const data = await fs.readFile(filename); res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png' })[path.extname(filename)] || 'application/octet-stream' }); res.end(data); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return server;
}

async function run() {
  const server = await startFixtureServer(); const base = `http://127.0.0.1:${server.address().port}/__party-fixture/`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  async function load(mode) { await page.goto(`${base}?mode=${mode}`, { waitUntil: 'networkidle0' }); await page.waitForSelector('html[data-ready=true]'); assert(await page.evaluate(() => document.fonts.check('18px VT323') && [...document.fonts].some(f => f.family.replace(/[\"']/g, '') === 'VT323' && f.status === 'loaded')), 'VT323 must be loaded'); }
  async function click(text) { await page.evaluate(value => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === value)?.click(), text); }
  async function waitView(name) { await page.waitForSelector(`.dc-root[data-view="${name}"]`); }
  try {
    await page.setViewport({ width: 1280, height: 800 }); await load('guest');
    assert.equal(await page.$$eval('.dc-root button', a => a.length), 1); await click('PLAY AS GUEST'); await waitView('home');
    assert(await page.evaluate(() => fixture.calls.some(c => c[0] === 'guest')));
    assert.equal(await page.$$eval('.dc-buddy', a => a.length), 9);
    assert.equal(await page.$$eval('.dc-buddy:disabled', a => a.length), 5);
    await page.click('[data-avatar="buddy-guppy"]'); await page.waitForFunction(() => fixture.calls.some(c => c[0] === 'profile' && c[1].avatar === 'buddy-guppy'));
    await page.$eval('.dc-field input', n => { n.value = 'New_Diver'; n.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForFunction(() => fixture.calls.some(c => c[0] === 'profile' && c[1].username === 'New_Diver'));
    assert.equal(await page.$$eval('.dc-public-room', a => a.length), 3);
    assert.equal(await page.$$eval('.dc-public-room:disabled', a => a.length), 2);
    await click('HOW TO PLAY'); assert(await page.$('dialog[open]')); await page.keyboard.press('Escape'); assert.equal(await page.$('dialog[open]'), null);
    await page.click('[data-size="3s"]'); await click('▶ RATED ◀'); await waitView('waiting');
    assert(await page.evaluate(() => fixture.calls.some(c => c[0] === 'quick' && c[1].size === '3s' && c[1].rated)));
    await page.waitForFunction(() => fixture.cleanup.ticks > 0); assert.equal(await page.$eval('.dc-waiting-status', n => n.textContent.includes('Starting in')), true);
    await load('home'); await click('▼ HOST A ROOM ▼'); await waitView('waiting'); await click('▼ START ▼'); await waitView('game');
    assert.equal(await page.$eval('.dc-answer-form', n => n.hidden), false);
    await page.type('.dc-answer-input', '<script>alert(1)</script>'); await page.click('.dc-go'); await page.waitForFunction(() => document.querySelector('.dc-answer-status').textContent === 'not on the list');
    assert(await page.evaluate(() => fixture.calls.some(c => c[0] === 'typing')));
    await page.evaluate(() => fixture.setAnswer('used')); await page.click('.dc-go'); await page.waitForFunction(() => document.querySelector('.dc-answer-status').textContent === 'already said');
    await page.evaluate(() => { fixture.push({ room: { ...fixture.state.room, holder_id: 'u2' }, events: [{ id: 1, kind: 'pass', user_id: 'u1', data: { to: 'u2', answer: 'Otter', points: 15 } }] }); fixture.typing('<img src=x onerror=alert(1)>'); });
    assert.equal(await page.$eval('.dc-answer-form', n => n.hidden), true); assert.equal(await page.$eval('.dc-watching', n => n.textContent.includes('<img')), true); assert.equal(await page.$$('.dc-watching img').then(a => a.length), 0);
    await page.evaluate(() => { fixture.state.players[1].hearts = 0; fixture.state.players[1].out_at = new Date().toISOString(); fixture.push({ events: [{ id: 2, kind: 'boom', user_id: 'u2' }, { id: 3, kind: 'out', user_id: 'u2' }] }); });
    assert.equal(await page.$$('.dc-out').then(a => a.length), 1); assert(await page.$('.dc-booming'));
    await page.evaluate(() => fixture.push({ room: { ...fixture.state.room, status: 'finished', winner_id: 'u1', rated: true } })); await waitView('winner'); assert.equal(await page.$eval('.dc-rating', n => n.textContent), '+18 ELO');
    await page.evaluate(() => fixture.unmount()); assert.equal(await page.$('.dc-root'), null); assert.equal(await page.evaluate(() => fixture.cleanup.subscriptions), 0);
    const ticks = await page.evaluate(() => fixture.cleanup.ticks); await new Promise(r => setTimeout(r, 1100)); assert.equal(await page.evaluate(() => fixture.cleanup.ticks), ticks);
    for (const [w, h] of [[1280,800],[1024,768],[768,1024],[390,844],[360,640],[844,390]]) {
      await page.setViewport({ width: w, height: h });
      for (const mode of ['home','rules','waiting','quick','game2','game10','watching','countdown','long','out','winner','empty','offline']) {
        await load(mode); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${mode} ${w} overflow`);
        const regressions = await page.evaluate(mode => {
          const failures = [], box = s => document.querySelector(s)?.getBoundingClientRect();
          const intersects = (a, b) => a && b && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
          if (mode === 'home') {
            const mark=box('.dc-wordmark'), description=box('.dc-description'), idle=box('.dc-idle-charge');
            if (mark.left < 0 || mark.right > innerWidth) failures.push('wordmark outside viewport');
            if (idle.top < description.bottom) failures.push('charge above the end of the description');
            for (const row of document.querySelectorAll('.dc-public-room')) if (intersects(row.querySelector('.dc-room-code').getBoundingClientRect(),row.querySelector('.dc-room-name').getBoundingClientRect())) failures.push('room code overlaps host');
            for (const key of document.querySelectorAll('.dc-buddy')) {
              const a=key.getBoundingClientRect(), b=key.querySelector('.dc-buddy-name').getBoundingClientRect();
              if (b.left<a.left-1 || b.right>a.right+1 || b.bottom>a.bottom+1) failures.push('buddy label outside key');
            }
          }
          if (mode === 'rules' && intersects(box('.dc-dialog > .dc-eyebrow'),box('.dc-dialog-close'))) failures.push('rules eyebrow overlaps close');
          if (mode === 'game2') {
            const form=document.querySelector('.dc-answer-form'), input=box('.dc-answer-input'), ring=box('.dc-ring');
            if (form.hidden || input.height<1) failures.push('holder answer input missing');
            if (input.bottom>ring.top) failures.push('holder input is below the ring');
            if (innerHeight>=640 && input.bottom>innerHeight) failures.push('holder input below phone fold');
          }
          return failures;
        }, mode);
        assert.deepEqual(regressions, [], `${mode} ${w}x${h} review regressions`);
        if (['home','rules','game10','winner'].includes(mode)) await page.screenshot({ path: `${SHOTS}/${mode}-${w}x${h}.png`, fullPage: true });
      }
    }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await load('home');
    assert.equal(await page.$eval('.dc-idle-charge', n => getComputedStyle(n).animationName), 'none');
    assert.deepEqual(errors, []); console.log('Party UI tests passed: guest/profile/buddies, real-list rendering, matchmaking/host/start, answers/typing/reuse, boom/out/win, cleanup, reduced motion and 6-size fixtures.'); console.log('Screenshots:', SHOTS);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

/** Small DOM adapter for state/cleanup coverage when a browser is unavailable.
 * This checks control flow only; it does not pretend to measure CSS or layout.
 */
async function runUnit() {
  class Node {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.handlers = {}; this.style = { setProperty() {} }; this.className = ''; this._text = ''; this.hidden = false; this.disabled = false; this.value = ''; }
    get classList() { const n = this; return { add(...c) { n.className = [...new Set([...n.className.split(' ').filter(Boolean), ...c])].join(' '); }, remove(...c) { n.className = n.className.split(' ').filter(x => !c.includes(x)).join(' '); }, toggle(c, v) { const yes = v ?? !n.className.split(' ').includes(c); yes ? this.add(c) : this.remove(c); return yes; } }; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
    get firstChild() { return this.children[0]; } get lastChild() { return this.children.at(-1); }
    append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
    replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
    setAttribute(k, v) { this.attributes[k] = String(v); } getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
    async fire(type) { for (const fn of this.handlers[type] || []) await fn({ preventDefault() {}, target: this }); }
    async click() { if (!this.disabled) await this.fire('click'); }
    focus() { document.activeElement = this; } showModal() { this.open = true; } close() { this.open = false; }
    reportValidity() { return true; }
    matches(s) { if (s[0] === '.') return this.className.split(' ').includes(s.slice(1)); if (s.startsWith('[')) { const [key, val] = s.slice(1, -1).split('='); const actual = key.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(key); return val ? actual === val.replace(/["']/g, '') : actual !== undefined && actual !== null; } return this.tagName.toLowerCase() === s; }
    querySelectorAll(selector) { return this.children.flatMap(n => [...(n.matches(selector) ? [n] : []), ...n.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  globalThis.document = { createElement: tag => new Node(tag), activeElement: null };
  globalThis.location = { hash: '', origin: 'http://fixture.invalid', pathname: '/' };
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  const { mountParty, unmountParty } = await import('../src/party-ui.js');
  const calls = []; let signedIn = false, listener, status = 'miss', ticks = 0;
  const players = [{ user_id: 'u1', username: 'First', avatar: 'buddy-vermi', seat: 1, hearts: 2, meter: 15 }, { user_id: 'u2', username: 'Second', avatar: 'buddy-guppy', seat: 2, hearts: 2, meter: 0 }];
  let state = { room: { id: 'r', code: 'ABCD', host_id: 'u1', status: 'lobby', size_max: 6, question_no: 1, holder_id: 'u1', turn_started_at: new Date(0).toISOString() }, players, prompt: { text: 'Name an animal.' }, used: [], events: [] };
  const ok = data => Promise.resolve({ ok: true, data });
  const online = { getUser: () => Promise.resolve(signedIn ? { id: 'u1' } : null), getProfile: () => ok({ username: 'First', avatar: 'buddy-vermi' }), getStats: () => ok({ best_streak: 5 }), signInGuest: () => { signedIn = true; return ok({ id: 'u1' }); }, updateProfile: v => { calls.push(v); return ok(v); } };
  const party = { publicRooms: () => ok([{ code: 'WAVE', host_name: 'Friend', players: 2, size_max: 6, status: 'lobby' }]), createRoom: v => { calls.push(v); return ok(state.room); }, getRoomState: () => ok(state), subscribe: (_, fn) => { listener = fn; return () => { calls.push('unsubscribe'); listener = null; }; }, startRoom: () => { state.room.status = 'playing'; return ok(state.room); }, tick: () => { ticks++; return ok(state.room); }, sendTyping: (...args) => { calls.push(['typing', ...args]); return ok(true); }, answer: () => status === 'used' ? Promise.resolve({ ok: false, status: 409, data: { status } }) : ok({ status }), leaveRoom: () => ok(true) };
  const host = new Node(), ctrl = mountParty(host, { party, online, navigate: v => calls.push(v) }); await ctrl.ready;
  const root = () => host.children[0], find = text => root().querySelectorAll('button').find(b => b.textContent === text);
  assert.equal(root().querySelectorAll('button').length, 1); await find('PLAY AS GUEST').click();
  assert.equal(root().dataset.view, 'home'); assert.equal(root().querySelectorAll('.dc-buddy').length, 9);
  assert.equal(root().querySelectorAll('.dc-buddy').filter(b => b.disabled).length, 7);
  await root().querySelectorAll('.dc-buddy')[1].click(); assert.equal(calls.at(-1).avatar, 'buddy-guppy');
  await find('HOW TO PLAY').click(); assert.equal(root().querySelector('dialog').open, true); await find('GOT IT').click(); assert.equal(root().querySelector('dialog'), null);
  await find('▼ HOST A ROOM ▼').click(); assert.equal(root().dataset.view, 'waiting'); await find('▼ START ▼').click(); assert.equal(root().dataset.view, 'game');
  const form = root().querySelector('.dc-answer-form'), input = root().querySelector('.dc-answer-input'); input.value = 'wrong'; await form.fire('submit'); assert.equal(root().querySelector('.dc-answer-status').textContent, 'not on the list');
  status = 'used'; await form.fire('submit'); assert.equal(root().querySelector('.dc-answer-status').textContent, 'already said');
  state = { ...state, room: { ...state.room, holder_id: 'u2' }, events: [{ id: 1, kind: 'pass', data: { to: 'u2' } }] }; listener({ ok: true, data: state }); assert.equal(form.hidden, true);
  listener({ ok: true, typing: { user_id: 'u2', text: '<img onerror=bad>' } }); assert(root().querySelector('.dc-watching').textContent.includes('<img')); assert.equal(root().querySelector('.dc-watching').children.length, 0);
  state.players[1].hearts = 0; state.players[1].out_at = 'now'; state.events.push({ id: 2, kind: 'boom', user_id: 'u2' }); listener({ ok: true, data: state }); assert.equal(root().querySelectorAll('.dc-out').length, 1);
  state = { ...state, room: { ...state.room, status: 'finished', winner_id: 'u1', rated: true }, players: state.players.map((p, i) => ({ ...p, place: i + 1, rating_delta: i ? -12 : 12 })) }; listener({ ok: true, data: state }); assert.equal(root().dataset.view, 'winner'); assert.equal(root().querySelector('.dc-rating').textContent, '+12 ELO');
  unmountParty(); assert.equal(host.children.length, 0); assert.equal(listener, null); const count = ticks; await new Promise(r => setTimeout(r, 1050)); assert.equal(ticks, count);
  console.log('Party UI DOM-adapter checks passed (not a browser/layout check): guest, picker, rules, hosted start, misses/reuse, holder/typing, boom/out, rated podium and unmount cleanup.');
}

if (process.argv.includes('--unit')) await runUnit();
else if (process.argv.includes('--serve')) { const port = Number(process.argv[process.argv.indexOf('--serve') + 1]) || 8766; const s = await startFixtureServer(port); console.log(`Party fixture: http://127.0.0.1:${s.address().port}/__party-fixture/`); }
else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
