import { seedFromString, mulberry32, shuffle } from './rng.js';

export const PROMPTS_PER_RUN = 7;
export const LAUNCH_DAY = '2026-11-01';
export const TIMERS = Object.freeze({ daily: 20000, endless: 20000, duel: 15000, pack: 20000 });

export function utcDayKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function selectMixed(bank, rand) {
  const prompts = bank?.prompts || [];
  if (prompts.length < PROMPTS_PER_RUN) return [];
  const groups = new Map();
  for (const prompt of prompts) {
    const group = groups.get(prompt.category) || [];
    group.push(prompt);
    groups.set(prompt.category, group);
  }
  const categories = shuffle([...groups.keys()], rand);
  const ordered = [];
  for (const category of categories) ordered.push(...shuffle(groups.get(category), rand));
  const chosen = [];
  const used = new Set();
  // First pass guarantees category variety when the bank permits it.
  for (const category of categories) {
    const prompt = groups.get(category).find(item => !used.has(item.id));
    if (prompt && chosen.length < PROMPTS_PER_RUN) { chosen.push(prompt); used.add(prompt.id); }
  }
  for (const prompt of ordered) {
    if (chosen.length === PROMPTS_PER_RUN) break;
    if (!used.has(prompt.id)) { chosen.push(prompt); used.add(prompt.id); }
  }
  return chosen;
}

export function getDailyPrompts(bank, dayKey) {
  return selectMixed(bank, mulberry32(seedFromString(`vermillion-daily:${dayKey}`)));
}

export function getEndlessPrompts(bank, recentIds = [], rand = Math.random) {
  const prompts = bank?.prompts || [];
  if (prompts.length < PROMPTS_PER_RUN) return [];
  const recent = new Set(recentIds);
  const fresh = prompts.filter(prompt => !recent.has(prompt.id));
  const pool = fresh.length >= PROMPTS_PER_RUN ? fresh : prompts;
  return shuffle(pool, rand).slice(0, PROMPTS_PER_RUN);
}

export function getPackPrompts(bank, category, rand = Math.random) {
  const prompts = (bank?.prompts || []).filter(prompt => {
    // v2 content uses explicit pack ids; the category fallback keeps v1 callers working.
    return Array.isArray(prompt.packs) ? prompt.packs.includes(category) : prompt.category === category;
  });
  if (prompts.length < PROMPTS_PER_RUN) return [];
  return shuffle(prompts, rand).slice(0, PROMPTS_PER_RUN);
}

export function getPackDailyPrompts(bank, packId, dayKey) {
  const rand = mulberry32(seedFromString(`${packId}:${dayKey}`));
  return getPackPrompts(bank, packId, rand);
}

export function listArchiveDays(today = utcDayKey()) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const cursor = new Date(`${today}T00:00:00Z`);
  const launch = new Date(`${LAUNCH_DAY}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime()) || cursor.toISOString().slice(0, 10) !== today || cursor < launch) return [];
  const days = [];
  while (cursor >= launch) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function validDuel(run) {
  return run && Array.isArray(run.promptIds) && run.promptIds.length === PROMPTS_PER_RUN &&
    run.promptIds.every(id => typeof id === 'string') && Array.isArray(run.answers) &&
    run.answers.length === PROMPTS_PER_RUN && run.answers.every(answer => answer &&
      typeof answer.promptId === 'string' && (typeof answer.input === 'string') &&
      (typeof answer.answerName === 'string' || answer.answerName === null) &&
      Number.isInteger(answer.points) && answer.points >= 0 && answer.points <= 100) &&
    run.answers.every((answer, index) => answer.promptId === run.promptIds[index]) &&
    Number.isInteger(run.total) && run.total >= 0 && run.total <= 700;
}

export function encodeDuel(run) {
  if (!validDuel(run)) throw new TypeError('Invalid duel run');
  const payload = { v: 1, promptIds: run.promptIds, answers: run.answers, total: run.total };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeDuel(token) {
  try {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - token.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.v !== 1 || !validDuel(payload)) return null;
    return { promptIds: payload.promptIds, answers: payload.answers, total: payload.total };
  } catch {
    return null;
  }
}

function comparableAnswer(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

export function scoreDuel(myRun, theirDuel) {
  if (!validDuel(myRun) || !theirDuel || !validDuel(theirDuel) ||
      myRun.promptIds.some((id, index) => id !== theirDuel.promptIds[index])) {
    throw new TypeError('Duel runs must contain the same seven prompts');
  }
  const mine = [], theirs = [], collisions = [];
  for (let i = 0; i < PROMPTS_PER_RUN; i += 1) {
    const mineAnswer = myRun.answers[i], theirAnswer = theirDuel.answers[i];
    const collision = mineAnswer.answerName !== null && theirAnswer.answerName !== null &&
      comparableAnswer(mineAnswer.answerName) === comparableAnswer(theirAnswer.answerName);
    let minePoints = mineAnswer.points, theirPoints = theirAnswer.points;
    if (collision) { minePoints = Math.floor(minePoints / 2); theirPoints = Math.floor(theirPoints / 2); collisions.push(i); }
    mine.push(minePoints); theirs.push(theirPoints);
  }
  return { mine, theirs, myTotal: mine.reduce((a, b) => a + b, 0), theirTotal: theirs.reduce((a, b) => a + b, 0), collisions };
}
