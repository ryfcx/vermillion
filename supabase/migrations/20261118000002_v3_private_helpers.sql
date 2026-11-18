-- Move internal helpers out of the exposed API schema (advisor lint 0029).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter function public.is_room_member(uuid) set schema private;
alter function public.room_round(uuid) set schema private;
alter function public.new_room_code() set schema private;
alter function public.handle_new_user() set schema private;

create or replace function public.create_room(p_pack text default null, p_public boolean default false,
                                              p_timer_ms int default 20000)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  insert into public.rooms (code, host_id, is_public, pack_id, timer_ms)
  values (private.new_room_code(), me, p_public, p_pack, p_timer_ms) returning * into r;
  insert into public.room_players (room_id, user_id) values (r.id, me);
  return r;
end $$;

create or replace function public.advance_round(p_room uuid, p_round int)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare r public.rooms; active int; answered int;
begin
  if not private.is_room_member(p_room) and auth.role() <> 'service_role' then
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

drop policy rooms_read on public.rooms;
drop policy room_players_read on public.room_players;
drop policy room_answers_read on public.room_answers;
create policy rooms_read on public.rooms for select to authenticated using (private.is_room_member(id));
create policy room_players_read on public.room_players for select to authenticated using (private.is_room_member(room_id));
create policy room_answers_read on public.room_answers for select to authenticated
  using (private.is_room_member(room_id) and (
    user_id = (select auth.uid())
    or exists (select 1 from private.room_round(room_id) rr where rr.round > room_answers.round or rr.status = 'finished')));
revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_room_member(uuid), private.room_round(uuid) to authenticated;
grant execute on all functions in schema private to service_role;
