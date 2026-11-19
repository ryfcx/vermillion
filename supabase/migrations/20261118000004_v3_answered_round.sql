-- Lets the live scoreboard show a ✓ for players who have answered this round,
-- without revealing *what* they answered (room_answers stays hidden until the round closes).
alter table public.room_players add column answered_round int not null default 0;

create or replace function private.mark_answered()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.room_players set answered_round = new.round
   where room_id = new.room_id and user_id = new.user_id;
  return new;
end $$;
revoke execute on function private.mark_answered() from public, anon, authenticated;

create trigger room_answers_mark_answered
  after insert on public.room_answers for each row execute function private.mark_answered();
