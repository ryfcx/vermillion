-- v4: friends compare today's answers, delete-my-account, 25-second rooms.

-- Friends' official Daily results for a day. Scores are always visible to friends;
-- the 7 answers are only included once the caller has finished that same Daily (no spoilers).
create or replace function public.friends_daily(p_day date default (now() at time zone 'utc')::date)
returns table (user_id uuid, username text, avatar text, total int, depth int, answers jsonb, played_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  played as (
    select exists (select 1 from public.runs r, me
                    where r.user_id = me.id and r.official and r.mode = 'daily' and r.day_key = p_day) as yes
  ),
  friends as (
    select case when f.user_id = me.id then f.friend_id else f.user_id end as id
      from public.friendships f, me
     where f.status = 'accepted' and me.id in (f.user_id, f.friend_id)
  )
  select p.id, p.username, p.avatar, r.total, r.depth,
         case when (select yes from played) then r.answers else null end,
         r.created_at
    from friends fr
    join public.profiles p on p.id = fr.id
    left join public.runs r on r.user_id = fr.id and r.official and r.mode = 'daily' and r.day_key = p_day
   order by r.total desc nulls last, p.username
$$;

-- Permanently deletes the caller's account and everything attached to it (cascades).
create or replace function public.delete_me()
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  delete from auth.users where id = me;
end $$;

-- Rooms now default to 25-second questions, matching the solo game.
create or replace function public.create_room(p_pack text default null, p_public boolean default false,
                                              p_timer_ms int default 25000)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  insert into public.rooms (code, host_id, is_public, pack_id, timer_ms)
  values (private.new_room_code(), me, p_public, p_pack, p_timer_ms) returning * into r;
  insert into public.room_players (room_id, user_id) values (r.id, me);
  return r;
end $$;
alter table public.rooms alter column timer_ms set default 25000;

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
  return public.create_room(null, true, 25000);
end $$;

revoke execute on function public.friends_daily(date), public.delete_me() from public, anon;
grant execute on function public.friends_daily(date), public.delete_me() to authenticated;
