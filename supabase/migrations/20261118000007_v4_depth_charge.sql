-- v4: DEPTH CHARGE, the pass-the-charge party mode (CONTRACT §9.6).
-- Server-authoritative: the fuse lives in a private table that clients can never read,
-- answers are scored by the party-answer Edge Function, and every state change goes through
-- the functions below.

alter table public.profiles
  add column party_rating int not null default 1000,
  add column party_games  int not null default 0,
  add column party_wins   int not null default 0;

create table public.party_rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z]{4}$'),
  host_id         uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'lobby' check (status in ('lobby','playing','finished')),
  is_public       boolean not null default true,
  quick           boolean not null default false,   -- matchmade: auto-starts
  rated           boolean not null default false,
  size_min        int not null default 2 check (size_min between 2 and 10),
  size_max        int not null default 6 check (size_max between 2 and 10),
  ready_at        timestamptz,                      -- quick rooms: auto-start time once size_min is reached
  prompt_id       text,                             -- current question
  question_no     int not null default 0,
  used_prompts    text[] not null default '{}',
  holder_id       uuid references public.profiles(id) on delete set null,
  turn_started_at timestamptz,                      -- answers accepted from here (3 s countdown after each new question)
  winner_id       uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  check (size_min <= size_max)
);
create index party_rooms_open on public.party_rooms (created_at) where status <> 'finished' and is_public;

create table public.party_players (
  room_id   uuid not null references public.party_rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  seat      int not null default 0,
  hearts    int not null default 2 check (hearts between 0 and 3),
  meter     int not null default 0 check (meter between 0 and 100),
  out_at    timestamptz,
  place     int,
  rating_delta int,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (room_id, user_id)
);
create index party_players_user on public.party_players (user_id);

create table public.party_used (
  room_id     uuid not null references public.party_rooms(id) on delete cascade,
  question_no int not null,
  answer_name text not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  points      int not null,
  created_at  timestamptz not null default now(),
  primary key (room_id, question_no, answer_name)
);

create table public.party_events (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.party_rooms(id) on delete cascade,
  kind       text not null check (kind in ('start','pass','heart','boom','out','question','win','leave')),
  user_id    uuid references public.profiles(id) on delete set null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index party_events_room on public.party_events (room_id, id);

-- Hidden fuse: never exposed to clients.
create table private.party_fuse (
  room_id      uuid primary key references public.party_rooms(id) on delete cascade,
  fuse_ends_at timestamptz not null
);
revoke all on private.party_fuse from public, anon, authenticated;

-- ───────────────────────── helpers (private) ─────────────────────────
create or replace function private.is_party_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.party_players
                  where room_id = p_room and user_id = (select auth.uid()) and left_at is null)
$$;

create or replace function private.party_code()
returns text language plpgsql volatile set search_path = '' as $$
declare c text; letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  loop
    c := '';
    for i in 1..4 loop c := c || substr(letters, 1 + floor(random() * length(letters))::int, 1); end loop;
    exit when not exists (select 1 from public.party_rooms where code = c and status <> 'finished');
  end loop;
  return c;
end $$;

-- Next player still in, after a seat (wraps around).
create or replace function private.party_next(p_room uuid, p_after_seat int)
returns uuid language sql stable set search_path = '' as $$
  select user_id from public.party_players
   where room_id = p_room and hearts > 0 and left_at is null
   order by (seat <= p_after_seat), seat
   limit 1
$$;

-- A question with a deep answer pool that this room hasn't used yet.
create or replace function private.party_pick(p_room uuid)
returns text language sql volatile set search_path = '' as $$
  select id from (
    select b.id, 0 as pref from public.prompt_bank b
     where coalesce((b.data->>'party')::boolean, jsonb_array_length(b.data->'answers') >= 40)
       and not b.id = any (coalesce((select used_prompts from public.party_rooms where id = p_room), '{}'))
    union all
    select b.id, 1 from public.prompt_bank b
     where not b.id = any (coalesce((select used_prompts from public.party_rooms where id = p_room), '{}'))
  ) q order by pref, random() limit 1
