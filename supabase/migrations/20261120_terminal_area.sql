alter table public.pos_terminals
  add column if not exists area_id uuid references public.restaurant_table_areas(id) on delete set null;
create index if not exists idx_pos_terminals_area_id on public.pos_terminals (area_id) where area_id is not null;
