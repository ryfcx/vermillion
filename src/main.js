// Vermillion v2 — wiring: routes, run lifecycle, timer loop, settings, ?duel= handling.
import { loadBank, loadAnswers, getPrompt, loadPacks, promptsForPack } from './content.js';
import { matchAnswer } from './matcher.js';
import { scoreAnswer } from './score.js';
import * as modes from './modes.js';
import * as storage from './storage.js';
import { shareRun } from './share.js';
import { shuffle } from './rng.js';
import { createGame } from './game.js';
import { createUI } from './ui.js';
import { loadAssets, assets, displayKindFor } from './displays.js';
import { createRouter, href } from './router.js';
import { ONLINE } from './config.js';

const root = document.getElementById('root');
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };

let bank = null;
let packs = [];
let guides = [];
let faq = [];
let settings = { easyRead: false, reducedMotion: false, sound: true, volume: 0.6, theme: 'neon' };
let invite = null;            // decoded ?duel= payload
let inviteAccepted = false;
let run = null;               // { game, route, meta, timer, saved, theirs }
let historyFilter = 'all';
let router = null;

const today = () => modes.utcDayKey();
const byId = (id) => (bank ? getPrompt(bank, id) : undefined);
const packById = (id) => packs.find((p) => p.id === id);

/* ------------------------------------------------------------------ UI callbacks */
const ui = createUI(root, {
  getSettings: () => settings,
  toggleSetting: (key) => { setSettings({ [key]: !settings[key] }); },
  setSettings: (patch) => setSettings(patch),
  acceptSuggest: () => {
    if (!run || !ui.playing) return;
    const res = run.game.acceptSuggestion(Date.now());
    if (res.status === 'match' || res.status === 'timeout') {
      stopTimer();
      const st = run.game.getState();
      ui.showResult(st, { rivalPoints: rivalPoints(st.index) });
    }
  },
  dismissSuggest: () => { if (run) run.game.dismissSuggestion(); },
  cycleTheme: () => {
    const order = ['neon', 'midnight', 'crt'];
    setSettings({ theme: order[(order.indexOf(settings.theme) + 1) % order.length] });
  },
  submit: (text) => onSubmit(text),
  hint: () => { if (run) ui.showHint(run.game.useHint()); },
  next: () => onNext(),
  share: async (r) => {
    const status = await shareRun(r);
    ui.inlineToast(status === 'copied' ? 'Result copied to clipboard.' : status === 'shared' ? 'Shared!' : 'Couldn’t share. Copy the text by hand.');
  },
  copyLink: (link) => copyText(link, 'Duel link copied.'),
  challenge: (r) => {
    const link = duelLink(r);
    if (!link) return ui.inlineToast('This game can’t be turned into a duel.');
    copyText(link, 'Duel link copied. Send it to a friend!');
  },
  playAgain: () => playAgain(),
  historyFilter: (f) => { historyFilter = f; showHistory(); },
});

function setSettings(patch) {
  settings = { ...settings, ...patch };
  safe(() => storage.saveSettings(settings));
  applySettings();
}
function applySettings() {
  ui.applySettings(settings);
  try {
    assets.sfx?.setMuted?.(!settings.sound);
    assets.sfx?.setVolume?.(settings.volume);
  } catch { /* audio is optional */ }
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); ui.inlineToast(okMsg); }
  catch { ui.inlineToast('Select the link and copy it manually.'); }
}

/* ------------------------------------------------------------------ data helpers */
async function loadJson(url, key) {
  try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const d = await r.json(); return Array.isArray(d?.[key]) ? d[key] : []; }
  catch { return []; }
}

function officialFor(r) { return safe(() => storage.getOfficialResult(r), null); }
function statsNow() { return safe(() => storage.getStats(), { runs: 0, bestDepth: 0, totalPoints: 0, avgPoints: 0, dailyStreak: 0, bestStreak: 0, mythicCount: 0, rareCount: 0, perPack: {}, tierCounts: {} }); }

function packPoolPrompts(packId) {
  return safe(() => promptsForPack(bank, packId), []);
}

function archiveDays() {
  return safe(() => modes.listArchiveDays(today()), []);
}
const dayValid = (d) => !d || (d >= (modes.LAUNCH_DAY || '2026-11-01') && d <= today());

function duelLink(r) {
  try {
    const slim = {
      promptIds: r.promptIds, total: r.total,
      answers: r.answers.map((a) => ({ promptId: a.promptId, input: a.input || '', answerName: a.answerName, points: a.points })),
    };
    return `${location.origin}${location.pathname}?duel=${modes.encodeDuel(slim)}`;
  } catch { return null; }
}


/* ------------------------------------------------------------------ online glue (CONTRACT §8)
   online.js / rooms.js / score.js belong to other lanes. They are loaded lazily and every call fails soft,
   so the solo game never depends on them. */
