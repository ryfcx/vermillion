function tier(answer) {
  if (['none', 'common', 'uncommon', 'rare', 'mythic'].includes(answer?.tier)) return answer.tier;
  const points = Number(answer?.points) || 0;
  if (points <= 0) return 'none';
  if (points <= 20) return 'common';
  if (points <= 50) return 'uncommon';
  if (points <= 80) return 'rare';
  return 'mythic';
}
const SQUARES = { none: '⬛', common: '🟦', uncommon: '🟪', rare: '🩷', mythic: '✨' };
const MYTHIC_SHARE_LABEL = '✨ One in a Vermillion';

export function shareText(run) {
  const date = run?.dayKey || new Date(run?.finishedAt || Date.now()).toISOString().slice(0, 10);
  const isPack = run?.mode === 'pack' || String(run?.mode || '').startsWith('pack:');
  const score = isPack ? `${(Number(run?.total) || 0).toLocaleString('en-US')} pts` : `${(Number.isFinite(run?.depth) ? run.depth : (Number(run?.total) || 0) * 10).toLocaleString('en-US')} m`;
  const answers = Array.isArray(run?.answers) ? run.answers : [];
  const squares = answers.map(answer => SQUARES[tier(answer)]).join('');
  const mythicLabel = answers.some(answer => tier(answer) === 'mythic') ? `\n${MYTHIC_SHARE_LABEL}` : '';
  return `Vermillion ${date} — ${score}\n${squares}${mythicLabel}`;
}

export async function shareRun(run) {
  const text = shareText(run);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Vermillion', text });
      return 'shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'failed';
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch { /* clipboard may be denied outside a secure context */ }
  try {
    const field = document.createElement('textarea');
    field.value = text; field.setAttribute('readonly', '');
    field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select();
    const copied = document.execCommand('copy'); field.remove();
    if (copied) return 'copied';
  } catch { /* no document or browser copy support */ }
  return 'failed';
}
