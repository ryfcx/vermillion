-- Vermillion v3: accounts, synced stats, leaderboards, friends, live rooms.
-- The project has "auto-grant API access" OFF, so every grant below is explicit.
-- Writes that involve scoring go through Edge Functions (service_role); clients
-- never insert runs or answers directly.

-- ───────────────────────────── profiles ─────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar      text not null default 'vermi' check (char_length(avatar) <= 24),
  created_at  timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'diver_' || substr(replace(new.id::text, '-', ''), 1, 8));
  insert into public.profile_stats (user_id) values (new.id);
  return new;
end $$;

-- ───────────────────────────── question bank (server-only) ─────────────────────────────
create table public.prompt_bank (
  id        text primary key,
  category  text not null,
  everyday  boolean not null default false,
  packs     text[] not null default '{}',
  data      jsonb not null,            -- full prompt object incl. answers
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── solo runs + stats ─────────────────────────────
create table public.runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  mode        text not null check (mode in ('daily','endless','duel','pack')),
  pack_id     text,
  day_key     date,
  official    boolean not null default false,
  prompt_ids  text[] not null,
  answers     jsonb not null,           -- server-scored RunAnswer[]
  total       int not null,
  depth       int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index runs_one_official
  on public.runs (user_id, mode, coalesce(pack_id, ''), day_key) where official;
create index runs_daily_board on public.runs (day_key, total desc) where official and mode = 'daily';
create index runs_user on public.runs (user_id, created_at desc);

create table public.profile_stats (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  runs           int not null default 0,
  total_points   bigint not null default 0,
  best_depth     int not null default 0,
  daily_streak   int not null default 0,
  best_streak    int not null default 0,
  last_daily_key date,
  mythic_count   int not null default 0,
  rare_count     int not null default 0,
  updated_at     timestamptz not null default now()
);

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────────── friends ─────────────────────────────
create table public.friendships (
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- requester
  friend_id  uuid not null references public.profiles(id) on delete cascade,  -- recipient
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index friendships_friend on public.friendships (friend_id);

-- ───────────────────────────── live rooms ─────────────────────────────
create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z]{5}$'),
  host_id          uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'lobby' check (status in ('lobby','playing','finished')),
  is_public        boolean not null default false,
  pack_id          text,
  max_players      int not null default 8 check (max_players between 2 and 8),
  timer_ms         int not null default 20000 check (timer_ms between 10000 and 60000),
  prompt_ids       text[] not null default '{}',
  round            int not null default 0,          -- 0 = lobby, 1..7 = live round
  round_started_at timestamptz,                     -- may be in the future (countdown)
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index rooms_quick on public.rooms (created_at) where status = 'lobby' and is_public;

create table public.room_players (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  score     int not null default 0,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (room_id, user_id)
);
create index room_players_user on public.room_players (user_id);

create table public.room_answers (
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  round        int not null check (round between 1 and 7),
  input        text not null check (char_length(input) <= 80),
  answer_name  text,                 -- canonical answer, null = miss
  base_points  int not null default 0,
  points       int not null default 0, -- after the shared-answer halving at round end
  shared       boolean not null default false,
  submitted_at timestamptz not null default now(),
  primary key (room_id, user_id, round)
);

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_players
                 where room_id = p_room and user_id = (select auth.uid()) and left_at is null)
$$;

create or replace function public.room_round(p_room uuid)
returns table (round int, status text) language sql stable security definer set search_path = '' as $$
  select r.round, r.status from public.rooms r where r.id = p_room
$$;

-- ───────────────────────────── RLS ─────────────────────────────
alter table public.profiles      enable row level security;
alter table public.prompt_bank   enable row level security;
alter table public.runs          enable row level security;
alter table public.profile_stats enable row level security;
alter table public.friendships   enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_players  enable row level security;
alter table public.room_answers  enable row level security;

-- profiles: public names; you may rename yourself.
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- prompt_bank: no policies → invisible to clients (answers stay secret).

-- runs: you see only your own (others' answers would spoil today's game).
create policy runs_read_own on public.runs for select to authenticated
  using (user_id = (select auth.uid()));

-- stats are public (profile cards).
create policy stats_read on public.profile_stats for select to anon, authenticated using (true);

-- friendships
create policy friends_read on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_id, friend_id));
create policy friends_request on public.friendships for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy friends_accept on public.friendships for update to authenticated
  using (friend_id = (select auth.uid())) with check (friend_id = (select auth.uid()) and status = 'accepted');
