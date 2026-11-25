alter table public.print_jobs add column if not exists dismissed_at timestamptz;
alter table public.print_jobs add column if not exists dismissed_by text;
create index if not exists print_jobs_stuck_idx on public.print_jobs (restaurant_id, created_at) where printed_at is null and dismissed_at is null;
comment on column public.print_jobs.dismissed_at is 'Staff marked this unprinted job as handled (reprinted elsewhere or not needed).';
