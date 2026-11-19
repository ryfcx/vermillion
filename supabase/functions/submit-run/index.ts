import { createClient } from 'npm:@supabase/supabase-js@2';
import { getDailyPrompts, getPackDailyPrompts, LAUNCH_DAY } from '../_shared/modes.js';
import { scoreRun } from '../_shared/score.js';
import { nextDailyStreak } from '../_shared/streak.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_MS = 60_000;
let cachedBank: { prompts: Record<string, any>[] } | null = null;
let cachedAt = 0;

type AnswerInput = { promptId: string; input: string };

type RequestBody = {
  mode: 'daily' | 'endless' | 'duel' | 'pack' | 'chapter';
  packId?: string | null;
  dayKey?: string | null;
  practice?: boolean;
  answers: AnswerInput[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function validDay(dayKey: unknown): dayKey is string {
  if (typeof dayKey !== 'string' || !DAY.test(dayKey)) return false;
  const date = new Date(`${dayKey}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dayKey;
}

function allowedDailyKey(dayKey: string) {
  if (dayKey < LAUNCH_DAY) return false;
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return dayKey <= tomorrow.toISOString().slice(0, 10);
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

async function loadBank(service: ReturnType<typeof serviceClient>) {
  if (cachedBank && Date.now() - cachedAt < CACHE_MS) return cachedBank;
  const { data, error } = await service.from('prompt_bank').select('data').order('ord'); // file order: getDailyPrompts depends on it
  if (error) throw new Error(`Could not load the question bank: ${error.message}`);
  const prompts = (data || []).map((row: { data: Record<string, any> }) => row.data).filter(Boolean);
  if (prompts.length < 7) throw new Error('The question bank is not ready.');
  cachedBank = { prompts };
  cachedAt = Date.now();
  return cachedBank;
}

function parseBody(value: unknown): RequestBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (!['daily', 'endless', 'duel', 'pack', 'chapter'].includes(String(body.mode))) return null;
  if (!Array.isArray(body.answers) || body.answers.length !== 7) return null;
  const answers: AnswerInput[] = [];
  for (const raw of body.answers) {
    if (!raw || typeof raw !== 'object') return null;
    const answer = raw as Record<string, unknown>;
    if (typeof answer.promptId !== 'string' || !answer.promptId || typeof answer.input !== 'string' || answer.input.length > 80) return null;
    answers.push({ promptId: answer.promptId, input: answer.input });
  }
  if (new Set(answers.map(answer => answer.promptId)).size !== answers.length) return null;
  if (['pack', 'chapter'].includes(String(body.mode)) && (typeof body.packId !== 'string' || !body.packId)) return null;
  if (body.dayKey != null && !validDay(body.dayKey)) return null;
  if (typeof body.practice !== 'boolean') return null;
  return {
    mode: body.mode as RequestBody['mode'],
    packId: body.mode === 'pack' || body.mode === 'chapter' ? String(body.packId) : null,
    dayKey: body.dayKey == null ? null : String(body.dayKey),
    practice: body.practice,
    answers
  };
}

async function allUserRuns(service: ReturnType<typeof serviceClient>, userId: string) {
  const rows: Record<string, any>[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await service.from('runs').select('mode,day_key,official,total,depth,answers,created_at')
      .eq('user_id', userId).order('created_at').range(start, start + 999);
    if (error) throw new Error(`Could not update account stats: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function calculateStats(userId: string, runs: Record<string, any>[]) {
  const dailyKeys = [...new Set(runs.filter(run => run.official && run.mode === 'daily' && run.day_key)
    .map(run => String(run.day_key).slice(0, 10)))].sort();
  let streakState = { dailyStreak: 0, bestStreak: 0, lastDailyKey: null as string | null };
  for (const key of dailyKeys) streakState = nextDailyStreak(streakState, key);
  const answers = runs.flatMap(run => Array.isArray(run.answers) ? run.answers : []);
  return {
    user_id: userId,
    runs: runs.length,
    total_points: runs.reduce((sum, run) => sum + (Number(run.total) || 0), 0),
    best_depth: runs.reduce((best, run) => Math.max(best, Number(run.depth) || 0), 0),
    daily_streak: streakState.dailyStreak,
    best_streak: streakState.bestStreak,
    last_daily_key: streakState.lastDailyKey,
    mythic_count: answers.filter(answer => answer?.tier === 'mythic').length,
    rare_count: answers.filter(answer => answer?.tier === 'rare').length,
    updated_at: new Date().toISOString()
  };
}

async function dailyRank(service: ReturnType<typeof serviceClient>, userId: string, dayKey: string) {
  const rows: Record<string, any>[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await service.from('runs').select('user_id,total,created_at')
      .eq('mode', 'daily').eq('official', true).eq('day_key', dayKey)
      .order('total', { ascending: false }).order('created_at', { ascending: true }).range(start, start + 999);
    if (error) throw new Error(`Could not get today's rank: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const index = rows.findIndex(row => row.user_id === userId);
  return index < 0 ? null : { rank: index + 1, total: rows.length };
}

async function updateStats(service: ReturnType<typeof serviceClient>, userId: string) {
  const runs = await allUserRuns(service, userId);
  const stats = calculateStats(userId, runs);
  const { error } = await service.from('profile_stats').upsert(stats, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not update account stats: ${error.message}`);
  return stats;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Sign in to save this game.' }, 401);
    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const body = parseBody(raw);
    if (!body) return json({ error: 'This game submission is invalid.' }, 400);
    if (body.practice) return json({ error: 'Practice games are not submitted.' }, 400);
    const official = body.mode === 'daily' || body.mode === 'pack';
    if (official && (!body.dayKey || !allowedDailyKey(body.dayKey))) return json({ error: 'This game date is outside the archive.' }, 400);

    const service = serviceClient();
    const bank = await loadBank(service);
    const promptById = new Map(bank.prompts.map(prompt => [prompt.id, prompt]));
    const promptIds = body.answers.map(answer => answer.promptId);
    const prompts = promptIds.map(id => promptById.get(id));
    if (prompts.some(prompt => !prompt)) return json({ error: 'This game contains an unknown question.' }, 400);
    const selectedPrompts = prompts as Record<string, any>[];

    if (official) {
      const expected = body.mode === 'daily'
        ? getDailyPrompts(bank, body.dayKey!)
        : getPackDailyPrompts(bank, body.packId!, body.dayKey!);
      if (expected.length !== 7 || expected.some((prompt, index) => prompt.id !== promptIds[index])) {
        return json({ error: 'These questions do not match that daily game.' }, 400);
      }
    } else if ((body.mode === 'pack' || body.mode === 'chapter') && selectedPrompts.some(prompt => !prompt.packs?.includes(body.packId!))) {
      return json({ error: 'A question does not belong to this topic.' }, 400);
    }

    const scored = scoreRun(selectedPrompts, body.answers.map(answer => answer.input));
    const answers = scored.answers.map((answer, index) => ({
      promptId: answer.promptId,
      input: answer.input,
      answerName: answer.answer,
      points: answer.points,
      tier: answer.tier,
      usedHint: false,
      timedOut: answer.input.length === 0,
      corrected: answer.corrected
    }));
    const createdAt = new Date().toISOString();
    const run = {
      mode: body.mode,
      packId: body.packId,
      dayKey: body.dayKey,
      practice: false,
      official,
      promptIds,
      answers,
      total: scored.total,
      depth: scored.depth,
      finishedAt: Date.parse(createdAt)
    };
    const { data: saved, error: insertError } = await service.from('runs').insert({
      user_id: user.id,
      mode: body.mode,
      pack_id: body.packId,
      day_key: body.dayKey,
      official,
      prompt_ids: promptIds,
      answers,
      total: scored.total,
      depth: scored.depth,
      created_at: createdAt
    }).select('*').single();
    if (insertError) {
      if (insertError.code === '23505') return json({ error: 'already played' }, 409);
      return json({ error: insertError.message || 'Could not save this game.' }, 500);
    }

    const stats = await updateStats(service, user.id);
    const rank = body.mode === 'daily' && official ? await dailyRank(service, user.id, body.dayKey!) : null;
    return json({ run: { ...run, id: saved.id, created_at: saved.created_at }, stats, rank });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save this game.' }, 500);
  }
});