const OFFLINE_ERR = { ok: false, error: 'Online play isn’t available right now.' };
let onlineMod = null, roomsMod = null, scoreMod = null;
let acct = { user: null, profile: null };
async function loadOnlineModules() {
  if (!ONLINE.enabled) return;
  try { onlineMod = await import('./online.js'); } catch { onlineMod = null; }
  try { roomsMod = await import('./rooms.js'); } catch { roomsMod = null; }
  try { scoreMod = await import('./score.js'); } catch { scoreMod = null; }
}
const onlineAvailable = () => !!(ONLINE.enabled && onlineMod && safe(() => onlineMod.available(), false) === true);
async function onl(fn, ...args) {
  try { if (!onlineMod || typeof onlineMod[fn] !== 'function') return OFFLINE_ERR; return (await onlineMod[fn](...args)) || OFFLINE_ERR; }
  catch (err) { return { ok: false, error: String(err?.message || 'Something went wrong.') }; }
}
async function rm(fn, ...args) {
  try { if (!roomsMod || typeof roomsMod[fn] !== 'function') return OFFLINE_ERR; return (await roomsMod[fn](...args)) || OFFLINE_ERR; }
  catch (err) { return { ok: false, error: String(err?.message || 'Something went wrong.') }; }
}
const roomOf = (d) => { const r = Array.isArray(d) ? d[0] : d; return r && r.room && !r.code ? r.room : r || null; };
const unwrapUser = (r) => (r && r.ok === false ? null : (r && r.ok === true && 'data' in r ? r.data : r)) || null;
async function refreshAccount() {
  if (!onlineMod) { acct = { user: null, profile: null }; return pushAccount(); }
  let user = null, profile = null;
  try { user = unwrapUser(await onlineMod.getUser()); } catch { user = null; }
  if (user && !user.id) user = null;
  if (user) { const pr = await onl('getProfile'); profile = pr.ok ? pr.data : null; }
  acct = { user, profile };
  pushAccount();
}
function pushAccount() { ui.setAccount({ enabled: ONLINE.enabled, available: onlineAvailable(), user: acct.user, profile: acct.profile }); }

/* ------------------------------------------------------------------ routing */
function onRoute(r) {
  stopTimer();
  screenToken++;
  if (r.name !== 'room') stopLive();
  if (r.name !== 'party') unmountParty();
  ui.setRoute(r);
  if (!bank) return;
  try {
    switch (r.name) {
      case 'home': return showHome();
      case 'play': return startRun(r);
      case 'packs': return showPacks();
      case 'pack': return showTopic(r.packId);
      case 'archive': return showArchive(r.target);
      case 'stats': return ui.showStats({ stats: statsNow() });
      case 'history': return showHistory();
      case 'how': return ui.showHow();
      case 'guides': return ui.showGuides({ guides });
      case 'guide': return showGuide(r.slug);
      case 'faq': return ui.showFaq({ faq });
      case 'about': return ui.showAbout();
      case 'account': return showAccount();
      case 'leaderboard': return showLeaderboard();
      case 'friends': return showFriends();
      case 'online': return showOnlineHome();
      case 'room': return showRoom(r.code);
      case 'party': return showParty(r.code);
      default: return ui.showNotFound();
    }
  } catch (err) {
    console.error(err);
    ui.showError('Something went wrong drawing this page.', () => router.reload());
  }
}

/* DEPTH CHARGE: Sol's UI (src/party-ui.js + styles-party.css) mounts into a blank page; Luna's src/party.js is the data layer. Fails soft. */
let partyMod = null;
function unmountParty() { try { partyMod?.unmountParty?.(); } catch { /* ignore */ } }
async function showParty(code) {
  if (offlineGate('Depth charge')) return;
  const token = screenToken;
  try {
    const [ui2, party] = await Promise.all([import('./party-ui.js'), import('./party.js')]);
    if (token !== screenToken) return;
    partyMod = ui2;
    const host = ui.showPartyHost();
    ui2.mountParty(host, {
      party, online: onlineMod, sprites: assets.sprites, sfx: assets.sfx, bank, settings, code: code || null,
      navigate: (to) => router.go(typeof to === 'string' && to.startsWith('#') ? to : href.party(to)),
    });
  } catch (err) {
    console.error(err);
    ui.showError('Depth charge is not available yet.', () => router.reload());
  }
}

function packDoneMap() {
  const out = {};
  for (const p of packs) out[p.id] = officialFor({ mode: 'pack', packId: p.id, dayKey: today() });
  return out;
}

