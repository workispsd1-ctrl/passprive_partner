alter table public.pos_payment_requests alter column method drop not null;
alter table public.pos_payment_requests drop constraint if exists pos_payment_requests_method_check;
alter table public.pos_payment_requests add constraint pos_payment_requests_method_check
  check (method is null or method = any (array['CARD','MAUCAS']));
