drop index if exists public.pos_payment_requests_one_pending;
create index if not exists pos_payment_requests_order_pending
  on public.pos_payment_requests (order_id) where status = 'pending';
