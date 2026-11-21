alter table public.restaurant_printers add column if not exists backup_printer_id uuid;
alter table public.restaurant_printers drop constraint if exists restaurant_printers_restaurant_id_id_key;
alter table public.restaurant_printers add constraint restaurant_printers_restaurant_id_id_key unique (restaurant_id, id);
alter table public.restaurant_printers drop constraint if exists restaurant_printers_backup_fk;
alter table public.restaurant_printers add constraint restaurant_printers_backup_fk
  foreign key (restaurant_id, backup_printer_id) references public.restaurant_printers (restaurant_id, id) on delete set null (backup_printer_id);
alter table public.restaurant_printers drop constraint if exists restaurant_printers_backup_not_self;
alter table public.restaurant_printers add constraint restaurant_printers_backup_not_self check (backup_printer_id is null or backup_printer_id <> id);
