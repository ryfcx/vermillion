// Live end-to-end test against Supabase: two guest players, Daily submit + replay block, leaderboard, one room round.
// Run: node tools/e2e-live.mjs   (needs anonymous sign-ins enabled; creates real guest users, delete them after)

const V=new URL('..', import.meta.url).pathname.replace(/\/$/,'');
const { createClient } = await import(V+'/vendor/supabase.js');
const { ONLINE } = await import(V+'/src/config.js');
const { getDailyPrompts, utcDayKey } = await import(V+'/src/modes.js');
const { scoreRun } = await import(V+'/src/score.js');
const fs = await import('node:fs');
const bank = JSON.parse(fs.readFileSync(V+'/data/prompts.json','utf8'));
const mk = () => createClient(ONLINE.url, ONLINE.publishableKey, { auth: { persistSession: false } });
const A = mk(), B = mk();
const sa = await A.auth.signInAnonymously(); if (sa.error) { console.log('ANON SIGN-IN:', sa.error.message); process.exit(0); }
const sb = await B.auth.signInAnonymously();
console.log('guests ok', !!sa.data.user, !!sb.data.user);
const pa = await A.from('profiles').select('*').eq('id', sa.data.user.id).single(); console.log('profile', pa.data?.username);
// solo daily
const day = utcDayKey(); const prompts = getDailyPrompts(bank, day);
const inputs = prompts.map((p,i) => i%3===0 ? '' : i%3===1 ? p.answers[0].name : p.answers[p.answers.length-1].name.slice(0,-1)+'x');
const local = scoreRun(prompts, inputs);
const r = await A.functions.invoke('submit-run', { body: { mode:'daily', packId:null, dayKey:day, practice:false, answers: prompts.map((p,i)=>({promptId:p.id,input:inputs[i]})) } });
console.log('submit-run', r.error ? ('ERR '+r.error.message+' '+(await r.error.context?.text?.())) : `server ${r.data.run.total} local ${local.total} rank ${JSON.stringify(r.data.rank)} streak ${r.data.stats.daily_streak}`);
const again = await A.functions.invoke('submit-run', { body: { mode:'daily', packId:null, dayKey:day, practice:false, answers: prompts.map((p,i)=>({promptId:p.id,input:inputs[i]})) } });
console.log('replay blocked', again.error?.context?.status);
const lb = await B.rpc('leaderboard_daily', {}); console.log('board', JSON.stringify(lb.data?.map(x=>[x.rank,x.username,x.total])), lb.error?.message);
// room
const c = await A.rpc('create_room', {}); console.log('room', c.data?.code, c.error?.message);
const j = await B.rpc('join_room', { p_code: c.data.code.toLowerCase() }); console.log('join', !!j.data, j.error?.message);
const st = await A.rpc('start_room', { p_room: c.data.id }); console.log('start', st.data?.status, st.data?.round, st.error?.message);
const early = await A.functions.invoke('room-answer', { body: { roomId: c.data.id, round: 1, input: 'x' } }); console.log('early answer rejected', early.error?.context?.status);
await new Promise(r=>setTimeout(r, 3300));
const pid = st.data.prompt_ids[0]; const pr = bank.prompts.find(p=>p.id===pid);
const same = pr.answers[0].name;
const visBefore = await B.from('room_answers').select('*').eq('room_id', c.data.id);
const a1 = await A.functions.invoke('room-answer', { body: { roomId: c.data.id, round: 1, input: same } });
console.log('A answered', JSON.stringify(a1.data), a1.error?.message);
const bSees = await B.from('room_answers').select('user_id').eq('room_id', c.data.id); console.log('B sees A before close:', bSees.data?.length);
const a2 = await B.functions.invoke('room-answer', { body: { roomId: c.data.id, round: 1, input: same.toUpperCase() } });
console.log('B answered', JSON.stringify(a2.data));
const room = await A.from('rooms').select('round,status').eq('id', c.data.id).single(); console.log('room after both answered', JSON.stringify(room.data));
const ans = await B.from('room_answers').select('points,shared,base_points').eq('room_id', c.data.id); console.log('answers visible after close', JSON.stringify(ans.data));
const pl = await A.from('room_players').select('score').eq('room_id', c.data.id); console.log('scores', JSON.stringify(pl.data));
const dup = await A.functions.invoke('room-answer', { body: { roomId: c.data.id, round: 1, input: same } }); console.log('late answer rejected', dup.error?.context?.status);
await A.rpc('leave_room', { p_room: c.data.id }); await B.rpc('leave_room', { p_room: c.data.id });
console.log('USERS', sa.data.user.id, sb.data.user.id);