$$;

create or replace function private.party_new_fuse(p_room uuid, p_delay_s numeric)
returns void language sql volatile set search_path = '' as $$
  insert into private.party_fuse (room_id, fuse_ends_at)
  values (p_room, now() + make_interval(secs => p_delay_s + 10 + random() * 20))
  on conflict (room_id) do update set fuse_ends_at = excluded.fuse_ends_at
$$;

-- Starts a room (no host check; callers check).
create or replace function private.party_begin(p_room uuid)
returns void language plpgsql volatile set search_path = '' as $$
declare q text; holder uuid;
begin
  update public.party_players p set seat = s.rn, hearts = 2, meter = 0, out_at = null, place = null, rating_delta = null
    from (select user_id, row_number() over (order by joined_at) rn
            from public.party_players where room_id = p_room and left_at is null) s
   where p.room_id = p_room and p.user_id = s.user_id;
  q := private.party_pick(p_room);
  select user_id into holder from public.party_players
   where room_id = p_room and left_at is null order by random() limit 1;
  update public.party_rooms
     set status = 'playing', prompt_id = q, question_no = 1, used_prompts = array[q], holder_id = holder,
         turn_started_at = now() + interval '3 seconds', started_at = now(), ready_at = null
   where id = p_room;
  perform private.party_new_fuse(p_room, 3);
  insert into public.party_events (room_id, kind, user_id, data)
  values (p_room, 'start', holder, jsonb_build_object('prompt_id', q, 'question_no', 1));
end $$;

-- Ends the game: places, rating (rated rooms), counters.
create or replace function private.party_finish(p_room uuid)
returns void language plpgsql volatile set search_path = '' as $$
declare r public.party_rooms; winner uuid; n int; k numeric := 24;
begin
  select * into r from public.party_rooms where id = p_room;
  select user_id into winner from public.party_players
   where room_id = p_room and hearts > 0 and left_at is null limit 1;
  -- place 1 = winner, then later knock-outs place higher
  update public.party_players p set place = s.place
    from (select user_id, row_number() over (order by (hearts > 0 and left_at is null) desc, out_at desc nulls first) as place
            from public.party_players where room_id = p_room and seat > 0) s
   where p.room_id = p_room and p.user_id = s.user_id;
  select count(*) into n from public.party_players where room_id = p_room and seat > 0;
  if r.rated and n >= 2 then
    -- multi-player Elo: every pair is a game, scaled by 1/(n-1)
    update public.party_players p set rating_delta = d.delta
      from (
        select a.user_id, round(k / (n - 1) * sum(
                 (case when a.place < b.place then 1 when a.place > b.place then 0 else 0.5 end)
               - 1 / (1 + power(10, (pb.party_rating - pa.party_rating) / 400.0))))::int as delta
          from public.party_players a
          join public.party_players b on b.room_id = a.room_id and b.user_id <> a.user_id and b.seat > 0
          join public.profiles pa on pa.id = a.user_id
          join public.profiles pb on pb.id = b.user_id
         where a.room_id = p_room and a.seat > 0
         group by a.user_id
      ) d
     where p.room_id = p_room and p.user_id = d.user_id;
    update public.profiles pr set party_rating = greatest(100, pr.party_rating + p.rating_delta)
      from public.party_players p where p.room_id = p_room and p.user_id = pr.id and p.rating_delta is not null;
  end if;
  update public.profiles pr set party_games = pr.party_games + 1, party_wins = pr.party_wins + (pr.id = winner)::int
    from public.party_players p where p.room_id = p_room and p.user_id = pr.id and p.seat > 0;
  update public.party_rooms set status = 'finished', finished_at = now(), winner_id = winner, holder_id = null where id = p_room;
  delete from private.party_fuse where room_id = p_room;
  insert into public.party_events (room_id, kind, user_id) values (p_room, 'win', winner);
