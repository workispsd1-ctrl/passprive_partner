create table if not exists public.app_error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  app text not null check (app in ('partner', 'pos')),
  app_version text check (char_length(app_version) <= 40),
  platform text check (char_length(platform) <= 20),
  device text check (char_length(device) <= 120),
  restaurant_id uuid,
  screen text check (char_length(screen) <= 80),
  source text check (char_length(source) <= 80),
  fatal boolean not null default false,
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 4000),
  context jsonb check (pg_column_size(context) <= 4000)
);

create index if not exists app_error_logs_created_idx on public.app_error_logs (created_at desc);
create index if not exists app_error_logs_restaurant_idx on public.app_error_logs (restaurant_id, created_at desc);

alter table public.app_error_logs enable row level security;

drop policy if exists "devices report their own errors" on public.app_error_logs;
create policy "devices report their own errors"
  on public.app_error_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

revoke all on public.app_error_logs from anon;
grant insert on public.app_error_logs to authenticated;