create policy friends_remove on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_id, friend_id));

-- rooms + players: members only. All writes go through the RPCs below.
create policy rooms_read on public.rooms for select to authenticated
  using (public.is_room_member(id));
create policy room_players_read on public.room_players for select to authenticated
  using (public.is_room_member(room_id));

-- answers: your own anytime; everyone's once the round has closed.
create policy room_answers_read on public.room_answers for select to authenticated
  using (
    public.is_room_member(room_id) and (
      user_id = (select auth.uid())
      or exists (select 1 from public.room_round(room_id) rr
                 where rr.round > room_answers.round or rr.status = 'finished')
    )
  );

-- ───────────────────────────── grants ─────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.profile_stats to anon, authenticated;
grant update (username, avatar) on public.profiles to authenticated;
grant select on public.runs, public.rooms, public.room_players, public.room_answers to authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
grant all on all tables in schema public to service_role;

-- ───────────────────────────── room RPCs ─────────────────────────────
create or replace function public.new_room_code()
returns text language plpgsql volatile set search_path = '' as $$
declare c text; letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  loop
    c := '';
    for i in 1..5 loop c := c || substr(letters, 1 + floor(random() * length(letters))::int, 1); end loop;
    exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
  end loop;
  return c;
end $$;

create or replace function public.create_room(p_pack text default null, p_public boolean default false,
                                              p_timer_ms int default 20000)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  insert into public.rooms (code, host_id, is_public, pack_id, timer_ms)
  values (public.new_room_code(), me, p_public, p_pack, p_timer_ms) returning * into r;
  insert into public.room_players (room_id, user_id) values (r.id, me);
  return r;
end $$;

create or replace function public.join_room(p_code text)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms; n int;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into r from public.rooms where code = upper(trim(p_code)) and status <> 'finished' for update;
  if not found then raise exception 'no room with that code' using errcode = 'P0002'; end if;
  if exists (select 1 from public.room_players where room_id = r.id and user_id = me) then
    update public.room_players set left_at = null where room_id = r.id and user_id = me;
    return r;
  end if;
  if r.status <> 'lobby' then raise exception 'that game already started' using errcode = 'P0001'; end if;
  select count(*) into n from public.room_players where room_id = r.id and left_at is null;
  if n >= r.max_players then raise exception 'room is full' using errcode = 'P0001'; end if;
  insert into public.room_players (room_id, user_id) values (r.id, me);
  return r;
end $$;

create or replace function public.quick_match()
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select ro.* into r from public.rooms ro
   where ro.status = 'lobby' and ro.is_public and ro.created_at > now() - interval '10 minutes'
     and (select count(*) from public.room_players p where p.room_id = ro.id and p.left_at is null) < ro.max_players
   order by ro.created_at limit 1 for update skip locked;
  if found then return public.join_room(r.code); end if;
  return public.create_room(null, true, 20000);
end $$;

create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms; heir uuid;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then return; end if;
  update public.room_players set left_at = now() where room_id = p_room and user_id = me;
  if r.host_id = me and r.status <> 'finished' then
    select user_id into heir from public.room_players
     where room_id = p_room and left_at is null order by joined_at limit 1;
    if heir is null then
      update public.rooms set status = 'finished', finished_at = now() where id = p_room;
    else
      update public.rooms set host_id = heir where id = p_room;
    end if;
  end if;
end $$;