function showHome() {
  const launch = Date.parse(`${modes.LAUNCH_DAY || '2026-11-01'}T00:00:00Z`);
  const days = Math.max(0, Math.floor((Date.parse(`${today()}T00:00:00Z`) - launch) / 86400000));
  const featured = packs.length ? packs[days % packs.length] : null;   // one pack per UTC day, same for everyone
  const homeToken = screenToken;
  // a real "N played today" count (leaderboard rows); shown only if the server answers, never invented
  if (onlineAvailable()) onl('dailyBoard', { day: today(), scope: 'all', limit: 1000 }).then((r) => { if (r.ok && Array.isArray(r.data) && router?.current?.name === 'home' && homeToken === screenToken) ui.setPlayedToday(r.data.length); });
  ui.showHome({ stats: statsNow(), dailyDone: officialFor({ mode: 'daily', dayKey: today() }), dayKey: today(), packDone: packDoneMap(), guides, faq, featured, descent: days + 1 });
}
function showTopic(packId) {
  const pack = packById(packId);
  if (!pack) return ui.showNotFound();
  ui.showTopic({ pack, progress: safe(() => storage.getChapterProgress(packId), { unlocked: 1, chapters: {} }), doneToday: !!officialFor({ mode: 'pack', packId, dayKey: today() }) });
}
function showPacks() {
  const counts = {};
  for (const p of packs) counts[p.id] = packPoolPrompts(p.id).length;
  ui.showPacks({ packDone: packDoneMap(), counts });
}
function showArchive(target) {
  const isDaily = target === 'daily';
  if (!isDaily && !packById(target)) return ui.showNotFound();
  const days = archiveDays();
  const status = {};
  for (const d of days) status[d] = officialFor(isDaily ? { mode: 'daily', dayKey: d } : { mode: 'pack', packId: target, dayKey: d });
  ui.showArchive({ target, days, status, today: today() });
}
function showGuide(slug) {
  const i = guides.findIndex((g) => g.slug === slug);
  if (i < 0) return ui.showNotFound();
  ui.showGuide({ guide: guides[i], prev: guides[i - 1], next: guides[i + 1] });
}
function showHistory() {
  const mode = historyFilter === 'all' ? undefined : historyFilter;
  const runs = safe(() => storage.getHistory({ limit: 50, mode }), []);
  ui.showHistory({
    runs, filter: historyFilter,
    onOpen: (i) => showSaved(runs[i]),
  });
}


/* ------------------------------------------------------------------ online screens: account, boards, friends */
const offlineGate = (title) => {
  if (!ONLINE.enabled || !onlineAvailable()) { ui.showOffline(title); return true; }
  return false;
};

async function showAccount() {
  if (offlineGate('Account')) return;
  ui.showLoading('Loading your account');
  await refreshAccount();
  const token = ++screenToken;
  let stats = null;
  if (acct.user) { const r = await onl('getStats'); stats = r.ok ? r.data : null; }
  if (token !== screenToken) return;
  const rerender = async () => { await refreshAccount(); if (router?.current?.name === 'account') showAccount(); };
  ui.showAccount({
    user: acct.user, profile: acct.profile, stats,
    actions: {
      guest: async () => { const r = await onl('signInGuest'); if (r.ok) await rerender(); return r; },
      email: (email) => onl('signInEmail', email),
      upgrade: (email) => onl('upgradeGuest', email),
      signOut: async () => { const r = await onl('signOut'); if (r.ok) { await rerender(); ui.toast('Signed out.'); } return r; },
      save: async (patch) => { const r = await onl('updateProfile', patch); if (r.ok) { await refreshAccount(); } return r; },
    },
  });
}

let screenToken = 0;   // guards async screens against a newer navigation
const lb = { tab: 'daily', scope: 'all' };
async function showLeaderboard() {
  if (offlineGate('Leaderboard')) return;
  const token = ++screenToken;
  const draw = (state, rows, extra = {}) => ui.showLeaderboard({
    tab: lb.tab, scope: lb.scope, state, rows: rows || [], meId: acct.user?.id || null, day: today(),
    signedIn: !!acct.user, error: extra.error,
    onTab: (t) => { lb.tab = t; showLeaderboard(); },
    onScope: (sc) => { lb.scope = sc; showLeaderboard(); },
  });
  draw('loading');
  if (!acct.user) await refreshAccount();
  const r = lb.tab === 'daily'
    ? await onl('dailyBoard', { day: today(), scope: lb.scope, limit: 500 })
    : await onl('allTimeBoard', { scope: lb.scope, limit: 500 });
  if (token !== screenToken) return;
  if (!r.ok) return draw('error', [], { error: r.error });
  draw('ok', Array.isArray(r.data) ? r.data : (r.data?.rows || []));
}

