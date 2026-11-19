import { matchAnswer } from './matcher.js';

function tierOf(points) {
  if (!(points > 0)) return 'none';
  if (points <= 20) return 'common';
  if (points <= 50) return 'uncommon';
  if (points <= 80) return 'rare';
  return 'mythic';
}

/**
 * Pure browser/server scoring. `answer` is the canonical answer name or null.
 * A suggestion is not consent: only matcher status 'match' earns points.
 * Input is trimmed exactly as in the solo game's persisted answers.
 */
export function scoreAnswer(prompt, input) {
  const text = String(input ?? '');
  const result = matchAnswer(prompt, text);
  const matched = result.status === 'match';
  const points = matched ? result.points : 0;
  return {
    promptId: prompt.id,
    input: text.trim(),
    answer: matched ? result.answer.name : null,
    points,
    tier: tierOf(points),
    corrected: matched && result.corrected === true,
  };
}

/**
 * Score positionally aligned inputs (string[]), one per prompt.
 * Missing inputs are misses; extra inputs cannot add points.
 * This has no timer, account, persistence, network or random-state dependency.
 */
export function scoreRun(prompts, inputs) {
  if (!Array.isArray(prompts) || !Array.isArray(inputs)) {
    throw new TypeError('scoreRun requires prompt and input arrays.');
  }
  const answers = prompts.map((prompt, index) => scoreAnswer(prompt, inputs[index] ?? ''));
  const total = answers.reduce((sum, answer) => sum + answer.points, 0);
  return { answers, total, depth: total * 10 };
}
