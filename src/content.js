import { normalize } from './matcher.js';

const CATEGORIES = new Set(['geography', 'science', 'film', 'music', 'sports', 'history', 'language', 'food', 'nature', 'pop', 'games', 'space', 'arts', 'myth', 'tech', 'animals', 'literature', 'tv']);
const PACK_IDS = new Set(['movies', 'sports', 'geography', 'language', 'science', 'history', 'music', 'nature', 'food', 'games', 'space', 'arts', 'myth', 'tech']);

/** Original, plain-language copy for the v4 answer-result screen. */
export const TIER_FLAVOUR = Object.freeze({
  none: 'No score this time. Try the next one.',
  common: 'Familiar, but it still earns points.',
  uncommon: 'A less obvious answer.',
  rare: 'A rare answer. A bigger dive.',
  mythic: 'One in a Vermillion. A standout answer.',
});

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const answerCache = new Map();
const answerLocations = new WeakMap();
const documentBase = () => globalThis.document?.baseURI || globalThis.location?.href || new URL('../', import.meta.url).href;

function validateAnswers(prompt, answers) {
  if (!Array.isArray(answers) || answers.length < (prompt.everyday ? 15 : 12) ||
      (prompt.party && answers.length < 40) ||
      (prompt.answerCount !== undefined && answers.length !== prompt.answerCount)) {
    throw new Error(`Invalid answer count in prompt ${prompt.id}.`);
  }
  const labels = new Set();
  for (const answer of answers) {
    if (typeof answer?.name !== 'string' || !answer.name.trim() ||
        !Array.isArray(answer.aliases) || answer.aliases.some(alias => typeof alias !== 'string' || !alias.trim()) ||
        !Number.isInteger(answer.points) || answer.points < 1 || answer.points > 100 ||
        (answer.note !== undefined && (typeof answer.note !== 'string' || !answer.note.trim()))) {
      throw new Error(`Invalid answer in prompt ${prompt.id}.`);
    }
    for (const label of [answer.name, ...answer.aliases]) {
      const key = normalize(label);
      if (!key || labels.has(key)) throw new Error(`Duplicate or empty answer label in prompt ${prompt.id}.`);
      labels.add(key);
    }
  }
  return answers;
}

/** Shared pure validation for the metadata loader and the offline bank builder. */
export function validateBank(bank, { full = false } = {}) {
  if (bank?.version !== 2 || !Array.isArray(bank.prompts) || !bank.prompts.length) {
    throw new Error('Invalid prompt bank: expected version 2 and prompts.');
  }
  const ids = new Set();
  for (const prompt of bank.prompts) {
    const count = full ? prompt?.answers?.length : prompt?.answerCount;
    if (typeof prompt?.id !== 'string' || !SAFE_ID.test(prompt.id) || ids.has(prompt.id) ||
        !CATEGORIES.has(prompt.category) || typeof prompt.text !== 'string' || !prompt.text.trim() ||
        typeof prompt.everyday !== 'boolean' || !Number.isInteger(count) || count < (prompt.everyday ? 15 : 12) ||
        (prompt.party !== undefined && (typeof prompt.party !== 'boolean' || (prompt.party && count < 40))) ||
        !Array.isArray(prompt.packs) || prompt.packs.some(id => !PACK_IDS.has(id)) ||
        new Set(prompt.packs).size !== prompt.packs.length ||
        typeof prompt.hint !== 'string' || !prompt.hint.trim() ||
        (prompt.fact !== undefined && (typeof prompt.fact !== 'string' || !prompt.fact.trim())) ||
        (!full && Object.hasOwn(prompt, 'answers'))) {
      throw new Error(`Invalid prompt: ${prompt?.id ?? '(missing id)'}.`);
    }
    ids.add(prompt.id);
    if (full) validateAnswers(prompt, prompt.answers);
  }
  return bank;
}

/** Fetch metadata only. Call loadAnswers(selectedPrompts) before matching/scoring. */
export async function loadBank(url = './data/prompts.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load prompt bank (${response.status}).`);
  const bank = validateBank(await response.json());
  const directory = new URL('./answers/', new URL(url, documentBase())).href;
  for (const prompt of bank.prompts) answerLocations.set(prompt, directory);
  return bank;
}

/** Parallel, cached hydration. Attaches answers only after every requested shard validates.
 * Resolves to the same array and prompt objects. Failed requests may be retried.
 */
export async function loadAnswers(prompts) {
  if (!Array.isArray(prompts)) throw new TypeError('loadAnswers requires a prompt array.');
  const answers = await Promise.all(prompts.map(async prompt => {
    if (!prompt || typeof prompt.id !== 'string' || !SAFE_ID.test(prompt.id) || !Number.isInteger(prompt.answerCount)) {
      throw new Error('loadAnswers requires prompts from the metadata bank.');
    }
    if (Object.hasOwn(prompt, 'answers')) return validateAnswers(prompt, prompt.answers);
    const directory = answerLocations.get(prompt) || new URL('./data/answers/', documentBase()).href;
    const url = new URL(`${encodeURIComponent(prompt.id)}.json`, directory).href;
    const key = `${url}#${prompt.answerCount}`;
    if (!answerCache.has(key)) {
      const request = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load answers for ${prompt.id} (${response.status}).`);
        const data = await response.json();
        return validateAnswers(prompt, data?.answers);
      })();
      answerCache.set(key, request);
      request.catch(() => { if (answerCache.get(key) === request) answerCache.delete(key); });
    }
    return validateAnswers(prompt, await answerCache.get(key));
  }));
  prompts.forEach((prompt, index) => {
    if (!Object.hasOwn(prompt, 'answers')) prompt.answers = answers[index].map(a => ({ ...a, aliases: [...a.aliases] }));
  });
  return prompts;
}

export function getPrompt(bank, id) {
  return bank.prompts.find(prompt => prompt.id === id);
}

export function listCategories(bank) {
  return [...new Set(bank.prompts.map(prompt => prompt.category))].sort();
}

export async function loadPacks(url = './data/packs.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load packs (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data?.packs) || data.packs.length !== PACK_IDS.size) throw new Error('Invalid pack catalogue.');
  const ids = new Set();
  for (const pack of data.packs) {
    if (!PACK_IDS.has(pack?.id) || ids.has(pack.id) ||
        ['name', 'blurb', 'icon', 'display', 'unit'].some(key => typeof pack[key] !== 'string' || !pack[key].trim()) ||
        !Number.isFinite(pack.pointsPerUnit) || pack.pointsPerUnit <= 0 ||
        !Array.isArray(pack.chapters) || pack.chapters.length < 10 ||
        pack.chapters.some(chapter => !Array.isArray(chapter) || chapter.length !== 7 ||
          chapter.some(id => typeof id !== 'string' || !id.trim())) ||
        new Set(pack.chapters.flat()).size !== pack.chapters.length * 7) {
      throw new Error(`Invalid pack: ${pack?.id ?? '(missing id)'}.`);
    }
    ids.add(pack.id);
  }
  return data;
}

export function promptsForPack(bank, packId) {
  return bank.prompts.filter(prompt => prompt.packs.includes(packId));
}