const otherIds = (d) => {
  const fix = (p) => ({ ...p, id: p.user_id === acct.user?.id ? p.friend_id : p.user_id });
  return { friends: (d.friends || []).map(fix), incoming: (d.incoming || []).map(fix), outgoing: (d.outgoing || []).map(fix) };
};
async function showFriends() {
  if (offlineGate('Friends')) return;
  const token = ++screenToken;
  if (!acct.user) await refreshAccount();
  if (token !== screenToken) return;
  if (!acct.user) return ui.showFriends({ state: 'signedout' });
  ui.showFriends({ state: 'loading' });
  const [fr, board] = await Promise.all([onl('listFriends'), onl('dailyBoard', { day: today(), scope: 'friends', limit: 200 })]);
  if (token !== screenToken) return;
  if (!fr.ok) return ui.showFriends({ state: 'error', error: fr.error });
  const todayBy = {};
  for (const row of (Array.isArray(board.data) ? board.data : [])) todayBy[row.user_id] = row;
  const redo = () => { if (router?.current?.name === 'friends') showFriends(); };
  ui.showFriends({
    state: 'ok', data: otherIds(fr.data || {}), todayBy,
    actions: {
      add: async (name) => { const r = await onl('requestFriend', name); if (r.ok) redo(); return r; },
      accept: async (id) => { const r = await onl('acceptFriend', id); if (r.ok) redo(); return r; },
      remove: async (id) => { const r = await onl('removeFriend', id); if (r.ok) redo(); return r; },
    },
  });
}

/* ------------------------------------------------------------------ play online: create, join, quick match */
function showOnlineHome() {
  if (offlineGate('Play online')) return;
  const token = ++screenToken;
  const go = async (promise) => {
    const r = await promise;
    if (token !== screenToken) return r;
    const room = r.ok ? roomOf(r.data) : null;
    if (room?.code) router.go(href.room(room.code));
    return r.ok && !room?.code ? { ok: false, error: 'The game was made but we couldn’t open it. Try again.' } : (r.ok ? r : { ...r, error: plainRoomError(r.error) });
  };
  ui.showOnline({
    packs, signedIn: !!acct.user,
    actions: {
      guest: async () => { const r = await onl('signInGuest'); if (r.ok) await refreshAccount(); return r; },
      create: (packId) => go(rm('createRoom', { pack: packId || null, public: false })),
      join: (code) => go(rm('joinRoom', String(code).trim().toUpperCase())),
      quick: () => go(rm('quickMatch')),
    },
  });
  // refresh once; re-render only if the sign-in state actually changed (otherwise this would loop forever while signed out)
  if (!acct.user) refreshAccount().then(() => { if (acct.user && token === screenToken && router?.current?.name === 'online') showOnlineHome(); });
}

/* ------------------------------------------------------------------ live rooms */
let live = null;
const PENDING_ROOM = 'vermillion.pendingRoom';
function stopLive() {
  if (!live) return;
  clearInterval(live.timer);
  try { if (typeof live.unsub === 'function') live.unsub(); } catch { /* ignore */ }
  live = null;
  ui.stopLive();
}
function plainRoomError(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('no room')) return 'We couldn’t find a game with that code. Check the letters and try again.';
  if (m.includes('already started')) return 'That game has already started. Ask the host to make a new one.';
  if (m.includes('full')) return 'That game is full (8 players).';
  return msg || 'Something went wrong. Try again.';
}
const inviteLink = (code) => `${location.origin}${location.pathname}${href.room(code)}`;
const serverNow = () => safe(() => roomsMod.serverNow(), Date.now());

async function showRoom(code) {
  stopLive();
  if (offlineGate('Live game')) return;
  const token = ++screenToken;
  if (!acct.user) await refreshAccount();
  if (token !== screenToken) return;
  if (!acct.user) {
    return ui.showRoomSignIn({
      code,
      actions: {
        guest: async () => { const r = await onl('signInGuest'); if (r.ok) { await refreshAccount(); if (token === screenToken) showRoom(code); } return r; },
        email: async (email) => { safe(() => sessionStorage.setItem(PENDING_ROOM, code)); return onl('signInEmail', email); },
      },
    });
  }
  ui.showLoading(`Joining game ${code}`);
  const jr = await rm('joinRoom', code);
  if (token !== screenToken) return;
  if (!jr.ok) return ui.showError(plainRoomError(jr.error), () => showRoom(code), 'Can’t join that game');
  const room0 = roomOf(jr.data);
  if (!room0?.id) return ui.showError('We couldn’t open that game. Try again.', () => showRoom(code), 'Can’t join that game');
  const L = live = { id: room0.id, code, myId: acct.user.id, state: { room: room0, players: [], answers: [] }, unsub: null, timer: 0, advRound: 0, advAt: 0, finishSeen: null, answer: {}, fresh: room0.status === 'finished' };
  const apply = (st) => { if (live !== L || !st) return; if (st.ok === false) { if (!L.warned) { L.warned = true; ui.toast(st.error || 'Live updates were interrupted.'); } return; } if (!st.room) return; L.warned = false; L.state = st; if (st.room.status === 'finished' && L.finishSeen == null && !L.fresh) L.finishSeen = serverNow(); drawLive(); };
  const first = await rm('getRoomState', L.id);
  if (live !== L) return;
  if (first.ok) apply(first.data);
  try { L.unsub = await roomsMod.subscribe(L.id, apply); } catch { /* the 1 s refresh below still advances the screen */ }
  L.timer = setInterval(() => drawLive(), 100);
  L.poll = setInterval(async () => { const r = await rm('getRoomState', L.id); if (r.ok) apply(r.data); }, 4000);   // safety net if realtime drops
  const origStop = L.unsub;
  L.unsub = () => { clearInterval(L.poll); if (typeof origStop === 'function') origStop(); };
  drawLive();
}

