import { createClient } from '../vendor/supabase.js';
import { ONLINE } from './config.js';

const QUEUE_KEY = 'vermillion:online:run-queue';
const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const OFFLINE_MESSAGE = 'You are offline. Try again when you are connected.';

function messageOf(error, fallback = 'Something went wrong. Please try again.') {
  return typeof error === 'string' ? error : (error?.message || fallback);
}

function httpStatus(error) {
  return error?.context?.status ?? error?.status ?? error?.statusCode ?? null;
}

function isRetryable(error) {
  const status = Number(httpStatus(error));
  return !status || status === 408 || status === 429 || status >= 500;
}

function storageOrNull(explicit) {
  if (explicit !== undefined) return explicit;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function userFromSession(session) {
  const user = session?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    isGuest: Boolean(user.is_anonymous ?? user.app_metadata?.provider === 'anonymous'),
    email: user.email ?? null
  };
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function submissionBody(run) {
  const rawMode = String(run?.mode || '');
  const packId = run?.packId ?? (rawMode.startsWith('pack:') ? rawMode.slice(5) : null);
  const mode = rawMode.startsWith('pack:') ? 'pack' : rawMode;
  if (!['daily', 'endless', 'duel', 'pack', 'chapter'].includes(mode)) throw new TypeError('Invalid game mode.');
  if (['pack', 'chapter'].includes(mode) && !packId) throw new TypeError('A topic is required for this game.');
  if (!Array.isArray(run?.answers) || run.answers.length < 1 || run.answers.length > 7) throw new TypeError('This game has no valid answers to submit.');
  const answers = run.answers.map(answer => {
    if (!answer || typeof answer.promptId !== 'string') throw new TypeError('This game has an invalid question.');
    const input = answer.input == null ? '' : String(answer.input);
    if (input.length > 80) throw new TypeError('An answer is too long to submit.');
    return { promptId: answer.promptId, input };
  });
  return {
    mode,
    packId: ['pack', 'chapter'].includes(mode) ? String(packId) : null,
    dayKey: typeof run.dayKey === 'string' ? run.dayKey : null,
    practice: Boolean(run.practice),
    answers
  };
}

export function createOnline({
  client: suppliedClient = null,
  config = ONLINE,
  createClientImpl = createClient,
  storage: suppliedStorage,
  isOnline = () => {
    try { return globalThis.navigator?.onLine !== false; } catch { return true; }
  },
  autoFlush = false
} = {}) {
  let client = suppliedClient;

  function available() {
    try { return Boolean(config?.enabled && isOnline()); } catch { return false; }
  }

  function getClient() {
    if (client) return client;
    if (!config?.url || !config?.publishableKey || typeof createClientImpl !== 'function') return null;
    client = createClientImpl(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function getQueue() {
    try {
      const raw = storageOrNull(suppliedStorage)?.getItem(QUEUE_KEY);
      const queue = raw == null ? [] : JSON.parse(raw);
      return Array.isArray(queue) ? queue.filter(item => item?.body && typeof item.userId === 'string') : [];
    } catch { return []; }
  }

  function putQueue(queue) {
    try {
      const storage = storageOrNull(suppliedStorage);
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200)));
      return true;
    } catch { return false; }
  }

  function queueRun(userId, body) {
    const queue = getQueue();
    const serialized = JSON.stringify(body);
    if (!queue.some(item => item.userId === userId && JSON.stringify(item.body) === serialized)) {
      queue.push({ userId, body, queuedAt: Date.now() });
    }
    return putQueue(queue);
  }

  async function getUser() {
    try {
      const sb = getClient();
      if (!sb?.auth?.getSession) return null;
      const { data, error } = await sb.auth.getSession();
      if (error) return null;
      return userFromSession(data?.session);
    } catch { return null; }
  }

  function onAuth(callback) {
    try {
      if (typeof callback !== 'function') return () => {};
      const result = getClient()?.auth?.onAuthStateChange?.((event, session) => {
        try { callback(userFromSession(session), event); } catch { /* consumer callbacks must not break auth */ }
      });
      const unsubscribe = result?.data?.subscription?.unsubscribe;
      return typeof unsubscribe === 'function' ? () => { try { unsubscribe.call(result.data.subscription); } catch {} } : () => {};
    } catch { return () => {}; }
  }

  async function signInEmail(email) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const clean = String(email ?? '').trim();
      if (!/^\S+@\S+\.\S+$/.test(clean)) return { ok: false, error: 'Enter a valid email address.' };
      const sb = getClient();
      if (!sb?.auth?.signInWithOtp) return { ok: false, error: 'Sign-in is unavailable.' };
      const redirectTo = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : undefined;
      const { data, error } = await sb.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: redirectTo } });
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function signInGuest() {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const sb = getClient();
      if (!sb?.auth?.signInAnonymously) return { ok: false, error: 'Guest sign-in is unavailable.' };
      const { data, error } = await sb.auth.signInAnonymously();
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data: userFromSession(data?.session) };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function upgradeGuest(email) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const user = await getUser();
      if (!user?.isGuest) return { ok: false, error: 'Sign in as a guest before adding an email.' };
      const clean = String(email ?? '').trim();
      if (!/^\S+@\S+\.\S+$/.test(clean)) return { ok: false, error: 'Enter a valid email address.' };
      const sb = getClient();
      const { data, error } = await sb.auth.updateUser({ email: clean });
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function signOut() {
    try {
      const scope = available() ? 'global' : 'local';
      const { error } = await getClient().auth.signOut({ scope });
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data: true };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function getProfile(id = null) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const userId = id || (await getUser())?.id;
      if (!userId) return { ok: false, error: 'Sign in to view this profile.' };
      const { data, error } = await getClient().from('profiles').select('id,username,avatar,created_at').eq('id', userId).maybeSingle();
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data: data ?? null };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function updateProfile({ username, avatar } = {}) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const user = await getUser();
      if (!user) return { ok: false, error: 'Sign in to update your profile.' };
      const changes = {};
      if (username !== undefined) {
        const clean = String(username).trim();
        if (!USERNAME.test(clean)) return { ok: false, error: 'Names must be 3–16 letters, numbers or underscores.' };
        changes.username = clean;
      }
      if (avatar !== undefined) {
        const clean = String(avatar).trim();
        if (!clean || clean.length > 24) return { ok: false, error: 'Choose a valid avatar.' };
        changes.avatar = clean;
      }
      if (!Object.keys(changes).length) return { ok: false, error: 'Choose a name or avatar to update.' };
      const { data, error } = await getClient().from('profiles').update(changes).eq('id', user.id).select('id,username,avatar,created_at').single();
      if (error) {
        if (error.code === '23505' || /duplicate key|unique/i.test(error.message || '')) return { ok: false, error: 'That name is taken.' };
        return { ok: false, error: messageOf(error) };
      }
      return { ok: true, data };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function getStats(id = null) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const userId = id || (await getUser())?.id;
      if (!userId) return { ok: false, error: 'Sign in to view stats.' };
      const { data, error } = await getClient().from('profile_stats').select('user_id,runs,total_points,best_depth,daily_streak,best_streak,last_daily_key,mythic_count,rare_count,updated_at').eq('user_id', userId).maybeSingle();
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data: data ?? null };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function dailyBoard({ day = todayUtc(), scope = 'all', limit = 50 } = {}) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      if (!['all', 'friends'].includes(scope)) return { ok: false, error: 'Choose Everyone or Friends.' };
      const { data, error } = await getClient().rpc('leaderboard_daily', { p_day: day, p_scope: scope, p_limit: limit });
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data: Array.isArray(data) ? data : [] };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function allTimeBoard({ scope = 'all', limit = 50 } = {}) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      if (!['all', 'friends'].includes(scope)) return { ok: false, error: 'Choose Everyone or Friends.' };
      const { data, error } = await getClient().rpc('leaderboard_alltime', { p_scope: scope, p_limit: limit });
      return error ? { ok: false, error: messageOf(error) } : { ok: true, data: Array.isArray(data) ? data : [] };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function listFriends() {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const user = await getUser();
      if (!user) return { ok: false, error: 'Sign in to view friends.' };
      const sb = getClient();
      const [sent, received] = await Promise.all([
        sb.from('friendships').select('user_id,friend_id,status,created_at').eq('user_id', user.id),
        sb.from('friendships').select('user_id,friend_id,status,created_at').eq('friend_id', user.id)
      ]);
      if (sent.error || received.error) return { ok: false, error: messageOf(sent.error || received.error) };
      const rows = [...(sent.data || []), ...(received.data || [])];
      const ids = [...new Set(rows.map(row => row.user_id === user.id ? row.friend_id : row.user_id).filter(Boolean))];
      let profileById = new Map();
      if (ids.length) {
        const { data, error } = await sb.from('profiles').select('id,username,avatar').in('id', ids);
        if (error) return { ok: false, error: messageOf(error) };
        profileById = new Map((data || []).map(profile => [profile.id, profile]));
      }
      const withProfile = row => ({ ...profileById.get(row.user_id === user.id ? row.friend_id : row.user_id), ...row });
      const unique = new Map();
      for (const row of rows) unique.set(`${row.user_id}:${row.friend_id}`, row);
      const all = [...unique.values()];
      const friends = all.filter(row => row.status === 'accepted').map(withProfile);
      const incoming = all.filter(row => row.status === 'pending' && row.friend_id === user.id).map(withProfile);
      const outgoing = all.filter(row => row.status === 'pending' && row.user_id === user.id).map(withProfile);
      return { ok: true, data: { friends, incoming, outgoing } };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function requestFriend(username) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const user = await getUser();
      if (!user) return { ok: false, error: 'Sign in to add a friend.' };
      const clean = String(username ?? '').trim();
      if (!USERNAME.test(clean)) return { ok: false, error: 'Enter a valid player name.' };
      const sb = getClient();
      const { data: friend, error: findError } = await sb.from('profiles').select('id,username,avatar').ilike('username', clean).maybeSingle();
      if (findError) return { ok: false, error: messageOf(findError) };
      if (!friend) return { ok: false, error: 'No player found with that name.' };
      if (friend.id === user.id) return { ok: false, error: 'You cannot add yourself.' };
      const [forward, reverse] = await Promise.all([
        sb.from('friendships').select('user_id,friend_id,status').eq('user_id', user.id).eq('friend_id', friend.id).maybeSingle(),
        sb.from('friendships').select('user_id,friend_id,status').eq('user_id', friend.id).eq('friend_id', user.id).maybeSingle()
      ]);
      if (forward.error || reverse.error) return { ok: false, error: messageOf(forward.error || reverse.error) };
      if (forward.data?.status === 'accepted' || reverse.data?.status === 'accepted') return { ok: false, error: 'You are already friends.' };
      if (forward.data || reverse.data) return { ok: false, error: 'A friend request already exists.' };
      const { data, error } = await sb.from('friendships').insert({ user_id: user.id, friend_id: friend.id, status: 'pending' }).select('user_id,friend_id,status,created_at').single();
      if (error) {
        if (error.code === '23505') return { ok: false, error: 'A friend request already exists.' };
        return { ok: false, error: messageOf(error) };
      }
      return { ok: true, data: { ...friend, ...data } };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function acceptFriend(userId) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const user = await getUser();
      if (!user) return { ok: false, error: 'Sign in to accept a request.' };
      const { data, error } = await getClient().from('friendships').update({ status: 'accepted' })
        .eq('friend_id', user.id).eq('user_id', userId).eq('status', 'pending').select('user_id,friend_id,status,created_at').maybeSingle();
      if (error) return { ok: false, error: messageOf(error) };
      if (!data) return { ok: false, error: 'That friend request is no longer available.' };
      return { ok: true, data };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function removeFriend(userId) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const user = await getUser();
      if (!user) return { ok: false, error: 'Sign in to remove a friend.' };
      const sb = getClient();
      const first = await sb.from('friendships').delete().eq('user_id', user.id).eq('friend_id', userId);
      if (first.error) return { ok: false, error: messageOf(first.error) };
      const second = await sb.from('friendships').delete().eq('user_id', userId).eq('friend_id', user.id);
      return second.error ? { ok: false, error: messageOf(second.error) } : { ok: true, data: true };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function invokeSubmit(body, userId) {
    const { data, error } = await getClient().functions.invoke('submit-run', { body });
    if (!error) return { ok: true, data };
    if (httpStatus(error) === 409) return { ok: false, error: 'You already played this game.' , duplicate: true };
    if (isRetryable(error) && queueRun(userId, body)) return { ok: true, data: { queued: true } };
    return { ok: false, error: messageOf(error, 'Could not submit this game.') };
  }

  async function submitRun(run) {
    try {
      if (!run || typeof run !== 'object') return { ok: false, error: 'This game could not be submitted.' };
      if (run.practice) return { ok: true, data: { skipped: true } };
      const user = await getUser();
      if (!user) return { ok: false, error: 'Sign in to save this game online.' };
      const body = submissionBody(run);
      if (!available()) {
        return queueRun(user.id, body)
          ? { ok: true, data: { queued: true } }
          : { ok: false, error: 'This game could not be saved for later.' };
      }
      return await invokeSubmit(body, user.id);
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  async function flushQueue() {
    try {
      const queue = getQueue();
      if (!queue.length || !available()) return { ok: true, data: { sent: 0, remaining: queue.length } };
      const user = await getUser();
      if (!user) return { ok: true, data: { sent: 0, remaining: queue.length } };
      let sent = 0;
      const keep = [];
      for (const item of queue) {
        if (item.userId !== user.id) { keep.push(item); continue; }
        try {
          const { error } = await getClient().functions.invoke('submit-run', { body: item.body });
          if (!error || httpStatus(error) === 409) { sent += 1; continue; }
          if (isRetryable(error)) keep.push(item);
        } catch { keep.push(item); }
      }
      if (!putQueue(keep)) return { ok: false, error: 'Saved games could not be removed from the offline queue.' };
      return { ok: true, data: { sent, remaining: keep.length } };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  if (autoFlush) {
    try {
      globalThis.addEventListener?.('online', () => { void flushQueue(); });
      queueMicrotask(() => { void flushQueue(); });
    } catch { /* offline retry is best-effort */ }
  }

  return {
    available, getUser, onAuth, signInEmail, signInGuest, upgradeGuest, signOut,
    getProfile, updateProfile, getStats, submitRun, dailyBoard, allTimeBoard,
    listFriends, requestFriend, acceptFriend, removeFriend, flushQueue
  };
}

const api = createOnline({ autoFlush: true });
export const {
  available, getUser, onAuth, signInEmail, signInGuest, upgradeGuest, signOut,
  getProfile, updateProfile, getStats, submitRun, dailyBoard, allTimeBoard,
  listFriends, requestFriend, acceptFriend, removeFriend, flushQueue
} = api;
