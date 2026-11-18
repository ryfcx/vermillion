// One-time / on-change loader for the server-side question bank.
// POST the whole data/prompts.json with header `x-seed-secret: <key>`. Only the key's SHA-256
// is stored server-side (table public.admin_keys, name 'seed', service_role only).
// Run it with: tools/seed-bank.sh   (reads the secret from .seed-secret, which is gitignored)
import { createClient } from 'npm:@supabase/supabase-js@2';

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const given = req.headers.get('x-seed-secret') ?? '';
  const { data: key } = await sb.from('admin_keys').select('sha256').eq('name', 'seed').maybeSingle();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(given))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  if (given.length < 32 || !key?.sha256 || !same(digest, key.sha256)) {
    return new Response('forbidden', { status: 403 });
  }
  let bank: { prompts?: unknown };
  try { bank = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const prompts = Array.isArray(bank?.prompts) ? bank.prompts as Record<string, unknown>[] : [];
  const valid = prompts.filter(p => typeof p?.id === 'string' && typeof p?.category === 'string'
    && typeof p?.text === 'string' && Array.isArray(p?.answers));
  if (valid.length < 7 || valid.length !== prompts.length) {
    return Response.json({ error: 'invalid bank', total: prompts.length, valid: valid.length }, { status: 400 });
  }
  const now = new Date().toISOString();
  const rows = valid.map(p => ({
    id: p.id, category: p.category, everyday: p.everyday === true,
    packs: Array.isArray(p.packs) ? p.packs : [], data: p, updated_at: now,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from('prompt_bank').upsert(rows.slice(i, i + 100));
    if (error) return Response.json({ error: error.message, at: i }, { status: 500 });
  }
  // Drop questions that were removed from the file.
  const { error: delErr, count } = await sb.from('prompt_bank')
    .delete({ count: 'exact' }).lt('updated_at', now);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
  return Response.json({ loaded: rows.length, removed: count ?? 0,
    everyday: rows.filter(r => r.everyday).length });
});
