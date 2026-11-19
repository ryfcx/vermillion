// Pure counterpart to storage.js's official Daily streak cursor rule.
export function nextDailyStreak(stats = {}, dayKey) {
  const dailyStreak = Math.max(0, Number(stats.dailyStreak) || 0);
  const bestStreak = Math.max(0, Number(stats.bestStreak) || 0);
  const lastDailyKey = typeof stats.lastDailyKey === 'string' ? stats.lastDailyKey : null;
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return { dailyStreak, bestStreak, lastDailyKey };
  }
  const current = new Date(`${dayKey}T00:00:00Z`);
  if (!Number.isFinite(current.getTime()) || current.toISOString().slice(0, 10) !== dayKey) {
    return { dailyStreak, bestStreak, lastDailyKey };
  }
  if (!lastDailyKey || dayKey > lastDailyKey) {
    const yesterday = new Date(current);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const nextDaily = lastDailyKey === yesterday.toISOString().slice(0, 10) ? dailyStreak + 1 : 1;
    return { dailyStreak: nextDaily, bestStreak: Math.max(bestStreak, nextDaily), lastDailyKey: dayKey };
  }
  return { dailyStreak, bestStreak, lastDailyKey };
}
