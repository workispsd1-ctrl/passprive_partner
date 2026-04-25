-- Restore product catalogue image support on store_catalogue_items
-- (reverts the image_url removal change).

alter table public.store_catalogue_items
add column if not exists image_url text null;
