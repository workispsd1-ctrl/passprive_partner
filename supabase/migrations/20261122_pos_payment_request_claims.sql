alter table public.pos_payment_requests
  add column if not exists claimed_by uuid references public.pos_terminals(id) on delete set null,
  add column if not exists claimed_at timestamptz;
