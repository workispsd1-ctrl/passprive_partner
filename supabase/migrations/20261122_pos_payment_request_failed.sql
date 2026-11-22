alter table public.pos_payment_requests drop constraint if exists pos_payment_requests_status_check;
alter table public.pos_payment_requests
  add constraint pos_payment_requests_status_check
  check (status = any (array['pending','paid','cancelled','declined','failed']));
