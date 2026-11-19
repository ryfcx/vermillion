-- Daily selection depends on file order, so the server keeps it (seeded by admin-seed, read by submit-run).
alter table public.prompt_bank add column ord int not null default 0;
create index prompt_bank_ord on public.prompt_bank (ord);
