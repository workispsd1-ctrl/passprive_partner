alter table public.printer_discovery add column if not exists networks text[] not null default '{}';
alter table public.printer_discovery drop constraint if exists printer_discovery_networks_limit;
alter table public.printer_discovery add constraint printer_discovery_networks_limit check (cardinality(networks) <= 3);
