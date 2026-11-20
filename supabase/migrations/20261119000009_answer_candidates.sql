-- Answers players typed that our bank didn't recognise. The answer-review Edge Function
-- asks Groq once per (question, answer) and stores the verdict; maintainers merge the good
-- ones into the bank (tools/review-candidates.mjs). Never affects scoring.
create table public.answer_candidates (
  prompt_id   text not null,
  norm        text not null check (char_length(norm) between 1 and 80),  -- normalised input
  sample      text not null check (char_length(sample) <= 80),           -- one raw spelling
  hits        int not null default 1,
  verdict     jsonb,              -- { valid, name, aliases, familiarity, reason, model }
  status      text not null default 'pending' check (status in ('pending','valid','invalid','merged','dismissed')),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (prompt_id, norm)
);
create index answer_candidates_status on public.answer_candidates (status, hits desc);
alter table public.answer_candidates enable row level security;   -- no policies: service_role only
revoke all on public.answer_candidates from anon, authenticated;
grant all on public.answer_candidates to service_role;
