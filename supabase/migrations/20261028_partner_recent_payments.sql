create or replace function public.partner_recent_payments(
  p_restaurant_id uuid default null,
  p_since timestamptz default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  paid_at timestamptz,
  amount numeric,
  bill_amount numeric,
  currency text,
  payment_context text,
  is_order boolean,
  reference text,
  customer text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ps.id,
    ps.restaurant_id,
    r.name,
    coalesce(ps.verified_at, ps.updated_at),
    ps.amount_major,
    coalesce(ps.original_amount, ps.amount_major),
    coalesce(ps.currency_code, 'MUR'),
    upper(ps.payment_context),
    coalesce(ps.gateway_payload ? 'order_payload', false),
    coalesce(ps.tracking_id, ps.merchant_trace),
    case
      when nullif(btrim(u.full_name), '') is null then null
      else initcap(split_part(btrim(u.full_name), ' ', 1))
        || coalesce(
          ' ' || upper(left(nullif(regexp_replace(btrim(u.full_name), '^.*\s', ''), split_part(btrim(u.full_name), ' ', 1)), 1)) || '.',
          ''
        )
    end
  from public.payment_sessions ps
  join public.restaurants r on r.id = ps.restaurant_id
  left join public.users u on u.id = ps.user_id
  where auth.uid() is not null
    and ps.restaurant_id is not null
    and (p_restaurant_id is null or ps.restaurant_id = p_restaurant_id)
    and public.can_manage_restaurant(ps.restaurant_id)
    and upper(ps.status) in ('FINALIZED', 'VERIFIED_SUCCESS')
    and upper(ps.payment_context) in ('BILL_PAYMENT', 'TABLE_ORDERS')
    and (p_since is null or coalesce(ps.verified_at, ps.updated_at) > p_since)
  order by coalesce(ps.verified_at, ps.updated_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke all on function public.partner_recent_payments(uuid, timestamptz, integer) from public, anon;
grant execute on function public.partner_recent_payments(uuid, timestamptz, integer) to authenticated;
