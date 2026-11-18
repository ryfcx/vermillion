-- Hash of the seed key used by the admin-seed function (the key itself stays in the gitignored .seed-secret).
create table public.admin_keys (
  name text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.admin_keys enable row level security;  -- no policies: service_role only
revoke all on public.admin_keys from anon, authenticated;
grant all on public.admin_keys to service_role;
-- To rotate: openssl rand -hex 24 > .seed-secret, then upsert sha256 of its contents:
-- insert into public.admin_keys (name, sha256) values ('seed', '<sha256>') on conflict (name) do update set sha256 = excluded.sha256;
