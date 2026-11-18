alter table public.print_jobs
  add column if not exists leased_at timestamptz,
  add column if not exists leased_by uuid;

create index if not exists print_jobs_pending_idx
  on public.print_jobs (restaurant_id, created_at)
  where printed_at is null;
