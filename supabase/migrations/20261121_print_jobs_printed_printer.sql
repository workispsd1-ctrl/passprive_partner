alter table public.print_jobs add column if not exists printed_printer_id uuid references public.restaurant_printers(id) on delete set null;
