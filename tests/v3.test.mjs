import assert from 'node:assert/strict';
import { createOnline } from '../src/online.js';
import { createRooms } from '../src/rooms.js';
import { saveRun, getStats } from '../src/storage.js';
import { nextDailyStreak } from '../supabase/functions/_shared/streak.js';

function fakeSupabase() {
  const tables = {
    profiles: [
      { id: 'u1', username: 'DiverOne', avatar: 'vermi', created_at: '2026-11-01T00:00:00Z' },
      { id: 'u2', username: 'DiverTwo', avatar: 'mascot', created_at: '2026-11-01T00:00:00Z' }
    ],
    profile_stats: [{ user_id: 'u1', runs: 3, total_points: 90, best_depth: 600, daily_streak: 2, best_streak: 3, last_daily_key: '2026-11-17', mythic_count: 1, rare_count: 2 }],
    friendships: [{ user_id: 'u2', friend_id: 'u1', status: 'pending', created_at: '2026-11-17T00:00:00Z' }],
    rooms: [{ id: 'room-1', code: 'ABCDE', host_id: 'u1', status: 'playing', round: 1, timer_ms: 20000, round_started_at: '2026-11-18T12:00:00Z', prompt_ids: ['q1'] }],
    room_players: [{ room_id: 'room-1', user_id: 'u1', score: 0, left_at: null, answered_round: 1, joined_at: '2026-11-18T11:00:00Z' }],
    room_answers: []
  };
  const calls = { rpc: [], functions: [], channels: [] };
  let session = { user: { id: 'u1', is_anonymous: true, email: null } };
  let rpcError = null;
  const channels = calls.channels;

  class Query {
    constructor(table) { this.table = table; this.action = 'select'; this.payload = null; this.filters = []; this.returning = false; this.one = null; }
    select() { if (this.action !== 'select') this.returning = true; return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    is(key, value) { this.filters.push(row => row[key] === value); return this; }
    ilike(key, value) { this.filters.push(row => String(row[key]).toLowerCase() === String(value).toLowerCase()); return this; }
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    order() { return this; }
    update(payload) { this.action = 'update'; this.payload = payload; return this; }
    insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
    delete() { this.action = 'delete'; return this; }
    maybeSingle() { this.one = 'maybe'; return this.execute(); }
    single() { this.one = 'single'; return this.execute(); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    async execute() {
      const rows = tables[this.table] || [];
      const selected = rows.filter(row => this.filters.every(filter => filter(row)));
      if (this.action === 'update') {
        if (this.table === 'profiles' && this.payload.username && tables.profiles.some(p => p.id !== selected[0]?.id && p.username.toLowerCase() === this.payload.username.toLowerCase())) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        for (const row of selected) Object.assign(row, this.payload);
      } else if (this.action === 'insert') {
        const entries = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const entry of entries) {
          if (this.table === 'friendships' && rows.some(row => row.user_id === entry.user_id && row.friend_id === entry.friend_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          rows.push({ ...entry, created_at: entry.created_at || '2026-11-18T00:00:00Z' });
        }
        tables[this.table] = rows;
      } else if (this.action === 'delete') {
        tables[this.table] = rows.filter(row => !selected.includes(row));
      }
      let result = this.action === 'delete' ? null : (this.action === 'select' ? selected : selected.length ? selected : rows.filter(row => this.filters.every(filter => filter(row))));
      if (this.action === 'insert') result = rows.slice(-((Array.isArray(this.payload) ? this.payload : [this.payload]).length));
      if (this.table === 'room_players' && Array.isArray(result)) {
        result = result.map(row => ({ ...row, profile: tables.profiles.find(profile => profile.id === row.user_id) || null }));
      }
      if (this.one) {
        const first = Array.isArray(result) ? result[0] ?? null : result;
        if (this.one === 'single' && !first) return { data: null, error: { message: 'row not found' } };
        return { data: first, error: null };
      }
      return { data: result, error: null };
    }
  }

  const client = {
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      async getUser() { return { data: { user: session?.user || null }, error: null }; },
      onAuthStateChange(callback) { const subscription = { unsubscribe() { subscription.closed = true; } }; callback('INITIAL_SESSION', session); return { data: { subscription } }; },
      async signInWithOtp({ email }) { return { data: { email }, error: null }; },
      async signInAnonymously() { session = { user: { id: 'guest-2', is_anonymous: true } }; return { data: { session }, error: null }; },
      async updateUser({ email }) { session.user.email = email; return { data: { user: session.user }, error: null }; },
      async signOut() { session = null; return { error: null }; }
    },
    from(table) { return new Query(table); },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (rpcError) return { data: null, error: rpcError };
      if (name === 'leaderboard_daily') return { data: [{ rank: 1, user_id: 'u1' }], error: null };
      if (name === 'leaderboard_alltime') return { data: [{ rank: 2, user_id: 'u1' }], error: null };
      if (name === 'create_room') return { data: { id: 'room-2', code: 'FGHJK', ...args }, error: null };
      return { data: { id: args.p_room, status: 'playing', round: args.p_round || 1 }, error: null };
    },
    functions: { async invoke(name, options) { calls.functions.push({ name, options }); return { data: { status: 'answered', run: { id: 'r1' }, stats: {}, rank: null }, error: null }; } },
    channel(name) {
      const handlers = [];
      const channel = {
        name, handlers, tracked: null, removed: false,
        on(type, filter, callback) { handlers.push({ type, filter, callback }); return channel; },
        subscribe(callback) { queueMicrotask(() => callback('SUBSCRIBED')); return channel; },
        async track(value) { channel.tracked = value; },
        presenceState() { return { u1: [{ user_id: 'u1' }] }; },
        unsubscribe() { channel.removed = true; }
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) { channel.removed = true; return Promise.resolve('ok'); }
  };
  return { client, tables, calls, setSession(value) { session = value; }, setRpcError(value) { rpcError = value; } };
}

const config = { enabled: true, url: 'https://example.invalid', publishableKey: 'public-key' };
const run = { mode: 'daily', dayKey: '2026-11-18', practice: false, official: true, answers: Array.from({ length: 7 }, (_, i) => ({ promptId: `q${i}`, input: `A${i}` })) };

async function onlineTests() {
  const fake = fakeSupabase();
  const queueStore = new Map();
  const storage = { getItem: key => queueStore.get(key) ?? null, setItem: (key, value) => queueStore.set(key, value) };
  let connected = false;
  const online = createOnline({ client: fake.client, config, storage, isOnline: () => connected, autoFlush: false });
  assert.equal(online.available(), false);
  assert.equal((await online.getUser()).id, 'u1');
  const queued = await online.submitRun(run);
  assert.deepEqual(queued, { ok: true, data: { queued: true } });
  assert.equal(JSON.parse(queueStore.get('vermillion:online:run-queue')).length, 1);
  assert.deepEqual(await online.submitRun({ ...run, practice: true }), { ok: true, data: { skipped: true } });
  connected = true;
  const flushed = await online.flushQueue();
  assert.equal(flushed.data.sent, 1);
  assert.equal(flushed.data.remaining, 0);
  assert.equal(fake.calls.functions[0].name, 'submit-run');
  assert.deepEqual(fake.calls.functions[0].options.body.answers[0], { promptId: 'q0', input: 'A0' });
  const chapterRun = { ...run, mode: 'chapter', packId: 'movies', dayKey: null };
  assert.equal((await online.submitRun(chapterRun)).ok, true);
  assert.equal(fake.calls.functions.at(-1).options.body.mode, 'chapter');
  assert.equal(fake.calls.functions.at(-1).options.body.packId, 'movies');

  assert.equal((await online.signInEmail('bad')) .ok, false);
  assert.equal((await online.signInEmail('player@example.com')).ok, true);
  assert.equal((await online.updateProfile({ username: 'Updated_1', avatar: 'mascot' })).data.username, 'Updated_1');
  assert.equal((await online.getProfile()).data.id, 'u1');
  assert.equal((await online.getStats()).data.daily_streak, 2);
  assert.equal((await online.dailyBoard({ day: '2026-11-18', scope: 'all', limit: 10 })).data[0].rank, 1);
  assert.equal((await online.allTimeBoard({ scope: 'friends' })).data[0].rank, 2);
  const friends = await online.listFriends();
  assert.equal(friends.data.incoming[0].username, 'DiverTwo');
  assert.equal((await online.acceptFriend('u2')).data.status, 'accepted');
  assert.equal((await online.requestFriend('DiverTwo')).ok, false); // one-way request already exists
  assert.equal((await online.removeFriend('u2')).ok, true);
  assert.equal((await online.signOut()).ok, true);
  assert.equal(await online.getUser(), null);
}

async function roomTests() {
  const fake = fakeSupabase();
  const rooms = createRooms({ client: fake.client, config, isOnline: () => true, now: () => Date.parse('2026-11-18T12:00:10Z') });
  const created = await rooms.createRoom({ packId: 'movies', isPublic: true, timerMs: 20000 });
  assert.equal(created.data.id, 'room-2');
  assert.deepEqual(fake.calls.rpc[0], { name: 'create_room', args: { p_pack: 'movies', p_public: true, p_timer_ms: 20000 } });
  await rooms.createRoom();
  assert.deepEqual(fake.calls.rpc[1], { name: 'create_room', args: { p_pack: null, p_public: false, p_timer_ms: 25000 } });
  assert.equal((await rooms.joinRoom(' abcd1 ')).ok, false);
  assert.equal((await rooms.joinRoom('abcde')).ok, true);
  await rooms.quickMatch(); await rooms.leaveRoom('room-1'); await rooms.startRoom('room-1'); await rooms.advance('room-1', 2);
  const exact = '  typed exactly  ';
  assert.equal((await rooms.answer('room-1', 1, exact)).ok, true);
  const answerCall = fake.calls.functions.at(-1);
  assert.equal(answerCall.name, 'room-answer');
  assert.equal(answerCall.options.body.input, exact);
  const state = await rooms.getRoomState('room-1');
  assert.equal(state.data.players[0].username, 'DiverOne');
  assert.equal(state.data.players[0].answered_round, 1);
  assert.equal(state.data.answers.length, 0);
  let updates = 0;
  const unsubscribe = rooms.subscribe('room-1', value => { if (value.room) updates += 1; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(updates >= 1);
  const channel = fake.calls.channels[0];
  assert(channel.tracked.user_id === 'u1');
  channel.handlers[0].callback({});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(updates >= 2);
  unsubscribe();
  assert.equal(channel.removed, true);
  fake.setRpcError({ message: 'not in this room' });
  assert.equal((await rooms.advance('room-1', 2)).error, 'not in this room');

  let fakeFetch;
  const clockFake = fakeSupabase();
  const clockRooms = createRooms({
    config,
    now: () => 10_000,
    fetchImpl: async () => new Response('', { headers: { Date: new Date(20_000).toUTCString() } }),
    createClientImpl: (_url, _key, options) => {
      fakeFetch = options.global.fetch;
      return { ...clockFake.client, async rpc(...args) { await fakeFetch('https://example.invalid/rpc'); return clockFake.client.rpc(...args); } };
    }
  });
  await clockRooms.quickMatch();
  assert.equal(clockRooms.serverNow(), 20_000);
}

function streakParityTests() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const values = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
    const sequences = [
      ['2026-11-17', '2026-11-18'],
      ['2026-11-17', '2026-11-16'], // archive play cannot rewind the live cursor
      ['2026-11-15', '2026-11-17'] // a missed day resets the streak
    ];
    for (const days of sequences) {
      values.clear();
      let serverStats = { dailyStreak: 0, bestStreak: 0, lastDailyKey: null };
      for (const [index, dayKey] of days.entries()) {
        saveRun({ mode: 'daily', dayKey, practice: false, official: true, promptIds: [`p${index}`], answers: [{ promptId: `p${index}`, input: 'x', answerName: 'X', points: 10, tier: 'common', usedHint: false, timedOut: false }], total: 10, depth: 100, finishedAt: index + 1 });
        serverStats = nextDailyStreak(serverStats, dayKey);
        const local = getStats();
        assert.equal(serverStats.dailyStreak, local.dailyStreak, `daily streak mismatch on ${dayKey}`);
        assert.equal(serverStats.bestStreak, local.bestStreak, `best streak mismatch on ${dayKey}`);
        assert.equal(serverStats.lastDailyKey, local.lastDailyKey, `streak cursor mismatch on ${dayKey}`);
      }
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

await onlineTests();
await roomTests();
streakParityTests();
console.log('v3 fake-client tests passed: online, rooms, realtime, queue, server clock, streak parity');
