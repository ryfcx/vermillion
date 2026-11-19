import { createClient } from '../vendor/supabase.js';
import { ONLINE } from './config.js';

const OFFLINE = 'You are offline. DEPTH CHARGE needs an internet connection.';
const SIZE_OPTIONS = new Set(['1v1', '3s', '4-6', '8-10']);
const PARTY_EVENTS = new Set(['start', 'pass', 'heart', 'boom', 'out', 'question', 'win', 'leave']);
const errorText = error => typeof error === 'string' ? error : error?.message || 'Something went wrong. Please try again.';

/** Client for DEPTH CHARGE. The server owns game state and scoring; this module only reads, submits and broadcasts. */
export function createParty({
  client: suppliedClient = null, config = ONLINE, createClientImpl = createClient,
  fetchImpl = (...args) => globalThis.fetch(...args), isOnline = () => {
    try { return globalThis.navigator?.onLine !== false; } catch { return true; }
  }, now = () => Date.now(), bank = null, maxInputLength = 80
} = {}) {
  let client = suppliedClient;
  const typingSentAt = new Map();

  function getClient() {
    if (client) return client;
    if (!config?.url || !config?.publishableKey || typeof createClientImpl !== 'function') return null;
    client = createClientImpl(config.url, config.publishableKey, {
      global: { fetch: fetchImpl },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function call(work) {
    try {
      if (!config?.enabled || !isOnline()) return { ok: false, error: OFFLINE };
      const sb = getClient();
      if (!sb) return { ok: false, error: 'DEPTH CHARGE is unavailable.' };
      const result = await work(sb);
      if (result?.error) return { ok: false, error: errorText(result.error), status: result.error?.context?.status ?? result.error?.status ?? null };
      return { ok: true, data: result?.data ?? null };
    } catch (error) { return { ok: false, error: errorText(error), status: error?.context?.status ?? error?.status ?? null }; }
  }

  function rpc(name, args = {}) { return call(sb => sb.rpc(name, args)); }
  function validRoomId(id) { return typeof id === 'string' && id.trim().length > 0; }
  function createRoom({ isPublic = true, sizeMax = 6 } = {}) {
    if (typeof isPublic !== 'boolean' || !Number.isInteger(sizeMax) || sizeMax < 2 || sizeMax > 10) return Promise.resolve({ ok: false, error: 'Choose a public setting and a room size from 2 to 10.' });
    return rpc('party_create', { p_public: isPublic, p_size_max: sizeMax });
  }
  function joinRoom(code) {
    const clean = String(code ?? '').trim().toLowerCase();
    if (!/^[a-z]{4}$/.test(clean)) return Promise.resolve({ ok: false, error: 'Enter the four-letter room code.' });
    return rpc('party_join', { p_code: clean });
  }
  function quickPlay({ size = '4-6', rated = false } = {}) {
    if (!SIZE_OPTIONS.has(size) || typeof rated !== 'boolean') return Promise.resolve({ ok: false, error: 'Choose a valid room size and rated setting.' });
    return rpc('party_quick', { p_size: size, p_rated: rated });
  }
  function publicRooms(limit = 50) {
    const count = Number(limit);
    if (!Number.isInteger(count) || count < 1 || count > 100) return Promise.resolve({ ok: false, error: 'Room list size must be from 1 to 100.' });
    return rpc('party_public_list', { p_limit: count });
  }
  function startRoom(roomId) {
    if (!validRoomId(roomId)) return Promise.resolve({ ok: false, error: 'Choose a room to start.' });
    return rpc('party_start', { p_room: roomId });
  }
  function tick(roomId) {
    if (!validRoomId(roomId)) return Promise.resolve({ ok: false, error: 'Choose a room to update.' });
    return rpc('party_tick', { p_room: roomId });
  }
  function leaveRoom(roomId) {
    if (!validRoomId(roomId)) return Promise.resolve({ ok: false, error: 'Choose a room to leave.' });
    return rpc('party_leave', { p_room: roomId });
  }
  function answer(roomId, input) {
    if (!validRoomId(roomId)) return Promise.resolve({ ok: false, error: 'Choose a room to answer in.' });
    const text = input == null ? '' : String(input);
    if (!text.trim() || text.length > maxInputLength) return Promise.resolve({ ok: false, error: `Enter an answer of ${maxInputLength} characters or fewer.` });
    return call(sb => sb.functions.invoke('party-answer', { body: { roomId, input: text } }));
  }

  function promptFor(room) {
    if (!room?.prompt_id || !Array.isArray(bank?.prompts)) return null;
    const prompt = bank.prompts.find(item => item.id === room.prompt_id);
    return prompt ? { id: prompt.id, text: prompt.text, hint: prompt.hint } : null;
  }

  async function getRoomState(roomId) {
    if (!validRoomId(roomId)) return { ok: false, error: 'Choose a room to view.' };
    return call(async sb => {
      const { data: room, error: roomError } = await sb.from('party_rooms').select('*').eq('id', roomId).maybeSingle();
      if (roomError || !room) return { data: null, error: roomError || { message: 'Room not found.' } };
      const [playersResult, usedResult, eventsResult] = await Promise.all([
        sb.from('party_players').select('room_id,user_id,seat,hearts,meter,out_at,place,rating_delta,joined_at,left_at,profile:profiles(username,avatar,party_rating)').eq('room_id', roomId).order('seat'),
        sb.from('party_used').select('question_no,answer_name,user_id,points').eq('room_id', roomId).eq('question_no', room.question_no).order('id'),
        sb.from('party_events').select('id,kind,user_id,data,created_at').eq('room_id', roomId).order('id')
      ]);
      const error = playersResult.error || usedResult.error || eventsResult.error;
      if (error) return { data: null, error };
      const players = (playersResult.data || []).map(player => {
        const profile = Array.isArray(player.profile) ? player.profile[0] : player.profile;
        const { profile: _profile, ...fields } = player;
        return { ...fields, username: profile?.username ?? 'Diver', avatar: profile?.avatar ?? 'buddy-vermi', party_rating: profile?.party_rating ?? 1000 };
      });
      const events = (eventsResult.data || []).filter(event => PARTY_EVENTS.has(event.kind));
      return { data: { room, prompt: promptFor(room), players, used: usedResult.data || [], events } };
    });
  }

  function subscribe(roomId, onState) {
    if (!validRoomId(roomId) || typeof onState !== 'function') return () => {};
    let active = true, channel = null, sb = null;
    const notify = value => { try { onState(value); } catch { /* UI callbacks cannot interrupt realtime refresh. */ } };
    const refresh = async () => {
      if (!active) return;
      const state = await getRoomState(roomId);
      if (active) notify(state);
    };
    try {
      if (!config?.enabled || !isOnline()) { notify({ ok: false, error: OFFLINE }); return () => {}; }
      sb = getClient();
      if (!sb?.channel) { notify({ ok: false, error: 'Room updates are unavailable.' }); return () => {}; }
      channel = sb.channel(`party:${roomId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_rooms', filter: `id=eq.${roomId}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_players', filter: `room_id=eq.${roomId}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_used', filter: `room_id=eq.${roomId}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_events', filter: `room_id=eq.${roomId}` }, refresh)
        .on('broadcast', { event: 'typing' }, ({ payload }) => { if (active) notify({ ok: true, typing: payload }); })
        .subscribe(status => {
          if (!active) return;
          if (status === 'SUBSCRIBED') refresh();
          else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) notify({ ok: false, error: 'Room updates were interrupted. Reconnect to continue.' });
        });
    } catch (error) { notify({ ok: false, error: errorText(error) }); return () => {}; }
    return () => {
      if (!active) return;
      active = false; typingSentAt.delete(roomId);
      try {
        const removal = sb?.removeChannel?.(channel);
        if (removal?.catch) removal.catch(() => {});
        else if (!sb?.removeChannel) channel?.unsubscribe?.();
      } catch { /* cleanup is best-effort */ }
    };
  }

  async function sendTyping(roomId, text, { userId, holderId } = {}) {
    if (!validRoomId(roomId) || !userId || userId !== holderId) return { ok: false, error: 'Only the charge holder can share typing.' };
    const clean = String(text ?? '').slice(0, maxInputLength);
    const timestamp = now(), previous = typingSentAt.get(roomId) ?? -Infinity;
    if (timestamp - previous < 100) return { ok: true, data: { throttled: true } };
    return call(async sb => {
      const auth = await sb.auth?.getUser?.();
      if (auth?.error) return { error: auth.error };
      const authenticatedId = auth?.data?.user?.id;
      if (authenticatedId !== userId || authenticatedId !== holderId) return { error: { message: 'Only the signed-in charge holder can share typing.' } };
      const channel = sb.channel(`party:${roomId}`);
      if (!channel?.send) return { error: { message: 'Typing updates are unavailable.' } };
      const result = await channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, text: clean } });
      if (result?.error) return result;
      typingSentAt.set(roomId, timestamp);
      return { data: { sent: true } };
    });
  }

  return { createRoom, joinRoom, quickPlay, publicRooms, startRoom, tick, leaveRoom, answer, getRoomState, subscribe, sendTyping, promptFor };
}

const api = createParty();
export const { createRoom, joinRoom, quickPlay, publicRooms, startRoom, tick, leaveRoom, answer, getRoomState, subscribe, sendTyping, promptFor } = api;
