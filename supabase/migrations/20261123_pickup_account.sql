alter table public.restaurant_orders
  add column if not exists account_id uuid references public.customer_accounts(id) on delete restrict;
create index if not exists restaurant_orders_account_idx on public.restaurant_orders (account_id) where account_id is not null;
