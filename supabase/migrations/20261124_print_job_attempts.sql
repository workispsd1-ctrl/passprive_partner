alter table public.print_jobs add column if not exists attempts integer not null default 0;
alter table public.print_jobs add column if not exists failed_at timestamptz;
alter table public.print_jobs add column if not exists last_error text;
create index if not exists print_jobs_order_idx on public.print_jobs (restaurant_id, order_id, created_at desc);
