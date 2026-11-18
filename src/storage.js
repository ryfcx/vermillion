const PREFIX = 'vermillion:';
const RUN_LIMIT = 50;
// Display copy for stats and other summaries; tier IDs remain stable in stored data.
export const TIER_LABELS = Object.freeze({
  none: 'No score', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'One in a Vermillion'
});
const DEFAULT_STATS = {
  runs: 0, bestDepth: 0, totalPoints: 0, avgPoints: 0, dailyStreak: 0, bestStreak: 0,
  lastDailyKey: null, mythicCount: 0, rareCount: 0, perPack: {},
  tierCounts: { none: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 }
};

function read(key, fallback = null) {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

function write(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  }
  catch { return false; }
}

function remove(key) {
  try { globalThis.localStorage?.removeItem(PREFIX + key); return true; }
  catch { return false; }
}

function normalizedMode(run) {
  return run.mode === 'pack' || String(run.mode).startsWith('pack:') ? 'pack' : run.mode;
}

function resultKey({ mode, packId = null, dayKey }) {
  const normalized = String(mode).startsWith('pack:') ? 'pack' : mode;
  return `official:${normalized}:${packId || (String(mode).startsWith('pack:') ? String(mode).slice(5) : '')}:${dayKey}`;
}

function tierFor(answer) {
  if (answer?.tier && ['none', 'common', 'uncommon', 'rare', 'mythic'].includes(answer.tier)) return answer.tier;
  const points = Number(answer?.points) || 0;
  if (points <= 0) return 'none';
  if (points <= 20) return 'common';
  if (points <= 50) return 'uncommon';
  if (points <= 80) return 'rare';
  return 'mythic';
}

function mergeStats(current) {
  const value = current && typeof current === 'object' ? current : {};
  return {
    ...DEFAULT_STATS, ...value,
    perPack: value.perPack && typeof value.perPack === 'object' ? value.perPack : {},
    tierCounts: { ...DEFAULT_STATS.tierCounts, ...(value.tierCounts || {}) }
  };
}

export function getDailyResult(dayKey) {
  return getOfficialResult({ mode: 'daily', dayKey });
}

export function getOfficialResult({ mode, packId = null, dayKey } = {}) {
  try {
    if (!mode || !dayKey) return null;
    const run = read(resultKey({ mode, packId, dayKey }));
    return run && run.official === true && run.dayKey === dayKey ? run : null;
  } catch { return null; }
}

