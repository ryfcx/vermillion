import assert from 'node:assert/strict';
import { createParty } from '../src/party.js';

const calls = { rpc: [], invoke: [], channels: [] };
const room = { id: 'room-1', code: 'abcd', status: 'playing', prompt_id: 'q1', question_no: 1, holder_id: 'u1' };
let answerErrorStatus = null;
const tables = {
  party_rooms: [room],
  party_players: [{ room_id: 'room-1', user_id: 'u1', seat: 1, hearts: 2, meter: 12, profile: { username: 'Diver', avatar: 'buddy-vermi', party_rating: 1000 } }],
  party_used: [{ room_id: 'room-1', question_no: 1, answer_name: 'Otter', user_id: 'u1', points: 20 }],
  party_events: [{ room_id: 'room-1', id: 1, kind: 'pass', user_id: 'u1', data: { answer: 'Otter', points: 20, to: 'u2' } }]
};
const client = {
  auth: { async getUser() { return { data: { user: { id: 'u1' } }, error: null }; } },
  async rpc(name, args) { calls.rpc.push({ name, args }); return { data: name === 'party_public_list' ? [{ code: 'abcd' }] : room, error: null }; },
  from(table) {
    let filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      order() { return query; },
      maybeSingle() { const row = (tables[table] || []).find(item => filters.every(test => test(item))) || null; return Promise.resolve({ data: row, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: (tables[table] || []).filter(row => filters.every(test => test(row))), error: null }).then(resolve, reject); }
    };
    return query;
  },
  functions: { async invoke(name, options) {
    calls.invoke.push({ name, options });
    if (answerErrorStatus) return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: new Response(JSON.stringify({ status: answerErrorStatus }), { status: 409 }) }) };
    return { data: { status: 'passed', points: 12 }, error: null };
  } },
  channel(name) {
    const channel = { name, handlers: [], on(type, filter, callback) { channel.handlers.push({ type, filter, callback }); return channel; }, subscribe(callback) { queueMicrotask(() => callback('SUBSCRIBED')); return channel; }, async send(message) { channel.sent = message; return 'ok'; }, unsubscribe() { channel.closed = true; } };
    calls.channels.push(channel); return channel;
  },
  removeChannel(channel) { channel.closed = true; return Promise.resolve('ok'); }
};
const config = { enabled: true, url: 'https://example.invalid', publishableKey: 'test' };
let clock = 1000;
const party = createParty({ client, config, isOnline: () => true, now: () => clock, bank: { prompts: [{ id: 'q1', text: 'Name an animal', hint: 'It lives in water', answers: [] }] } });

assert.equal((await party.createRoom()).ok, true);
assert.deepEqual(calls.rpc.at(-1), { name: 'party_create', args: { p_public: true, p_size_max: 6 } });
assert.equal((await party.createRoom({ sizeMax: 11 })).ok, false);
assert.equal((await party.joinRoom(' ABCD ')).ok, true);
assert.deepEqual(calls.rpc.at(-1), { name: 'party_join', args: { p_code: 'abcd' } });
assert.equal((await party.joinRoom('abcde')).ok, false);
assert.equal((await party.quickPlay({ size: '1v1', rated: true })).ok, true);
assert.deepEqual(calls.rpc.at(-1), { name: 'party_quick', args: { p_size: '1v1', p_rated: true } });
assert.equal((await party.publicRooms()).data[0].code, 'abcd');
assert.deepEqual(calls.rpc.at(-1), { name: 'party_public_list', args: { p_limit: 50 } });
for (const method of ['startRoom', 'tick', 'leaveRoom']) assert.equal((await party[method]('room-1')).ok, true);
assert.deepEqual(calls.rpc.slice(-3).map(call => call.name), ['party_start', 'party_tick', 'party_leave']);
assert.equal((await party.answer('room-1', 'valid')).data.status, 'passed');
assert.deepEqual(calls.invoke[0], { name: 'party-answer', options: { body: { roomId: 'room-1', input: 'valid' } } });
assert.equal((await party.answer('room-1', '  ')).ok, false);
for (const status of ['used', 'not_your_turn', 'too_early', 'too_late', 'not_playing']) {
  answerErrorStatus = status;
  assert.deepEqual(await party.answer('room-1', 'valid'), {
    ok: false,
    error: 'Edge Function returned a non-2xx status code',
    status: 409,
    data: { status }
  });
}
answerErrorStatus = null;

const state = await party.getRoomState('room-1');
assert.equal(state.data.prompt.text, 'Name an animal');
assert.equal(state.data.players[0].username, 'Diver');
assert.equal(state.data.used[0].answer_name, 'Otter');
assert.equal(state.data.events[0].data.to, 'u2');

let stateUpdates = 0, typingPayload;
const unsubscribe = party.subscribe('room-1', value => { if (value.data?.room) stateUpdates += 1; if (value.typing) typingPayload = value.typing; });
await new Promise(resolve => setTimeout(resolve, 0));
assert(stateUpdates >= 1);
const channel = calls.channels.at(-1);
assert.equal(channel.name, 'party:room-1');
assert.deepEqual(channel.handlers.filter(handler => handler.type === 'postgres_changes').map(handler => handler.filter.table), ['party_rooms', 'party_players', 'party_used', 'party_events']);
channel.handlers.find(handler => handler.type === 'broadcast').callback({ payload: { user_id: 'u2', text: 'Ot' } });
assert.deepEqual(typingPayload, { user_id: 'u2', text: 'Ot' });
unsubscribe(); assert.equal(channel.closed, true);

assert.equal((await party.sendTyping('room-1', 'Ot', { userId: 'u2', holderId: 'u1' })).ok, false);
assert.equal((await party.sendTyping('room-1', 'Ot', { userId: 'u1', holderId: 'u1' })).ok, true);
const typingChannel = calls.channels.at(-1);
assert.deepEqual(typingChannel.sent, { type: 'broadcast', event: 'typing', payload: { user_id: 'u1', text: 'Ot' } });
clock += 50;
assert.deepEqual((await party.sendTyping('room-1', 'Ot', { userId: 'u1', holderId: 'u1' })).data, { throttled: true });
clock += 50;
assert.equal((await party.sendTyping('room-1', 'Otter', { userId: 'u1', holderId: 'u1' })).ok, true);

const offline = createParty({ config, isOnline: () => false });
assert.equal((await offline.publicRooms()).ok, false);
console.log('DEPTH CHARGE fake-client tests passed: RPCs, answers, state, realtime, typing throttle');
