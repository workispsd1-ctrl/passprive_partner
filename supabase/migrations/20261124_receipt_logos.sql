create table if not exists public.restaurant_receipt_logos (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  png_b64 text not null,
  raster_b64 text not null,
  width integer not null,
  height integer not null,
  updated_at timestamptz not null default now()
);
alter table public.restaurant_receipt_logos enable row level security;
