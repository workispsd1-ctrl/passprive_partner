alter table public.restaurant_printers
  add column if not exists bottom_feed_mm integer not null default 0 check (bottom_feed_mm between 0 and 50);
