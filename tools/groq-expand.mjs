// Answer-bank expansion with Groq (build-time only; never runs in the browser).
//
// For each question it:
//   1. asks Groq for EVERY valid answer, in rounds, until it stops finding new ones,
//   2. drops anything our matcher already accepts (exact, alias, typo-close),
//   3. verifies the new candidates in a second, strict pass (valid? canonical name? aliases?
//      how familiar is it to an ordinary player, 0-100?),
//   4. turns familiarity into points (familiar = few points, obscure = many),
//   5. flags existing answers whose current points disagree a lot with Groq's familiarity.
// Results go to data/expansions/<promptId>.json for review. Nothing in prompts.json changes
// until you run with --apply.
//
// Usage:
//   node tools/groq-expand.mjs --ids geo-001,food-003     specific questions
//   node tools/groq-expand.mjs --pack geography           one topic
//   node tools/groq-expand.mjs --all [--limit 50]         everything (resumable: skips done files)
//   node tools/groq-expand.mjs --apply                    merge verified additions into data/prompts.json
//   node tools/groq-expand.mjs --models                   list the models your key can use
// Options: --model <id>  --max-answers 500  --rounds 6  --concurrency 2  --force (redo done files)
// Key: GROQ_API_KEY in .env (gitignored) or the environment. Never commit it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchAnswer, normalize } from '../src/matcher.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK = path.join(ROOT, 'data/prompts.json');
const OUT = path.join(ROOT, 'data/expansions');
const API = 'https://api.groq.com/openai/v1';
const PREFERRED = ['openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };

function loadKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*GROQ_API_KEY\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
  } catch { /* no .env */ }
  console.error('Missing GROQ_API_KEY. Put it in .env (gitignored):  GROQ_API_KEY=gsk_...');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function groq(key, endpoint, body, attempt = 0) {
  const res = await fetch(`${API}${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`Groq ${res.status} after retries`);
    const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    await sleep(Math.min(wait, 60000));
    return groq(key, endpoint, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function pickModel(key) {
  if (opt('model')) return opt('model');
  const { data } = await groq(key, '/models');
  const ids = data.map((m) => m.id);
  return PREFERRED.find((m) => ids.includes(m)) || ids.find((m) => /70b|120b|large/i.test(m)) || ids[0];
}

function parseLoose(raw) {
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)); } catch { /* fall through */ } }
  return {};
}
async function askJSON(key, model, system, user) {
  const base = {
    model, temperature: 0, max_completion_tokens: 16000,
    ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  try {
    const r = await groq(key, '/chat/completions', { ...base, response_format: { type: 'json_object' } });
    return parseLoose(r.choices?.[0]?.message?.content || '{}');
  } catch (e) {
    if (!/json_validate_failed|400/.test(e.message)) throw e;
    // Strict JSON mode can reject long lists; retry free-form and parse the JSON out ourselves.
    const r = await groq(key, '/chat/completions', base);
    return parseLoose(r.choices?.[0]?.message?.content || '{}');
  }
}

const GEN_SYSTEM = `You build answer lists for a trivia game where players type ONE answer to a prompt and rarer valid answers score more.
List valid answers exhaustively. Include obscure but genuinely correct answers. Never invent things that do not exist.
Use the common English name as "name". Reply with JSON only: {"answers":[{"name":"..."}],"exhausted":true|false}.
"exhausted" is true when you believe there are no more valid answers you could add.`;
const VERIFY_SYSTEM = `You are a strict fact-checker for a trivia answer list. For each candidate decide if it is a correct, real answer to the prompt
exactly as worded (respect every constraint: dates, places, "living", counts). Reject made-up, wrong-category, joke, or doubtful items.
For valid ones give the canonical common English name, up to 4 common alternative names or spellings people would type, and
"familiarity": 0-100 = how likely an ordinary adult player would think of it for this prompt (100 = the first thing everyone says, 1 = only experts).
Reply with JSON only: {"results":[{"candidate":"...","valid":true|false,"name":"...","aliases":["..."],"familiarity":0,"reason":"short"}]}.`;
const RATE_SYSTEM = `Rate how likely an ordinary adult player would think of each listed answer for the prompt, 0-100 (100 = first thing everyone says).
Reply with JSON only: {"ratings":[{"name":"...","familiarity":0}]}.`;

// Familiarity → points, on the bank's 5..95 scale. Very familiar answers stay cheap.
export const pointsFor = (fam) => Math.max(5, Math.min(95, 5 + Math.round((100 - Math.max(0, Math.min(100, fam))) * 0.9 / 5) * 5));

function known(prompt, name) {
  const m = matchAnswer(prompt, name);
  return m.status === 'match' || m.status === 'suggest';
}

async function expandOne(key, model, prompt, { maxAnswers, rounds }) {
  const existing = prompt.answers.map((a) => a.name);
  const seen = new Set(prompt.answers.flatMap((a) => [a.name, ...(a.aliases || [])]).map(normalize));
  const candidates = [];
  for (let round = 0; round < rounds && existing.length + candidates.length < maxAnswers; round++) {
    const already = [...existing, ...candidates];
    const r = await askJSON(key, model, GEN_SYSTEM,
      `Prompt: "${prompt.text}"\nAlready listed (${already.length}): ${JSON.stringify(already)}\n` +
      `Give up to 80 MORE valid answers that are not already listed (no duplicates or spelling variants of listed ones).`);
    let added = 0;
    for (const a of r.answers || []) {
      const name = String(a?.name || '').trim();
      if (!name || name.length > 60 || seen.has(normalize(name)) || known(prompt, name)) continue;
      seen.add(normalize(name)); candidates.push(name); added++;
    }
    if (r.exhausted || added < 5) break;
  }
  // strict verification in batches
  const verified = [], rejected = [];
  for (let i = 0; i < candidates.length; i += 40) {
    const batch = candidates.slice(i, i + 40);
    const r = await askJSON(key, model, VERIFY_SYSTEM, `Prompt: "${prompt.text}"\nCandidates: ${JSON.stringify(batch)}`);
    for (const x of r.results || []) {
      if (x?.valid && x.name && !known(prompt, x.name)) {
        verified.push({ name: String(x.name).trim(), aliases: (x.aliases || []).map(String).filter((s) => s && normalize(s) !== normalize(x.name)).slice(0, 4),
          familiarity: Number(x.familiarity) || 0, points: pointsFor(Number(x.familiarity) || 0), note: x.reason || '' });
      } else if (x) rejected.push({ candidate: x.candidate, reason: x.reason || '' });
    }
  }
  // de-duplicate verified by canonical name
  const byName = new Map(); for (const v of verified) if (!byName.has(normalize(v.name))) byName.set(normalize(v.name), v);
  // second opinion on existing answers' rarity (flags only, never overwritten automatically)
  const flags = [];
  for (let i = 0; i < existing.length; i += 60) {
    const batch = existing.slice(i, i + 60);
    const r = await askJSON(key, model, RATE_SYSTEM, `Prompt: "${prompt.text}"\nAnswers: ${JSON.stringify(batch)}`);
    for (const x of r.ratings || []) {
      const cur = prompt.answers.find((a) => normalize(a.name) === normalize(x.name || ''));
      if (!cur) continue;
      const suggested = pointsFor(Number(x.familiarity) || 0);
      if (Math.abs(suggested - cur.points) >= 30) flags.push({ name: cur.name, current: cur.points, suggested, familiarity: x.familiarity });
    }
  }
  return { promptId: prompt.id, text: prompt.text, model, at: new Date().toISOString(),
    existing: existing.length, added: [...byName.values()], rejected, rarityFlags: flags };
}

async function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  if (flag('apply')) return apply(bank);
  const key = loadKey();
  if (flag('models')) { const { data } = await groq(key, '/models'); console.log(data.map((m) => m.id).join('\n')); return; }
  const model = await pickModel(key);
  fs.mkdirSync(OUT, { recursive: true });
  let list = bank.prompts;
  if (opt('ids')) { const ids = new Set(opt('ids').split(',')); list = list.filter((p) => ids.has(p.id)); }
  if (opt('pack')) list = list.filter((p) => (p.packs || []).includes(opt('pack')) || p.category === opt('pack'));
  if (!flag('all') && !opt('ids') && !opt('pack')) { console.error('Choose --ids, --pack or --all (or --apply / --models).'); process.exit(1); }
  if (!flag('force')) list = list.filter((p) => !fs.existsSync(path.join(OUT, `${p.id}.json`)));
  if (opt('limit')) list = list.slice(0, Number(opt('limit')));
  const conf = { maxAnswers: Number(opt('max-answers', 500)), rounds: Number(opt('rounds', 6)) };
  const conc = Number(opt('concurrency', 2));
  console.log(`model ${model} · ${list.length} question(s) · max ${conf.maxAnswers} answers each`);
  let i = 0, done = 0, totalAdded = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < list.length) {
      const p = list[i++];
      try {
        const r = await expandOne(key, model, p, conf);
        fs.writeFileSync(path.join(OUT, `${p.id}.json`), JSON.stringify(r, null, 1));
        totalAdded += r.added.length; done++;
        console.log(`${String(done).padStart(4)}/${list.length} ${p.id}: +${r.added.length} (rejected ${r.rejected.length}, rarity flags ${r.rarityFlags.length})`);
      } catch (e) { console.log(`     ! ${p.id}: ${e.message}`); }
    }
  }));
  console.log(`done: ${done} question(s), +${totalAdded} verified answers → data/expansions/. Review, then run --apply.`);
}

function apply(bank) {
  if (!fs.existsSync(OUT)) { console.error('No data/expansions/ yet.'); process.exit(1); }
  let added = 0, qs = 0;
  for (const p of bank.prompts) {
    const f = path.join(OUT, `${p.id}.json`);
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    let n = 0;
    for (const a of r.added || []) {
      if (known(p, a.name)) continue;  // bank may have changed since the run
      p.answers.push({ name: a.name, aliases: a.aliases || [], points: a.points });
      n++;
    }
    if (n) { added += n; qs++; p.party = p.answers.length >= 40; }
  }
  fs.writeFileSync(BANK, JSON.stringify(bank, null, 2) + '\n');
  console.log(`merged +${added} answers into ${qs} question(s). Now run the content validator and tools/seed-bank.sh.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
