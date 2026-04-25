-- Service item rows for service-type stores (simple service details).
create table if not exists public.store_service_items (
  id uuid not null default gen_random_uuid(),
  store_id uuid not null,
  service_id uuid null,
  title text not null,
  description text null,
  price numeric(12,2) not null default 0,
  currency_code character varying(3) not null default 'MUR'::character varying,
  duration_minutes integer null,
  service_for text null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint store_service_items_pkey primary key (id),
  constraint store_service_items_store_id_fkey foreign key (store_id) references public.stores (id) on delete cascade,
  constraint store_service_items_service_id_fkey foreign key (service_id) references public.store_services (id) on delete set null,
  constraint store_service_items_price_chk check (price >= (0)::numeric),
  constraint store_service_items_duration_chk check ((duration_minutes is null) or (duration_minutes > 0)),
  constraint store_service_items_sort_order_chk check (sort_order >= 0),
  constraint store_service_items_service_for_chk check ((service_for is null) or (service_for = any (array['MEN'::text, 'WOMEN'::text, 'UNISEX'::text]))),
  constraint store_service_items_title_chk check ((length(trim(both from title)) > 0))
) tablespace pg_default;

create index if not exists store_service_items_store_idx
  on public.store_service_items using btree (store_id) tablespace pg_default;

create index if not exists store_service_items_store_active_sort_idx
  on public.store_service_items using btree (store_id, is_active, sort_order, created_at) tablespace pg_default;

create index if not exists store_service_items_service_idx
  on public.store_service_items using btree (service_id) tablespace pg_default;

create trigger trg_store_service_items_set_updated_at
before update on public.store_service_items
for each row
execute function set_updated_at();
