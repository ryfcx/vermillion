import { normalize } from './matcher.js';

const CATEGORIES = new Set(['geography', 'science', 'film', 'music', 'sports', 'history', 'language', 'food', 'nature', 'pop', 'games', 'space', 'arts', 'myth', 'tech', 'animals', 'literature', 'tv']);
const PACK_IDS = new Set(['movies', 'sports', 'geography', 'language', 'science', 'history', 'music', 'nature', 'food', 'games', 'space', 'arts', 'myth', 'tech']);

/** Fetch and validate a bank before exposing it to the game. */
export async function loadBank(url = './data/prompts.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load prompt bank (${response.status}).`);
  const bank = await response.json();
  if (bank?.version !== 2 || !Array.isArray(bank.prompts) || !bank.prompts.length) {
    throw new Error('Invalid prompt bank: expected version 2 and prompts.');
  }
  const ids = new Set();
  for (const prompt of bank.prompts) {
    if (typeof prompt?.id !== 'string' || !prompt.id.trim() || ids.has(prompt.id) ||
        !CATEGORIES.has(prompt.category) || typeof prompt.text !== 'string' || !prompt.text.trim() ||
        typeof prompt.everyday !== 'boolean' || (prompt.everyday && prompt.answers?.length < 15) ||
        !Array.isArray(prompt.packs) || prompt.packs.some(id => !PACK_IDS.has(id)) ||
        new Set(prompt.packs).size !== prompt.packs.length ||
        typeof prompt.hint !== 'string' || !prompt.hint.trim() ||
        (prompt.fact !== undefined && (typeof prompt.fact !== 'string' || !prompt.fact.trim())) ||
        !Array.isArray(prompt.answers) || prompt.answers.length < 12) {
      throw new Error(`Invalid prompt: ${prompt?.id ?? '(missing id)'}.`);
    }
    ids.add(prompt.id);
    const labels = new Set();
    for (const answer of prompt.answers) {
      if (typeof answer?.name !== 'string' || !answer.name.trim() ||
          !Array.isArray(answer.aliases) || answer.aliases.some(alias => typeof alias !== 'string' || !alias.trim()) ||
          !Number.isInteger(answer.points) || answer.points < 1 || answer.points > 100) {
        throw new Error(`Invalid answer in prompt ${prompt.id}.`);
      }
      if (answer.note !== undefined && (typeof answer.note !== 'string' || !answer.note.trim())) {
        throw new Error(`Invalid answer note in prompt ${prompt.id}.`);
      }
      for (const label of [answer.name, ...answer.aliases]) {
        const key = normalize(label);
        if (!key || labels.has(key)) throw new Error(`Duplicate or empty answer label in prompt ${prompt.id}.`);
        labels.add(key);
      }
    }
  }
  return bank;
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
        !Number.isFinite(pack.pointsPerUnit) || pack.pointsPerUnit <= 0) {
      throw new Error(`Invalid pack: ${pack?.id ?? '(missing id)'}.`);
    }
    ids.add(pack.id);
  }
  return data;
}

export function promptsForPack(bank, packId) {
  return bank.prompts.filter(prompt => prompt.packs.includes(packId));
}
