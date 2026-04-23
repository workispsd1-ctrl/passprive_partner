-- Add partner-managed Top Items sidebar field to stores

alter table public.stores
add column if not exists top_items text[] not null default '{}'::text[];
