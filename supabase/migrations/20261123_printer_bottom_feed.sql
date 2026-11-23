alter table public.restaurant_printers
  add column if not exists bottom_feed_mm integer not null default 0 check (bottom_feed_mm between 0 and 50);
alter table public.restaurant_printers drop constraint if exists restaurant_printers_bottom_feed_mm_check;
alter table public.restaurant_printers add constraint restaurant_printers_bottom_feed_mm_check check (bottom_feed_mm between 0 and 100);