end $$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.party_rooms   enable row level security;
alter table public.party_players enable row level security;
alter table public.party_used    enable row level security;
alter table public.party_events  enable row level security;
create policy party_rooms_read   on public.party_rooms   for select to authenticated using (private.is_party_member(id));
create policy party_players_read on public.party_players for select to authenticated using (private.is_party_member(room_id));
create policy party_used_read    on public.party_used    for select to authenticated using (private.is_party_member(room_id));
create policy party_events_read  on public.party_events  for select to authenticated using (private.is_party_member(room_id));
grant select on public.party_rooms, public.party_players, public.party_used, public.party_events to authenticated;
grant all on public.party_rooms, public.party_players, public.party_used, public.party_events to service_role;
grant all on private.party_fuse to service_role;

-- ───────────────────────── RPCs ─────────────────────────
create or replace function public.party_create(p_public boolean default true, p_size_max int default 6)
returns public.party_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.party_rooms;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  insert into public.party_rooms (code, host_id, is_public, size_min, size_max)
  values (private.party_code(), me, p_public, 2, least(greatest(p_size_max, 2), 10)) returning * into r;
  insert into public.party_players (room_id, user_id) values (r.id, me);
  return r;
end $$;

create or replace function public.party_join(p_code text)
returns public.party_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.party_rooms; n int;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into r from public.party_rooms where code = upper(trim(p_code)) and status <> 'finished' for update;
  if not found then raise exception 'no room with that code' using errcode = 'P0002'; end if;
  if exists (select 1 from public.party_players where room_id = r.id and user_id = me) then
    update public.party_players set left_at = null where room_id = r.id and user_id = me and r.status = 'lobby';
    return r;
  end if;
  if r.status <> 'lobby' then raise exception 'that game already started' using errcode = 'P0001'; end if;
  select count(*) into n from public.party_players where room_id = r.id and left_at is null;
  if n >= r.size_max then raise exception 'room is full' using errcode = 'P0001'; end if;
  insert into public.party_players (room_id, user_id) values (r.id, me);
  n := n + 1;
  if r.quick then
    if n >= r.size_max then perform private.party_begin(r.id);
    elsif n >= r.size_min and r.ready_at is null then
      update public.party_rooms set ready_at = now() + interval '15 seconds' where id = r.id;
    end if;
  end if;
  select * into r from public.party_rooms where id = r.id;
  return r;
end $$;

-- p_size: '1v1' | '3s' | '4-6' | '8-10'
create or replace function public.party_quick(p_size text default '4-6', p_rated boolean default false)
returns public.party_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.party_rooms; lo int; hi int; my_rating int;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select case p_size when '1v1' then 2 when '3s' then 3 when '8-10' then 8 else 4 end,
         case p_size when '1v1' then 2 when '3s' then 3 when '8-10' then 10 else 6 end into lo, hi;
  select party_rating into my_rating from public.profiles where id = me;
  select ro.* into r from public.party_rooms ro
   where ro.status = 'lobby' and ro.quick and ro.rated = p_rated and ro.size_min = lo and ro.size_max = hi
     and ro.created_at > now() - interval '10 minutes'
     and (select count(*) from public.party_players p where p.room_id = ro.id and p.left_at is null) < ro.size_max
     and (not p_rated or abs(coalesce((select avg(pr.party_rating) from public.party_players p join public.profiles pr on pr.id = p.user_id
                                        where p.room_id = ro.id and p.left_at is null), my_rating) - my_rating) <= 300)
   order by ro.created_at limit 1 for update skip locked;
  if found then return public.party_join(r.code); end if;
  insert into public.party_rooms (code, host_id, is_public, quick, rated, size_min, size_max)
  values (private.party_code(), me, true, true, p_rated, lo, hi) returning * into r;
  insert into public.party_players (room_id, user_id) values (r.id, me);
  return r;
end $$;

