create or replace function public.till_member(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_topic ~ '^till:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from restaurants r
      where r.id = substring(p_topic from 6)::uuid
        and (
          r.owner_user_id = auth.uid()
          or exists (select 1 from restaurant_staff s where s.restaurant_id = r.id and s.user_id = auth.uid())
          or exists (select 1 from pos_terminals t where t.restaurant_id = r.id and t.auth_user_id = auth.uid() and t.status = 'active')
        )
    );
$$;

revoke all on function public.till_member(text) from public, anon;
grant execute on function public.till_member(text) to authenticated;

drop policy if exists "till members receive nudges" on realtime.messages;
create policy "till members receive nudges"
  on realtime.messages
  for select
  to authenticated
  using (realtime.messages.extension = 'broadcast' and public.till_member(realtime.topic()));

create or replace function public.till_nudge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  rid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  if rid is not null then
    begin
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'change', 'till:' || rid::text, true);
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.till_nudge() from public, anon, authenticated;

drop trigger if exists till_nudge on public.print_jobs;
create trigger till_nudge after insert on public.print_jobs
  for each row execute function public.till_nudge();

drop trigger if exists till_nudge on public.restaurant_table_bookings;
create trigger till_nudge after insert or update or delete on public.restaurant_table_bookings
  for each row execute function public.till_nudge();

drop trigger if exists till_nudge on public.pos_payment_requests;
create trigger till_nudge after insert or update or delete on public.pos_payment_requests
  for each row execute function public.till_nudge();

drop trigger if exists till_nudge on public.restaurant_bookings;
create trigger till_nudge after insert or update or delete on public.restaurant_bookings
  for each row execute function public.till_nudge();

drop trigger if exists till_nudge on public.restaurant_orders;
create trigger till_nudge after insert or update or delete on public.restaurant_orders
  for each row execute function public.till_nudge();

drop trigger if exists till_nudge on public.restaurant_table_layouts;
create trigger till_nudge after insert or update or delete on public.restaurant_table_layouts
  for each row execute function public.till_nudge();