function liveView() {
  const L = live; if (!L) return null;
  const { room, players = [], answers = [] } = L.state;
  const now = serverNow();
  const ids = Array.isArray(room.prompt_ids) ? room.prompt_ids : [];
  const count = ids.length || modes.PROMPTS_PER_RUN;
  const prompts = ids.map((id) => byId(id));
  const active = players.filter((p) => !p.left_at);
  const me = players.find((p) => p.user_id === L.myId) || null;
  const host = room.host_id;
  const base = {
    room, code: room.code || L.code, players, active, me, myId: L.myId, hostId: host, isHost: host === L.myId, count,
    pack: room.pack_id ? packById(room.pack_id) : null, link: inviteLink(room.code || L.code), now,
  };
  const rowsFor = (r) => players.map((p) => {
    const a = answers.find((x) => x.user_id === p.user_id && x.round === r);
    return { player: p, answer: a || null };
  });
  if (room.status === 'lobby') return { ...base, kind: 'lobby', actions: liveActions() };
  const round = room.round || 1;
  const start = room.round_started_at ? Date.parse(room.round_started_at) : now;
  const timerMs = room.timer_ms || 25000;
  const end = start + timerMs;
  const mine = (r) => L.answer[r] || (answers.find((x) => x.user_id === L.myId && x.round === r) ? { input: answers.find((x) => x.user_id === L.myId && x.round === r).input, answerName: answers.find((x) => x.user_id === L.myId && x.round === r).answer_name } : null);
  const revealOf = (r) => ({ round: r, prompt: prompts[r - 1] || null, rows: rowsFor(r) });
  if (room.status === 'finished') {
    if (L.finishSeen != null && now - L.finishSeen < 6000) return { ...base, kind: 'reveal', ...revealOf(round), nextInMs: 6000 - (now - L.finishSeen), last: true, actions: liveActions() };
    return { ...base, kind: 'final', actions: liveActions() };
  }
  if (now < start) {
    if (round <= 1) return { ...base, kind: 'countdown', secs: Math.max(1, Math.ceil((start - now) / 1000)), prompt: null, round: 1, actions: liveActions() };
    return { ...base, kind: 'reveal', ...revealOf(round - 1), nextInMs: start - now, last: false, actions: liveActions() };
  }
  const answered = {};
  for (const p of players) answered[p.user_id] = !!(p.answered === true || p.answered_round === round || answers.some((x) => x.user_id === p.user_id && x.round === round));
  if (mine(round)) answered[L.myId] = true;
  if (now >= end) {
    if (L.advRound !== round || now - L.advAt > 2000) { L.advRound = round; L.advAt = now; rm('advance', L.id, round); }
    return { ...base, kind: 'round', round, prompt: prompts[round - 1], remainingMs: 0, timerMs, answered, mine: mine(round), closed: true, actions: liveActions() };
  }
  return { ...base, kind: 'round', round, prompt: prompts[round - 1], remainingMs: end - now, timerMs, answered, mine: mine(round), closed: false, actions: liveActions() };
}
function drawLive() { if (!live) return; const v = liveView(); if (v) ui.renderLive(v); }

function liveActions() {
  const L = live;
  return {
    copyLink: () => copyText(inviteLink(L.state.room.code || L.code), 'Invite link copied. Send it to your friends!'),
    start: async () => { const r = await rm('startRoom', L.id); if (!r.ok) ui.toast(plainRoomError(r.error)); return r; },
    leave: async () => { const id = L.id; stopLive(); await rm('leaveRoom', id); router.go(href.online()); },
    home: async () => { const id = L.id; stopLive(); await rm('leaveRoom', id); router.go(href.home()); },
    submit: async (text) => {
      const round = L.state.room.round || 1;
      if (L.answer[round]) return { ok: true };
      L.answer[round] = { input: text, pending: true };
      drawLive();
      const r = await rm('answer', L.id, round, text);
      if (r.ok) { L.answer[round] = { input: text, answerName: r.data?.answerName || null, tier: r.data?.tier || null, basePoints: r.data?.basePoints ?? null }; }
      else if (/already|duplicate|409/i.test(String(r.error))) L.answer[round] = { input: text, answerName: null };
      else delete L.answer[round];
      drawLive();
      return r;
    },
    again: async () => {
      const packId = L.state.room.pack_id || null;
      const r = await rm('createRoom', { pack: packId, public: false });
      const room = r.ok ? roomOf(r.data) : null;
      if (!room?.code) return ui.toast(plainRoomError(r.error));
      await copyText(inviteLink(room.code), 'New game made. Invite link copied: send it to the same group.');
      router.go(href.room(room.code));
    },
  };
}

