import { createClient } from 'npm:@supabase/supabase-js@2';
import { scoreAnswer } from '../_shared/score.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const CACHE_MS = 60_000;
let promptCache = new Map<string, Record<string, any>>();
let promptCacheAt = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Server database credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !url || !key) return null;
  const userClient = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await userClient.auth.getUser();
  return error ? null : data?.user ?? null;
}

async function loadPrompt(service: ReturnType<typeof serviceClient>, promptId: string) {
  if (Date.now() - promptCacheAt >= CACHE_MS) {
    const { data, error } = await service.from('prompt_bank').select('id,data');
    if (error) throw new Error(`Could not load the question bank: ${error.message}`);
    promptCache = new Map((data || []).map((row: { id: string; data: Record<string, any> }) => [row.id, row.data]));
    promptCacheAt = Date.now();
  }
  return promptCache.get(promptId) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Sign in to answer in this game.' }, 401);
    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!raw || typeof raw !== 'object') return json({ error: 'This answer is invalid.' }, 400);
    const body = raw as Record<string, unknown>;
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const round = Number(body.round);
    const input = typeof body.input === 'string' ? body.input : null;
    if (!roomId || !Number.isInteger(round) || round < 1 || round > 7 || input === null || input.length > 80) {
      return json({ error: 'This answer is invalid.' }, 400);
    }

    const service = serviceClient();
    const { data: room, error: roomError } = await service.from('rooms')
      .select('id,status,round,round_started_at,timer_ms,prompt_ids').eq('id', roomId).maybeSingle();
    if (roomError) return json({ error: roomError.message || 'Could not load the game.' }, 500);
    if (!room) return json({ error: 'No game with that code.' }, 404);
    const { data: member, error: memberError } = await service.from('room_players')
      .select('user_id,left_at').eq('room_id', roomId).eq('user_id', user.id).is('left_at', null).maybeSingle();
    if (memberError) return json({ error: memberError.message || 'Could not check game membership.' }, 500);
    if (!member) return json({ error: 'You are not an active player in this game.' }, 403);
    if (room.status !== 'playing') return json({ error: 'This game is not taking answers right now.' }, 409);
    if (round !== room.round) return json({ error: 'That question has already ended.' }, 409);
    const start = Date.parse(room.round_started_at || '');
    const deadline = start + Number(room.timer_ms) + 1000;
    if (!Number.isFinite(start) || Date.now() < start || Date.now() > deadline) {
      return json({ error: 'Time is up for this question.' }, 409);
    }
    const promptId = Array.isArray(room.prompt_ids) ? room.prompt_ids[round - 1] : null;
    if (typeof promptId !== 'string') return json({ error: 'This question is unavailable.' }, 500);
    const prompt = await loadPrompt(service, promptId);
    if (!prompt) return json({ error: 'This question is unavailable.' }, 500);

    // Rooms have no confirmation step: pass the exact typed text to the scorer.
    // Its suggest results are intentionally treated as misses by scoreAnswer.
    const scored = scoreAnswer(prompt, input);
    const { error: insertError } = await service.from('room_answers').insert({
      room_id: roomId,
      user_id: user.id,
      round,
      input,
      answer_name: scored.answer,
      base_points: scored.points,
      points: scored.points,
      shared: false
    });
    if (insertError) {
      if (insertError.code === '23505') return json({ error: 'already answered' }, 409);
      return json({ error: insertError.message || 'Could not save this answer.' }, 500);
    }
    // Closing the round is safe to call from every player. The timer path on
    // clients remains available if this best-effort early close is interrupted.
    try {
      await service.rpc('advance_round', { p_room: roomId, p_round: round });
    } catch { /* persisted answer remains successful; timer will close the round */ }
    return json({ status: 'answered', answerName: scored.answer, basePoints: scored.points, tier: scored.tier });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save this answer.' }, 500);
  }
});
