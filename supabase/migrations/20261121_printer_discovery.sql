create table if not exists public.printer_discovery (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null check (kind in ('scan', 'test')),
  ip text,
  port integer check (port is null or port between 1 and 65535),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result jsonb,
  error text,
  requested_by uuid,
  handled_by uuid references public.pos_terminals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists printer_discovery_pending_idx on public.printer_discovery (restaurant_id, status, created_at);
alter table public.printer_discovery enable row level security;