/* ------------------------------------------------------------------ runs */
function metaFor({ mode, packId, dayKey, practice, official, archive, rival }) {
  const pack = packId ? packById(packId) : null;
  return {
    mode, packId, dayKey: mode === 'daily' || mode === 'pack' ? dayKey : null,
    title: pack ? pack.name : mode === 'daily' ? 'Daily Game' : mode === 'endless' ? 'Endless' : 'Duel',
    icon: pack ? pack.icon : mode, official, practice, archive, rival,
    displayKind: displayKindFor(mode, packId),
  };
}

function startRun(r) {
  if (!bank) return;
  const { mode, packId } = r;
  let prompts = null, official = false, practice = !!r.practice, archive = false, theirs = null;
  const dayKey = r.dayKey || today();

  if (!dayValid(r.dayKey)) return ui.showNotFound();

  if (mode === 'daily') {
    if (!practice) {
      const done = officialFor({ mode: 'daily', dayKey });
      if (done) return showSaved(done);
      official = true; archive = dayKey !== today();
    }
    prompts = modes.getDailyPrompts(bank, practice ? today() : dayKey);
  } else if (mode === 'endless') {
    prompts = modes.getEndlessPrompts(bank, safe(() => storage.getRecentPromptIds(), []), Math.random);
  } else if (mode === 'duel') {
    if (invite && !inviteAccepted) {
      return ui.showInvite({ total: invite.total, onAccept: () => { inviteAccepted = true; startRun(r); } });
    }
    if (invite) {
      prompts = invite.promptIds.map((id) => getPrompt(bank, id));
      if (prompts.some((p) => !p)) { invite = null; inviteAccepted = false; return ui.showError('This duel uses questions this version of the game doesn’t have.', () => router.go(href.home())); }
      theirs = invite;
    } else {
      prompts = modes.getEndlessPrompts(bank, safe(() => storage.getRecentPromptIds(), []), Math.random);
    }
  } else if (mode === 'chapter') {
    const pack = packById(packId), n = r.chapter;
    if (!pack || !Array.isArray(pack.chapters) || !pack.chapters[n - 1]) return ui.showNotFound();
    const prog = safe(() => storage.getChapterProgress(packId), { unlocked: 1 });
    if (n > prog.unlocked) return router.go(href.topic(packId));
    prompts = pack.chapters[n - 1].map((id) => getPrompt(bank, id));
    if (prompts.some((p) => !p)) return ui.showError('This chapter uses questions this version of the game doesn’t have.', () => router.go(href.topic(packId)));
  } else if (mode === 'pack') {
    const pack = packById(packId);
    if (!pack) return ui.showNotFound();
    if (!practice) {
      const done = officialFor({ mode: 'pack', packId, dayKey });
      if (done) return showSaved(done);
      official = true; archive = dayKey !== today();
      prompts = modes.getPackDailyPrompts(bank, packId, dayKey);
    } else {
      prompts = shuffle(packPoolPrompts(packId), Math.random).slice(0, modes.PROMPTS_PER_RUN);
    }
  }
  if (!prompts || prompts.length < modes.PROMPTS_PER_RUN) {
    return ui.showError('Not enough questions to start a game yet.', () => router.go(href.home()), 'Not enough questions');
  }

  // Answers live in per-question shards (data/answers/<id>.json); fetch the 7 we need first.
  if (prompts.some((p) => !Array.isArray(p.answers))) {
    const token = ++screenToken;
    loadAnswers(prompts).then(() => { if (token === screenToken) begin(); },
      () => { if (token === screenToken) ui.showError('Could not load this game’s answers. Check your connection and try again.', () => router.go(href.home())); });
    return;
  }
  begin();

  function begin() {
  const limit = modes.TIMERS?.[mode] ?? (mode === 'duel' ? 15000 : 25000);
  const game = createGame({
    prompts, mode, packId: packId || null, timeLimitMs: limit, match: matchAnswer, score: scoreAnswer,
    dayKey: mode === 'daily' || mode === 'pack' ? dayKey : null, practice, official,
  });
  const meta = metaFor({ mode, packId, dayKey, practice, official, archive, rival: !!theirs });
  if (mode === 'chapter') { meta.chapter = r.chapter; meta.title = `${packById(packId).name} · Chapter ${r.chapter}`; }
  run = { game, route: r, meta, timer: 0, saved: false, theirs };
  ui.beginPlay(meta, game.getState());
  startTimer();
  }
}

function startTimer() { stopTimer(); if (run) run.timer = setInterval(onTick, 100); }
function stopTimer() { if (run && run.timer) { clearInterval(run.timer); run.timer = 0; } }

function rivalPoints(upTo) {
  if (!run || !run.theirs) return undefined;
  return run.theirs.answers.slice(0, upTo + 1).reduce((s, a) => s + a.points, 0);
}

