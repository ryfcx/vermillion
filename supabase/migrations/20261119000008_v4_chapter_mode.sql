-- v4: chapter runs (unofficial, scored like topic practice).
alter table public.runs drop constraint runs_mode_check;
alter table public.runs add constraint runs_mode_check check (mode in ('daily','endless','duel','pack','chapter'));
