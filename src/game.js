// Vermillion v2 — pure game state machine. No DOM, no imports.
// The matcher is injected so this module is testable on its own:
//   createGame({ prompts, mode, packId, match: matchAnswer, ... })

export const TIER_ORDER = ['none', 'common', 'uncommon', 'rare', 'mythic'];
export const TIER_INFO = {
  none: { label: 'No score', emoji: '⬛', min: 0, max: 0 },
  common: { label: 'Common', emoji: '🟦', min: 1, max: 20 },
  uncommon: { label: 'Uncommon', emoji: '🟪', min: 21, max: 50 },
  rare: { label: 'Rare', emoji: '🩷', min: 51, max: 80 },
  mythic: { label: 'Mythic', emoji: '✨', min: 81, max: 100 },
};

const DEFAULT_LIMIT_MS = { daily: 20000, endless: 20000, duel: 15000, pack: 20000 };

/** Rarity tier for a point value (the same buckets are used by share text and the UI). */
export function tierOf(points) {
  if (!(points > 0)) return 'none';
  if (points <= 20) return 'common';
  if (points <= 50) return 'uncommon';
  if (points <= 80) return 'rare';
  return 'mythic';
}

/** The rarest / most common answers of a prompt, handy for results tables. */
export function extremes(prompt) {
  const list = (prompt?.answers || []).slice().sort((a, b) => b.points - a.points);
  return { rarest: list[0] || null, commonest: list[list.length - 1] || null };
}

export function createGame({
  prompts,
  mode = 'endless',
  packId = null,
  timeLimit,       // seconds (kept from v1)
  timeLimitMs,     // milliseconds (preferred)
  match,
  dayKey = null,
  category = null,
  practice = false,
  official = false,
  now = Date.now(),
} = {}) {
  if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('createGame: prompts required');
  if (typeof match !== 'function') throw new Error('createGame: match function required');

  const limitMs = timeLimitMs ?? (timeLimit != null ? timeLimit * 1000 : (DEFAULT_LIMIT_MS[mode] ?? 20000));
  const answers = [];
  let index = 0;
  let phase = 'playing'; // 'playing' | 'result' | 'done'
  let startedAt = now;
  let attempts = 0;
  let hintUsed = false;
  let rejected = [];   // unknown inputs on the current prompt
  let last = null;     // detailed result of the most recently resolved prompt
  let finishedAt = null;

  const total = () => answers.reduce((s, a) => s + a.points, 0);
  const remaining = (t) => Math.max(0, limitMs - (t - startedAt));

  function buildReveal(prompt, chosen) {
    const all = (prompt.answers || []).slice().sort((a, b) => b.points - a.points);
    const pts = chosen ? chosen.points : 0;
    // "Deeper cuts": the three rarest answers in the bank (only those rarer than what was scored).
    // With no answer (timeout) we show the three rarest too.
    const deeper = chosen ? all.filter((a) => a.points > pts).slice(0, 3) : all.slice(0, 3);
    const commonest = all[all.length - 1] || null;
    const strip = (a) => (a ? { name: a.name, points: a.points, note: a.note || null } : null);
    return {
      deeper: deeper.map(strip),
      commonest: strip(commonest),
      rarest: strip(all[0]),
      totalAnswers: all.length,
      // how many answers in the bank score lower (are more common) than the chosen one
      rarerThan: chosen ? all.filter((a) => a.points < pts).length : 0,
      // rarity percentile: 100 = the very rarest answer, 0 = the most common one
      rank: chosen && all.length > 1 ? Math.round(((pts - all[all.length - 1].points) / Math.max(1, all[0].points - all[all.length - 1].points)) * 100) : null,
    };
  }

  function resolve(prompt, entry, timedOut, chosen) {
    const full = { ...entry, tier: tierOf(entry.points), usedHint: hintUsed, timedOut };
    answers.push(full);
    last = {
      ...full,
      attempts,
      rejected: rejected.slice(),
      note: chosen?.note || null,
      fact: prompt.fact || null,
      hint: prompt.hint || null,
      promptText: prompt.text,
      category: prompt.category || null,
      reveal: buildReveal(prompt, chosen),
    };
    phase = 'result';
  }

  function timeoutIfExpired(t) {
    if (phase !== 'playing' || remaining(t) > 0) return false;
    const prompt = prompts[index];
    resolve(prompt, { promptId: prompt.id, input: '', answerName: null, points: 0 }, true, null);
    return true;
  }

  /** Advance the clock. Returns true if this tick ended the prompt by timeout. */
  function tick(t = Date.now()) {
    return timeoutIfExpired(t);
  }

  /**
   * Submit an answer. Returns { status }:
   *  'match' | 'unknown' | 'empty' | 'timeout' | 'ignored'
   */
  function submit(input, t = Date.now()) {
    if (phase !== 'playing') return { status: 'ignored' };
    if (timeoutIfExpired(t)) return { status: 'timeout', result: last };
    const prompt = prompts[index];
    const res = match(prompt, input);
    if (res.status === 'match') {
      resolve(prompt, {
        promptId: prompt.id,
        input: String(input).trim(),
        answerName: res.answer.name,
        points: res.points,
      }, false, res.answer);
      return { status: 'match', result: last };
    }
    if (res.status === 'unknown') {
      attempts += 1;
      const s = String(input).trim();
      if (s && !rejected.includes(s)) rejected.push(s);
    }
    return { status: res.status, attempts };
  }

  /** Reveal the hint for this prompt. Free, but it is recorded on the answer (usedHint). */
  function useHint() {
    if (phase !== 'playing') return prompts[index]?.hint || '';
    hintUsed = true;
    return prompts[index]?.hint || 'No hint for this one. Trust your gut.';
  }

  /** Leave the result screen: start next prompt, or finish the run. */
  function next(t = Date.now()) {
    if (phase !== 'result') return getState(t);
    if (index + 1 >= prompts.length) {
      phase = 'done';
      finishedAt = t;
    } else {
      index += 1;
      phase = 'playing';
      startedAt = t;
      attempts = 0;
      hintUsed = false;
      rejected = [];
      last = null;
    }
    return getState(t);
  }

  function getRun() {
    const pts = total();
    return {
      mode,
      packId,
      dayKey,
      category,
      practice,
      official,
      promptIds: prompts.map((p) => p.id),
      answers: answers.map((a) => ({ ...a })),
      total: pts,
      depth: pts * 10,
      finishedAt,
    };
  }

  function getState(t = Date.now()) {
    const pts = total();
    return {
      mode,
      packId,
      phase,
      index,
      count: prompts.length,
      prompt: prompts[index],
      timeLimitMs: limitMs,
      remainingMs: phase === 'playing' ? remaining(t) : 0,
      attempts,
      rejected: rejected.slice(),
      hintUsed,
      hint: hintUsed ? prompts[index]?.hint || '' : null,
      last,
      answers: answers.map((a) => ({ ...a })),
      total: pts,
      depth: pts * 10,
      maxPoints: prompts.length * 100,
      finished: phase === 'done',
    };
  }

  return { submit, tick, next, useHint, getState, getRun };
}