create or replace function public.party_start(p_room uuid)
returns public.party_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.party_rooms; n int;
begin
  select * into r from public.party_rooms where id = p_room for update;
  if not found or r.host_id <> me then raise exception 'only the host can start' using errcode = '42501'; end if;
  if r.status <> 'lobby' then return r; end if;
  select count(*) into n from public.party_players where room_id = p_room and left_at is null;
  if n < 2 then raise exception 'you need at least 2 players' using errcode = 'P0001'; end if;
  perform private.party_begin(p_room);
  select * into r from public.party_rooms where id = p_room;
  return r;
end $$;

-- Called by clients about once a second. Applies BOOM when the hidden fuse has run out,
-- and auto-starts matchmade rooms. Safe to call from every client at once.
create or replace function public.party_tick(p_room uuid)
returns public.party_rooms language plpgsql security definer set search_path = '' as $$
declare r public.party_rooms; f timestamptz; h public.party_players; alive int; q text; nxt uuid;
begin
  if not private.is_party_member(p_room) and auth.role() <> 'service_role' then
    raise exception 'not in this room' using errcode = '42501';
  end if;
  select * into r from public.party_rooms where id = p_room for update;
  if r.status = 'lobby' then
    if r.quick and r.ready_at is not null and now() >= r.ready_at
       and (select count(*) from public.party_players where room_id = p_room and left_at is null) >= r.size_min then
      perform private.party_begin(p_room);
      select * into r from public.party_rooms where id = p_room;
    end if;
    return r;
  end if;
  if r.status <> 'playing' then return r; end if;
  select fuse_ends_at into f from private.party_fuse where room_id = p_room;
  if f is null or now() < f then return r; end if;

  -- BOOM
  update public.party_players set hearts = hearts - 1
   where room_id = p_room and user_id = r.holder_id and hearts > 0 returning * into h;
  insert into public.party_events (room_id, kind, user_id, data)
  values (p_room, 'boom', r.holder_id, jsonb_build_object('hearts', coalesce(h.hearts, 0)));
  if h.hearts = 0 then
    update public.party_players set out_at = now() where room_id = p_room and user_id = r.holder_id;
    insert into public.party_events (room_id, kind, user_id) values (p_room, 'out', r.holder_id);
  end if;
  select count(*) into alive from public.party_players where room_id = p_room and hearts > 0 and left_at is null;
  if alive <= 1 then
    perform private.party_finish(p_room);
  else
    q := private.party_pick(p_room);
    nxt := private.party_next(p_room, coalesce(h.seat, 0));
    update public.party_rooms
       set prompt_id = q, question_no = question_no + 1, used_prompts = used_prompts || q,
           holder_id = nxt, turn_started_at = now() + interval '3 seconds'
     where id = p_room;
    perform private.party_new_fuse(p_room, 3);
    insert into public.party_events (room_id, kind, user_id, data)
    values (p_room, 'question', nxt, jsonb_build_object('prompt_id', q, 'question_no', r.question_no + 1));
  end if;
  select * into r from public.party_rooms where id = p_room;
  return r;
end $$;

