// DEPTH CHARGE: the holder submits an answer. The server scores it with the shared matcher,
// then public.party_pass() atomically checks turn / fuse / reuse and passes the charge.
// Body: { roomId, input }  →  { status: 'passed'|'miss'|'used'|'not_your_turn'|'too_early'|'too_late'|'not_playing', answerName?, points?, tier? }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { scoreAnswer } from '../_shared/score.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const CACHE_MS = 60_000;
let cache = new Map<string, Record<string, any>>();
let cacheAt = 0;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Sign in to play.' }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: 'Sign in to play.' }, 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const input = typeof body.input === 'string' ? body.input : '';
    if (!roomId || !input.trim() || input.length > 80) return json({ error: 'This answer is invalid.' }, 400);

    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: room, error: re } = await service.from('party_rooms')
      .select('id,status,prompt_id,holder_id').eq('id', roomId).maybeSingle();
    if (re) return json({ error: re.message }, 500);
    if (!room) return json({ error: 'No room with that code.' }, 404);
    if (room.status !== 'playing') return json({ status: 'not_playing' }, 409);
    if (room.holder_id !== u.user.id) return json({ status: 'not_your_turn' }, 409);

    if (Date.now() - cacheAt >= CACHE_MS || !cache.has(room.prompt_id)) {
      const { data, error } = await service.from('prompt_bank').select('id,data');
      if (error) return json({ error: `Could not load the question bank: ${error.message}` }, 500);
      cache = new Map((data || []).map((r: { id: string; data: Record<string, any> }) => [r.id, r.data]));
      cacheAt = Date.now();
    }
    const prompt = cache.get(room.prompt_id);
    if (!prompt) return json({ error: 'This question is unavailable.' }, 500);

    // No "Did you mean" in a party game: only confident matches count.
    const scored = scoreAnswer(prompt, input);
    if (!scored.answer) return json({ status: 'miss' });

    const { data: status, error: pe } = await service.rpc('party_pass', {
      p_room: roomId, p_user: u.user.id, p_answer: scored.answer, p_points: scored.points,
    });
    if (pe) return json({ error: pe.message }, 500);
    return json({ status, answerName: scored.answer, points: scored.points, tier: scored.tier }, status === 'passed' ? 200 : 409);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not send this answer.' }, 500);
  }
});