export function saveRun(run) {
  try {
    if (!run || !Array.isArray(run.promptIds) || !Array.isArray(run.answers)) return false;
    const savedRun = {
      ...run,
      packId: run.packId ?? (String(run.mode || '').startsWith('pack:') ? String(run.mode).slice(5) : null),
      practice: Boolean(run.practice),
      official: Boolean(run.official) && !Boolean(run.practice)
    };
    const timestamp = Number.isFinite(savedRun.finishedAt) ? savedRun.finishedAt : Date.now();
    savedRun.finishedAt = timestamp;
    const isOfficial = savedRun.official === true && !savedRun.practice && Boolean(savedRun.dayKey);
    const keyMode = normalizedMode(savedRun);
    const officialKey = isOfficial ? resultKey({ mode: keyMode, packId: savedRun.packId, dayKey: savedRun.dayKey }) : null;
    if (officialKey && read(officialKey)?.official === true) return false;
    const priorRunKeys = read('run-keys', []);
    const historyKeys = Array.isArray(priorRunKeys) ? priorRunKeys : [];
    let uniqueSuffix = 0;
    let runKey = `run:${timestamp}`;
    while (historyKeys.includes(runKey)) { uniqueSuffix += 1; runKey = `run:${timestamp}:${uniqueSuffix}`; }
    const retainedKeys = [runKey, ...historyKeys].slice(0, RUN_LIMIT);
    if (!write(runKey, savedRun)) return false;

    if (isOfficial) {
      if (!write(officialKey, savedRun)) return false;
    }

    const stats = mergeStats(read('stats', {}));
    stats.runs += 1;
    const points = Number.isFinite(savedRun.total) ? savedRun.total : 0;
    stats.totalPoints += points;
    stats.avgPoints = stats.runs ? Math.round((stats.totalPoints / stats.runs) * 100) / 100 : 0;
    stats.bestDepth = Math.max(stats.bestDepth, Number.isFinite(savedRun.depth) ? savedRun.depth : 0);
    for (const answer of savedRun.answers) {
      const tier = tierFor(answer);
      stats.tierCounts[tier] += 1;
      if (tier === 'mythic') stats.mythicCount += 1;
      if (tier === 'rare') stats.rareCount += 1;
    }
    if (savedRun.packId) {
      const packStats = stats.perPack[savedRun.packId] || { runs: 0, best: 0 };
      packStats.runs += 1;
      packStats.best = Math.max(packStats.best, points);
      stats.perPack[savedRun.packId] = packStats;
    }
    // Official Daily attempts alone move the daily streak; pack days are separate challenges.
    // Archive Daily runs are official results, but an older date must never move
    // the live streak cursor backwards or cause the next current-day run to reset it.
    if (isOfficial && keyMode === 'daily' && (!stats.lastDailyKey || savedRun.dayKey > stats.lastDailyKey)) {
      const previous = stats.lastDailyKey;
      const yesterday = new Date(`${savedRun.dayKey}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      stats.dailyStreak = previous === yesterday.toISOString().slice(0, 10) ? stats.dailyStreak + 1 : 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.dailyStreak);
      stats.lastDailyKey = savedRun.dayKey;
    }
    if (!write('stats', stats)) return false;

    const recent = read('recent', []);
    if (!write('recent', [...savedRun.promptIds, ...(Array.isArray(recent) ? recent : [])].slice(0, 100))) return false;
    if (!write('run-keys', retainedKeys)) return false;
    for (const staleKey of historyKeys.slice(Math.max(0, RUN_LIMIT - 1))) remove(staleKey);
    return true;
  } catch { return false; }
}

export function getHistory({ limit = 50, mode, packId } = {}) {
  try {
    if (!(limit > 0)) return [];
    const modePackId = typeof mode === 'string' && mode.startsWith('pack:') ? mode.slice(5) : null;
    const keys = read('run-keys', []);
    if (!Array.isArray(keys)) return [];
    const results = [];
    for (const key of keys) {
      const run = read(key);
      if (!run) continue;
      if (mode && normalizedMode(run) !== (String(mode).startsWith('pack:') ? 'pack' : mode)) continue;
      if ((packId || modePackId) && run.packId !== (packId || modePackId)) continue;
      results.push(run);
      if (results.length >= Math.max(0, limit)) break;
    }
    return results;
  } catch { return []; }
}

export function getStats() {
  return { ...mergeStats(read('stats', {})), tierLabels: TIER_LABELS };
}

export function getRecentPromptIds(n = 50) {
  const ids = read('recent', []);
  return Array.isArray(ids) ? ids.filter(id => typeof id === 'string').slice(0, Math.max(0, n)) : [];
}

export function getSettings() {
  const settings = read('settings', {});
  return {
    easyRead: Boolean(settings?.easyRead), reducedMotion: Boolean(settings?.reducedMotion),
    sound: typeof settings?.sound === 'boolean' ? settings.sound : true,
    volume: Number.isFinite(settings?.volume) ? Math.max(0, Math.min(1, settings.volume)) : 0.6,
    theme: ['neon', 'midnight', 'crt'].includes(settings?.theme) ? settings.theme : 'neon'
  };
}

export function saveSettings(obj) {
  try {
    const current = getSettings();
    return write('settings', {
      easyRead: typeof obj?.easyRead === 'boolean' ? obj.easyRead : current.easyRead,
      reducedMotion: typeof obj?.reducedMotion === 'boolean' ? obj.reducedMotion : current.reducedMotion,
      sound: typeof obj?.sound === 'boolean' ? obj.sound : current.sound,
      volume: Number.isFinite(obj?.volume) ? Math.max(0, Math.min(1, obj.volume)) : current.volume,
      theme: ['neon', 'midnight', 'crt'].includes(obj?.theme) ? obj.theme : current.theme
    });
  } catch { return false; }
}