create or replace function public.start_room(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms; ids text[];
begin
  select * into r from public.rooms where id = p_room for update;
  if not found or r.host_id <> me then raise exception 'only the host can start' using errcode = '42501'; end if;
  if r.status <> 'lobby' then return r; end if;
  select array_agg(id) into ids from (
    select id from (
      select id, row_number() over (partition by category order by random()) as rn
        from public.prompt_bank
       where (r.pack_id is null and everyday) or (r.pack_id is not null and r.pack_id = any(packs))
    ) t order by rn, random() limit 7
  ) s;
  if coalesce(array_length(ids, 1), 0) < 7 then raise exception 'question bank not loaded' using errcode = 'P0001'; end if;
  update public.rooms
     set status = 'playing', prompt_ids = ids, round = 1,
         round_started_at = now() + interval '3 seconds'   -- 3-2-1 countdown
   where id = p_room returning * into r;
  return r;
end $$;

-- Closes round p_round if its time is up (or everyone answered), applies the
-- shared-answer halving, adds scores, and opens the next round after a 6 s reveal.
-- Safe to call from every client: only the first call for a round does anything.
create or replace function public.advance_round(p_room uuid, p_round int)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare r public.rooms; active int; answered int;
begin
  if not public.is_room_member(p_room) and auth.role() <> 'service_role' then
    raise exception 'not in this room' using errcode = '42501';
  end if;
  select * into r from public.rooms where id = p_room for update;
  if r.status <> 'playing' or r.round <> p_round then return r; end if;
  select count(*) into active from public.room_players where room_id = p_room and left_at is null;
  select count(*) into answered from public.room_answers a
    join public.room_players p on p.room_id = a.room_id and p.user_id = a.user_id and p.left_at is null
   where a.room_id = p_room and a.round = p_round;
  if answered < active and now() < r.round_started_at + make_interval(secs => r.timer_ms / 1000.0 + 1.5) then
    return r;  -- round still open
  end if;

  update public.room_answers a
     set shared = s.n > 1,
         points = case when s.n > 1 then ceil(a.base_points / 2.0)::int else a.base_points end
    from (select answer_name, count(*) n from public.room_answers
           where room_id = p_room and round = p_round and answer_name is not null
           group by answer_name) s
   where a.room_id = p_room and a.round = p_round and a.answer_name = s.answer_name;

  update public.room_players p set score = p.score + a.points
    from public.room_answers a
   where a.room_id = p_room and a.round = p_round and p.room_id = a.room_id and p.user_id = a.user_id;

  if p_round >= coalesce(array_length(r.prompt_ids, 1), 7) then
    update public.rooms set status = 'finished', finished_at = now(), round = p_round + 1
     where id = p_room returning * into r;
  else
    update public.rooms set round = p_round + 1, round_started_at = now() + interval '6 seconds'
     where id = p_room returning * into r;
  end if;
  return r;
end $$;

-- ───────────────────────────── leaderboards ─────────────────────────────
create or replace function public.leaderboard_daily(p_day date default (now() at time zone 'utc')::date,
                                                    p_scope text default 'all', p_limit int default 50)
returns table (rank bigint, user_id uuid, username text, avatar text, total int, depth int)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by r.total desc, r.created_at), p.id, p.username, p.avatar, r.total, r.depth
    from public.runs r join public.profiles p on p.id = r.user_id
   where r.official and r.mode = 'daily' and r.day_key = p_day
     and (p_scope <> 'friends' or r.user_id = (select auth.uid()) or r.user_id in (
          select case when f.user_id = (select auth.uid()) then f.friend_id else f.user_id end
            from public.friendships f
           where f.status = 'accepted' and (select auth.uid()) in (f.user_id, f.friend_id)))
   order by 1 limit least(greatest(p_limit, 1), 200)
$$;

create or replace function public.leaderboard_alltime(p_scope text default 'all', p_limit int default 50)
returns table (rank bigint, user_id uuid, username text, avatar text, total bigint, games bigint)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by sum(r.total) desc), p.id, p.username, p.avatar, sum(r.total), count(*)
    from public.runs r join public.profiles p on p.id = r.user_id
   where r.official and r.mode = 'daily'
     and (p_scope <> 'friends' or r.user_id = (select auth.uid()) or r.user_id in (
          select case when f.user_id = (select auth.uid()) then f.friend_id else f.user_id end
            from public.friendships f
           where f.status = 'accepted' and (select auth.uid()) in (f.user_id, f.friend_id)))
   group by p.id, p.username, p.avatar
   order by 1 limit least(greatest(p_limit, 1), 200)
$$;

-- Functions are executable by PUBLIC by default; lock that down, then open what clients need.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.create_room(text, boolean, int), public.join_room(text),
  public.quick_match(), public.leave_room(uuid), public.start_room(uuid),
  public.advance_round(uuid, int) to authenticated;
grant execute on function public.leaderboard_daily(date, text, int),
  public.leaderboard_alltime(text, int) to anon, authenticated;
grant execute on function public.is_room_member(uuid), public.room_round(uuid) to authenticated;
grant execute on all functions in schema public to service_role;

-- Realtime: lobby/scoreboard updates. RLS still filters what each client receives.
alter publication supabase_realtime add table public.rooms, public.room_players, public.room_answers;