-- Service only (called by the party-answer Edge Function after it has scored the answer).
-- Returns 'passed' | 'used' | 'not_your_turn' | 'too_early' | 'too_late' | 'not_playing'.
create or replace function public.party_pass(p_room uuid, p_user uuid, p_answer text, p_points int)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.party_rooms; f timestamptz; me public.party_players; nxt uuid; gained boolean := false;
begin
  select * into r from public.party_rooms where id = p_room for update;
  if not found or r.status <> 'playing' then return 'not_playing'; end if;
  if r.holder_id is distinct from p_user then return 'not_your_turn'; end if;
  if now() < r.turn_started_at then return 'too_early'; end if;
  select fuse_ends_at into f from private.party_fuse where room_id = p_room;
  if f is null or now() >= f then return 'too_late'; end if;
  insert into public.party_used (room_id, question_no, answer_name, user_id, points)
  values (p_room, r.question_no, p_answer, p_user, p_points) on conflict do nothing;
  if not found then return 'used'; end if;

  select * into me from public.party_players where room_id = p_room and user_id = p_user for update;
  me.meter := me.meter + greatest(p_points, 0);
  if me.meter >= 100 then
    if me.hearts < 3 then me.hearts := me.hearts + 1; me.meter := me.meter - 100; gained := true;
    else me.meter := 100; end if;
  end if;
  update public.party_players set meter = least(me.meter, 100), hearts = me.hearts where room_id = p_room and user_id = p_user;
  if gained then insert into public.party_events (room_id, kind, user_id, data) values (p_room, 'heart', p_user, jsonb_build_object('hearts', me.hearts)); end if;

  nxt := private.party_next(p_room, me.seat);
  update public.party_rooms set holder_id = nxt where id = p_room;
  update private.party_fuse set fuse_ends_at = greatest(fuse_ends_at, now() + interval '8 seconds') where room_id = p_room;
  insert into public.party_events (room_id, kind, user_id, data)
  values (p_room, 'pass', p_user, jsonb_build_object('answer', p_answer, 'points', p_points, 'to', nxt));
  return 'passed';
end $$;

create or replace function public.party_leave(p_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.party_rooms; p public.party_players; heir uuid; alive int;
begin
  select * into r from public.party_rooms where id = p_room for update;
  if not found then return; end if;
  select * into p from public.party_players where room_id = p_room and user_id = me;
  if not found then return; end if;
  if r.status = 'lobby' then
    delete from public.party_players where room_id = p_room and user_id = me;
  else
    update public.party_players set left_at = now(), hearts = 0, out_at = coalesce(out_at, now())
     where room_id = p_room and user_id = me;
    insert into public.party_events (room_id, kind, user_id) values (p_room, 'leave', me);
  end if;
  if r.status = 'playing' then
    select count(*) into alive from public.party_players where room_id = p_room and hearts > 0 and left_at is null;
    if alive <= 1 then perform private.party_finish(p_room);
    elsif r.holder_id = me then
      update public.party_rooms set holder_id = private.party_next(p_room, p.seat) where id = p_room;
    end if;
  end if;
  if r.host_id = me and r.status <> 'finished' then
    select user_id into heir from public.party_players where room_id = p_room and left_at is null order by joined_at limit 1;
    if heir is null then
      update public.party_rooms set status = 'finished', finished_at = now() where id = p_room;
    else
      update public.party_rooms set host_id = heir where id = p_room;
    end if;
  end if;
end $$;

-- Public room list for the lobby (real rooms only).
create or replace function public.party_public_list(p_limit int default 50)
returns table (code text, host_name text, host_avatar text, players bigint, size_max int, status text, rated boolean, quick boolean)
language sql stable security definer set search_path = '' as $$
  select r.code, p.username, p.avatar,
         (select count(*) from public.party_players x where x.room_id = r.id and x.left_at is null),
         r.size_max, r.status, r.rated, r.quick
    from public.party_rooms r join public.profiles p on p.id = r.host_id
   where r.is_public and r.status <> 'finished' and r.created_at > now() - interval '2 hours'
   order by (r.status = 'lobby') desc, r.created_at desc
   limit least(greatest(p_limit, 1), 100)
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.party_pass(uuid, uuid, text, int) from authenticated;
grant execute on function public.party_create(boolean, int), public.party_join(text), public.party_quick(text, boolean),
  public.party_start(uuid), public.party_tick(uuid), public.party_leave(uuid), public.party_public_list(int) to authenticated;
grant execute on function public.leaderboard_daily(date, text, int), public.leaderboard_alltime(text, int) to anon, authenticated;
grant execute on function private.is_party_member(uuid) to authenticated;
revoke execute on function private.party_code(), private.party_next(uuid, int), private.party_pick(uuid),
  private.party_new_fuse(uuid, numeric), private.party_begin(uuid), private.party_finish(uuid) from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

alter publication supabase_realtime add table public.party_rooms, public.party_players, public.party_used, public.party_events;