function onTick() {
  if (!run || !ui.playing) return;
  const { game } = run;
  if (game.tick(Date.now())) {
    stopTimer();
    const st = game.getState();
    ui.showResult(st, { rivalPoints: rivalPoints(st.index) });
  } else {
    ui.updateTimer(game.getState());
  }
}

function onSubmit(text) {
  if (!run || !ui.playing) return;
  const res = run.game.submit(text, Date.now());
  if (res.status === 'match' || res.status === 'timeout') {
    stopTimer();
    const st = run.game.getState();
    ui.showResult(st, { rivalPoints: rivalPoints(st.index) });
  } else if (res.status === 'suggest') {
    ui.showSuggest(res.suggestion);
  } else if (res.status === 'unknown' || res.status === 'empty') {
    const st = run.game.getState();
    // unknown solo answer: tell the server (fire-and-forget; it never changes scores) and say so quietly, only when signed in
    const input = String(text || '').trim();
    const promptId = st.prompt?.id;
    const review = res.status === 'unknown' && input.length >= 2 && promptId && acct.user && onlineAvailable() && typeof onlineMod?.reviewAnswer === 'function';
    ui.showReject(res.status, st.rejected, review ? 'not on our list yet · sent for review' : null);
    if (review) {
      const token = run;
      Promise.resolve(onl('reviewAnswer', promptId, input)).then((r) => {
        if (run === token && r?.ok && r.data?.verdict?.valid === true) ui.setRejectNote('looks right, so we’ll add it');
      }).catch(() => {});
    }
  }
}
function onNext() {
  if (!run) return;
  const state = run.game.next(Date.now());
  if (state.finished) return finish(run.game.getRun());
  ui.showPrompt(state);
  startTimer();
}

/* ------------------------------------------------------------------ results */
function nextPackSuggestion(r) {
  if (!packs.length) return null;
  const idx = r.packId ? packs.findIndex((p) => p.id === r.packId) : -1;
  const seed = [...(r.dayKey || today())].reduce((s, c) => s + c.charCodeAt(0), 0);
  for (let i = 1; i <= packs.length; i++) {
    const p = packs[(idx >= 0 ? idx + i : seed + i) % packs.length];
    if (p.id !== r.packId && !officialFor({ mode: 'pack', packId: p.id, dayKey: today() })) return p;
  }
  return null;
}

function buildView(r, extra = {}) {
  const kind = displayKindFor(r.mode === 'pack' ? 'pack' : r.mode, r.packId);
  const pack = r.packId ? packById(r.packId) : null;
  const title = pack ? pack.name : r.mode === 'daily' ? 'Daily Game' : r.mode === 'endless' ? 'Endless' : 'Duel';
  const challengeable = r.answers.length === modes.PROMPTS_PER_RUN && !!duelLink(r);
  return {
    run: r, promptOf: byId, kind, meta: { title, replayLabel: r.official ? 'Practice' : 'Play again', ...(extra.meta || {}) },
    nextPack: nextPackSuggestion(r), canReplay: true, canChallenge: challengeable, ...extra,
  };
}

function finish(finishedRun) {
  stopTimer();
  const prev = statsNow();
  let saved = false;
  if (run && !run.saved) { run.saved = true; saved = safe(() => storage.saveRun(finishedRun), false); if (finishedRun.mode === 'chapter' && run.route?.chapter) safe(() => storage.saveChapter(finishedRun.packId, run.route.chapter, finishedRun), false); }
  const stats = statsNow();
  const view = buildView(finishedRun, {
    stats,
    meta: { newBest: prev.runs > 0 && finishedRun.depth > prev.bestDepth, saved },
  });

  if (run && run.theirs) {
    let sc;
    try {
      sc = modes.scoreDuel({ ...finishedRun, answers: finishedRun.answers.map(slimAnswer) }, run.theirs);
      if (!sc || !Array.isArray(sc.mine) || !Array.isArray(sc.theirs)) throw new Error('bad duel score');
    } catch (err) {
      console.error(err);
      invite = null; inviteAccepted = false;
      return ui.showError('This duel link is broken, so the two games can’t be compared. Your game was still saved.', () => router.go(href.home()), 'Duel link broken');
    }
    view.duel = { ...sc, collisions: sc.collisions || [], theirAnswers: run.theirs.answers };
    view.canReplay = false; view.canChallenge = false;
    invite = null; inviteAccepted = false;
  } else if (finishedRun.mode === 'duel') {
    view.link = duelLink(finishedRun);
  }
  view.rankSlot = rankSlotFor(finishedRun);
  ui.showRun(view);
  if (view.rankSlot || finishedRun.mode === 'chapter') afterFinishOnline(finishedRun);   // chapter runs are sent unofficially, with no rank line
}
const slimAnswer = (a) => ({ promptId: a.promptId, input: a.input || '', answerName: a.answerName, points: a.points });

function showSaved(r) {
  if (!r) return ui.showNotFound();
  const view = buildView(r, { replay: true, canReplay: r.mode !== 'duel' || true });
  view.rankSlot = rankSlotFor(r);
  ui.showRun(view);
  if (view.rankSlot) showRank(r);
}

