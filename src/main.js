// Vermillion v2 — wiring: routes, run lifecycle, timer loop, settings, ?duel= handling.
import { loadBank, getPrompt, loadPacks, promptsForPack } from './content.js';
import { matchAnswer } from './matcher.js';
import * as modes from './modes.js';
import * as storage from './storage.js';
import { shareRun } from './share.js';
import { shuffle } from './rng.js';
import { createGame } from './game.js';
import { createUI } from './ui.js';
import { loadAssets, assets, displayKindFor } from './displays.js';
import { createRouter, href } from './router.js';

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

/* ------------------------------------------------------------------ routing */
function onRoute(r) {
  stopTimer();
  ui.setRoute(r);
  if (!bank) return;
  try {
    switch (r.name) {
      case 'home': return showHome();
      case 'play': return startRun(r);
      case 'packs': return showPacks();
      case 'archive': return showArchive(r.target);
      case 'stats': return ui.showStats({ stats: statsNow() });
      case 'history': return showHistory();
      case 'how': return ui.showHow();
      case 'guides': return ui.showGuides({ guides });
      case 'guide': return showGuide(r.slug);
      case 'faq': return ui.showFaq({ faq });
      case 'about': return ui.showAbout();
      default: return ui.showNotFound();
    }
  } catch (err) {
    console.error(err);
    ui.showError('Something went wrong drawing this page.', () => router.reload());
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
  ui.showHome({ stats: statsNow(), dailyDone: officialFor({ mode: 'daily', dayKey: today() }), dayKey: today(), packDone: packDoneMap(), guides, faq, featured, descent: days + 1 });
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

  const limit = modes.TIMERS?.[mode] ?? (mode === 'duel' ? 15000 : 20000);
  const game = createGame({
    prompts, mode, packId: packId || null, timeLimitMs: limit, match: matchAnswer,
    dayKey: mode === 'daily' || mode === 'pack' ? dayKey : null, practice, official,
  });
  const meta = metaFor({ mode, packId, dayKey, practice, official, archive, rival: !!theirs });
  run = { game, route: r, meta, timer: 0, saved: false, theirs };
  ui.beginPlay(meta, game.getState());
  startTimer();
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
    ui.showReject(res.status, st.rejected);
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
  if (run && !run.saved) { run.saved = true; saved = safe(() => storage.saveRun(finishedRun), false); }
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
  ui.showRun(view);
}
const slimAnswer = (a) => ({ promptId: a.promptId, input: a.input || '', answerName: a.answerName, points: a.points });

function showSaved(r) {
  if (!r) return ui.showNotFound();
  ui.showRun(buildView(r, { replay: true, canReplay: r.mode !== 'duel' || true }));
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
  router.start();
}

boot();
