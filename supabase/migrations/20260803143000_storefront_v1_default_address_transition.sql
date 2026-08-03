begin;

create or replace function public.customer_set_default_address_v1(
  p_address_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_address_id uuid;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_address_id is null then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 21001)
  );

  select address.id
  into v_address_id
  from public.customer_addresses address
  where address.user_id = v_user_id
    and address.id = p_address_id
  for update;

  if not found then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'not_found');
  end if;

  -- A partial unique index is immediate and cannot be deferred. Clear the
  -- previous default before promoting the selected row so the transition is
  -- independent from PostgreSQL row-update order.
  update public.customer_addresses address
  set is_default = false
  where address.user_id = v_user_id
    and address.id <> p_address_id
    and address.is_default;

  update public.customer_addresses address
  set is_default = true
  where address.user_id = v_user_id
    and address.id = p_address_id
    and not address.is_default;

  return jsonb_build_object(
    'apiVersion', 'customer.v1',
    'status', 'ok',
    'addressId', v_address_id
  );
end;
$$;

revoke all on function public.customer_set_default_address_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_set_default_address_v1(uuid)
  to authenticated;

comment on function public.customer_set_default_address_v1(uuid) is
  'Owner-only default address transition that clears the prior partial-unique row before promotion.';

notify pgrst, 'reload schema';

commit;