/* ---- solo results: send the run to the server, then show "Your rank today" ---- */
const rankable = (r) => !!(r && r.mode === 'daily' && r.official && !r.practice && r.dayKey);
function rankSlotFor(r) {
  if (!ONLINE.enabled || !rankable(r)) return null;
  if (!onlineAvailable()) return 'offline';
  return acct.user ? 'loading' : 'signedout';
}
async function afterFinishOnline(r) {
  if (!acct.user || !onlineAvailable() || r.practice) return;
  const res = await onl('submitRun', r);
  if (!res.ok && /already/i.test(String(res.error))) { /* already on the board from another device: fine */ }
  if (rankable(r)) showRank(r, res);
}
async function showRank(r, submitRes) {
  if (!acct.user) { await refreshAccount(); if (!acct.user) return ui.setRank({ kind: 'signedout' }); }
  const board = await onl('dailyBoard', { day: r.dayKey, scope: 'all', limit: 1000 });
  const rows = board.ok ? (Array.isArray(board.data) ? board.data : (board.data?.rows || [])) : [];
  const mine = rows.find((x) => x.user_id === acct.user.id);
  if (mine) return ui.setRank({ kind: 'ok', rank: mine.rank, of: rows.length >= 1000 ? `${rows.length}+` : rows.length });
  const sr = submitRes?.data?.rank;
  if (sr && typeof sr === 'object' && sr.rank) return ui.setRank({ kind: 'ok', rank: sr.rank, of: sr.of ?? sr.total ?? null });
  if (typeof sr === 'number') return ui.setRank({ kind: 'ok', rank: sr, of: rows.length || null });
  ui.setRank({ kind: board.ok ? 'queued' : 'offline' });
}

function playAgain() {
  if (!run) return router.go(href.home());
  const r = run.route;
  // Official daily / pack results can only be replayed as practice.
  if (run.meta.official || (r.mode === 'daily' && !r.practice)) {
    return router.go(r.mode === 'daily' ? href.dailyPractice() : href.packPractice(r.packId));
  }
  if (r.mode === 'duel') { invite = null; inviteAccepted = false; return router.go(href.duel()); }
  return router.go(location.hash === hashFor(r) ? location.hash : hashFor(r));
}
function hashFor(r) {
  if (r.mode === 'daily') return r.practice ? href.dailyPractice() : href.daily(r.dayKey);
  if (r.mode === 'endless') return href.endless();
  if (r.mode === 'duel') return href.duel();
  return r.practice ? href.packPractice(r.packId) : href.pack(r.packId, r.dayKey);
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  settings = { ...settings, ...safe(() => storage.getSettings(), {}) };
  await loadAssets();
  ui.init();
  applySettings();
  ui.showLoading();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onTick(); });
  // Browsers only start audio after a gesture; nudge the context awake on first click.
  document.addEventListener('pointerdown', () => { try { assets.sfx?.play?.('click'); } catch { /* ignore */ } }, { once: true, capture: false });

  try {
    bank = await loadBank();
  } catch (err) {
    console.error(err);
    return ui.showError('Couldn’t load the question list. If you opened the file directly, run ./serve.sh and visit http://localhost:8642.', () => location.reload());
  }
  try { packs = (await loadPacks()).packs; }
  catch (err) { console.warn('packs failed validation, using raw file', err); packs = await loadJson('./data/packs.json', 'packs'); }
  ui.setPacks(packs);
  [guides, faq] = await Promise.all([loadJson('./data/guides.json', 'guides'), loadJson('./data/faq.json', 'faq')]);
  ui.setContent({ guides, faq });

  await loadOnlineModules();
  if (onlineMod) {
    await refreshAccount();
    safe(() => onlineMod.onAuth(async () => { await refreshAccount(); const n = router?.current?.name; if (n === 'account') showAccount(); }));
  } else pushAccount();
  const syncNet = () => { pushAccount(); const n = router?.current?.name; if (['account', 'leaderboard', 'friends', 'online', 'room'].includes(n || '')) router.reload(); };
  window.addEventListener('online', syncNet); window.addEventListener('offline', syncNet);

  const token = new URLSearchParams(location.search).get('duel');
  router = createRouter(onRoute);
  if (token) {
    invite = safe(() => modes.decodeDuel(token), null);
    history.replaceState(null, '', location.pathname + (invite ? href.duel() : href.home()));
    if (!invite) {
      router.start();
      return ui.showError('This duel link is broken. Ask your rival to send it again, or play a normal game.', () => router.go(href.home()), 'Duel link broken');
    }
  }
  const pending = acct.user ? safe(() => sessionStorage.getItem(PENDING_ROOM), null) : null;
  if (pending) { safe(() => sessionStorage.removeItem(PENDING_ROOM)); history.replaceState(null, '', href.room(pending)); }
  router.start();
}

boot();
