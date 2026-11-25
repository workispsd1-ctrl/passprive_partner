alter table public.pos_payment_requests add column if not exists target_terminal_id uuid references public.pos_terminals(id) on delete set null;
alter table public.pos_terminals add column if not exists last_seen_at timestamptz;
create index if not exists pos_payment_requests_target_idx on public.pos_payment_requests (restaurant_id, target_terminal_id) where status = 'pending';
comment on column public.pos_payment_requests.target_terminal_id is 'POS terminal chosen to take this payment; null = any POS.';
comment on column public.pos_terminals.last_seen_at is 'Last time this POS polled the till API (online indicator).';
