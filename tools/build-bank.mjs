#!/usr/bin/env node
// Offline data materialisation, not a runtime build dependency.
// Edit data/source/prompts-full.json, then run node tools/build-bank.mjs.
// --check validates the master and checks generated files without writing anything.
import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBank } from '../src/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['id', 'category', 'text', 'everyday', 'packs', 'party', 'hint', 'fact'];

export async function buildBank({ root = ROOT, check = false } = {}) {
  const source = path.join(root, 'data/source/prompts-full.json');
  const master = validateBank(JSON.parse(await readFile(source, 'utf8')), { full: true });
  const files = new Map(), prompts = [];
  for (const prompt of master.prompts) {
    const metadata = Object.fromEntries(FIELDS.filter(key => prompt[key] !== undefined).map(key => [key, prompt[key]]));
    metadata.answerCount = prompt.answers.length;
    prompts.push(metadata);
    files.set(`data/answers/${prompt.id}.json`, JSON.stringify({ answers: prompt.answers }) + '\n');
  }
  const metadata = validateBank({ version: master.version, prompts });
  // Metadata publishes last, after all shards have been written.
  files.set('data/prompts.json', JSON.stringify(metadata, null, 2) + '\n');
  const answerDir = path.join(root, 'data/answers');
  let existing = [];
  try { existing = await readdir(answerDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stale = existing.filter(name => name.endsWith('.json') && !files.has(`data/answers/${name}`));
  if (check) {
    const issues = stale.map(name => `Stale shard: data/answers/${name}`);
    for (const [relative, expected] of files) {
      try { if (await readFile(path.join(root, relative), 'utf8') !== expected) issues.push(`Out of date: ${relative}`); }
      catch (error) { if (error.code === 'ENOENT') issues.push(`Missing: ${relative}`); else throw error; }
    }
    if (issues.length) throw new Error(`${issues.join('\n')}\nRun node tools/build-bank.mjs to regenerate.`);
  } else {
    await mkdir(answerDir, { recursive: true });
    for (const [relative, content] of files) {
      const target = path.join(root, relative), temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, content); await rename(temporary, target);
    }
    for (const name of stale) await unlink(path.join(answerDir, name));
  }
  return { prompts: prompts.length, answers: master.prompts.reduce((n, p) => n + p.answers.length, 0), metadataBytes: Buffer.byteLength(files.get('data/prompts.json')) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) { console.error('Usage: node tools/build-bank.mjs [--check]'); process.exitCode = 1; }
  else {
    try { const result = await buildBank({ check: args.includes('--check') }); console.log(`${args.includes('--check') ? 'Checked' : 'Built'} ${result.prompts} shards · ${result.answers} answers · ${result.metadataBytes} metadata bytes`); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
