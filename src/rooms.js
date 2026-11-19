import { createClient } from '../vendor/supabase.js';
import { ONLINE } from './config.js';

const OFFLINE_MESSAGE = 'You are offline. Live games need an internet connection.';

function messageOf(error, fallback = 'Something went wrong. Please try again.') {
  return typeof error === 'string' ? error : (error?.message || fallback);
}

export function createRooms({
  client: suppliedClient = null,
  config = ONLINE,
  createClientImpl = createClient,
  fetchImpl = (...args) => globalThis.fetch(...args),
  isOnline = () => {
    try { return globalThis.navigator?.onLine !== false; } catch { return true; }
  },
  now = () => Date.now()
} = {}) {
  let client = suppliedClient;
  let serverOffset = 0;

  function available() {
    try { return Boolean(config?.enabled && isOnline()); } catch { return false; }
  }

  async function captureFetch(...args) {
    const response = await fetchImpl(...args);
    try {
      const serverTime = Date.parse(response?.headers?.get?.('Date') || '');
      if (Number.isFinite(serverTime)) serverOffset = serverTime - now();
    } catch { /* date headers are optional */ }
    return response;
  }

  function getClient() {
    if (client) return client;
    if (!config?.url || !config?.publishableKey || typeof createClientImpl !== 'function') return null;
    client = createClientImpl(config.url, config.publishableKey, {
      global: { fetch: captureFetch },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function call(work) {
    try {
      if (!available()) return { ok: false, error: OFFLINE_MESSAGE };
      const sb = getClient();
      if (!sb) return { ok: false, error: 'Live games are unavailable.' };
      const result = await work(sb);
      if (result?.error) return { ok: false, error: messageOf(result.error) };
      return { ok: true, data: result?.data ?? null };
    } catch (error) { return { ok: false, error: messageOf(error) }; }
  }

  function createRoom({ packId = null, pack = null, isPublic = false, public: publicRoom, timerMs = 25000 } = {}) {
    const topic = packId ?? pack;
    const timer = Number(timerMs);
    if (topic !== null && (typeof topic !== 'string' || !topic)) return Promise.resolve({ ok: false, error: 'Choose a valid topic.' });
    if (!Number.isInteger(timer) || timer < 10000 || timer > 60000) return Promise.resolve({ ok: false, error: 'Game time must be between 10 and 60 seconds.' });
    return call(sb => sb.rpc('create_room', { p_pack: topic, p_public: Boolean(publicRoom ?? isPublic), p_timer_ms: timer }));
  }

  function joinRoom(code) {
    const clean = String(code ?? '').trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(clean)) return Promise.resolve({ ok: false, error: 'Enter the five-letter game code.' });
    return call(sb => sb.rpc('join_room', { p_code: clean }));
  }

  function quickMatch() { return call(sb => sb.rpc('quick_match', {})); }
  function leaveRoom(id) {
    if (!id) return Promise.resolve({ ok: false, error: 'Choose a game to leave.' });
    return call(sb => sb.rpc('leave_room', { p_room: id }));
  }
  function startRoom(id) {
    if (!id) return Promise.resolve({ ok: false, error: 'Choose a game to start.' });
    return call(sb => sb.rpc('start_room', { p_room: id }));
  }
  function advance(id, round) {
    if (!id || !Number.isInteger(round) || round < 1 || round > 7) return Promise.resolve({ ok: false, error: 'This game round is invalid.' });
    return call(sb => sb.rpc('advance_round', { p_room: id, p_round: round }));
  }

  function answer(id, round, input) {
    if (!id || !Number.isInteger(round) || round < 1 || round > 7) return Promise.resolve({ ok: false, error: 'This game round is invalid.' });
    const text = input == null ? '' : String(input);
    if (text.length > 80) return Promise.resolve({ ok: false, error: 'Answers must be 80 characters or fewer.' });
    return call(sb => sb.functions.invoke('room-answer', { body: { roomId: id, round, input: text } }));
  }

  async function getRoomState(id) {
    if (!id) return { ok: false, error: 'Choose a game to view.' };
    return call(async sb => {
      const { data: room, error: roomError } = await sb.from('rooms').select('*').eq('id', id).maybeSingle();
      if (roomError) return { error: roomError };
      if (!room) return { error: { message: 'Game not found.' } };
      const [playerResult, answerResult] = await Promise.all([
        sb.from('room_players').select('user_id,score,joined_at,left_at,answered_round,profile:profiles(username,avatar)').eq('room_id', id).order('joined_at'),
        sb.from('room_answers').select('room_id,user_id,round,input,answer_name,base_points,points,shared,submitted_at').eq('room_id', id).order('round')
      ]);
      if (playerResult.error || answerResult.error) return { error: playerResult.error || answerResult.error };
      const players = (playerResult.data || []).map(player => {
        const profile = Array.isArray(player.profile) ? player.profile[0] : player.profile;
        const { profile: _profile, ...fields } = player;
        return { ...fields, username: profile?.username ?? 'Diver', avatar: profile?.avatar ?? 'vermi' };
      });
      return { data: { room, players, answers: answerResult.data || [] } };
    });
  }

  function notify(callback, value) {
    try { callback?.(value); } catch { /* UI callbacks must not break the room channel */ }
  }

  function subscribe(id, onState) {
    let active = true;
    let channel = null;
    let sb = null;
    const noop = () => {};
    if (!id || typeof onState !== 'function') return noop;
    try {
      if (!available()) { notify(onState, { ok: false, error: OFFLINE_MESSAGE }); return noop; }
      sb = getClient();
      if (!sb?.channel) { notify(onState, { ok: false, error: 'Live updates are unavailable.' }); return noop; }
      channel = sb.channel(`room:${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_answers', filter: `room_id=eq.${id}` }, refresh)
        .on('presence', { event: 'sync' }, refresh)
        .subscribe(async status => {
          if (!active) return;
          if (status === 'SUBSCRIBED') {
            try {
              const session = await sb.auth?.getSession?.();
              const userId = session?.data?.session?.user?.id;
              if (userId) await channel.track({ user_id: userId, online_at: new Date(now()).toISOString() });
            } catch { /* presence is a convenience; room reads remain authoritative */ }
            await refresh();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            notify(onState, { ok: false, error: 'Live updates were interrupted. Reconnect to continue.' });
          }
        });
    } catch (error) {
      notify(onState, { ok: false, error: messageOf(error) });
      return noop;
    }

    async function refresh() {
      if (!active) return;
      const result = await getRoomState(id);
      if (!active) return;
      if (!result.ok) { notify(onState, result); return; }
      let presence = {};
      try { presence = channel?.presenceState?.() || {}; } catch { /* channel may be closing */ }
      notify(onState, { ...result.data, presence });
    }

    return () => {
      if (!active) return;
      active = false;
      try {
        const removal = sb?.removeChannel?.(channel);
        if (removal?.catch) removal.catch(() => {});
        else if (!sb?.removeChannel) channel?.unsubscribe?.();
      } catch { /* cleanup is best-effort */ }
    };
  }

  function serverNow() { return now() + serverOffset; }

  return { createRoom, joinRoom, quickMatch, leaveRoom, startRoom, answer, advance, getRoomState, subscribe, serverNow };
}

const api = createRooms();
export const { createRoom, joinRoom, quickMatch, leaveRoom, startRoom, answer, advance, getRoomState, subscribe, serverNow } = api;
