-- Storefront v1 / TASK-025 correction
--
-- A reservation is eligible only when the shop and the public publication
-- explicitly enable that fulfillment mode. The authoritative inventory lock,
-- idempotency ledger and response allow-list remain unchanged.

begin;

create or replace function public.customer_reservation_hold_create_v1(
  p_shop_slug text,
  p_publication_id uuid,
  p_quantity integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_now timestamptz := statement_timestamp();
  v_request_sha256 text;
  v_previous public.customer_reservation_hold_mutations%rowtype;
  v_product public.inventory_products%rowtype;
  v_existing public.customer_reservation_holds%rowtype;
  v_hold_id uuid;
  v_reserved numeric;
  v_active_count integer;
  v_result jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_publication_id is null
    or p_quantity is null
    or p_quantity not between 1 and 99
    or p_idempotency_key is null then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'invalid',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  if v_shop_id is null then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'unavailable',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      'create',
      p_shop_slug,
      p_publication_id,
      p_quantity
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'storefront-hold-owner:' || v_user_id::text || ':' || v_shop_id::text,
    25025
  ));

  select mutation.* into v_previous
  from public.customer_reservation_hold_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create'
      or v_previous.request_sha256 <> v_request_sha256 then
      return pg_catalog.jsonb_build_object(
        'apiVersion', 'customer-reservation-hold.v1',
        'status', 'idempotency_conflict',
        'idempotent', false,
        'serverTime', v_now
      );
    end if;
    return pg_catalog.jsonb_set(
      v_previous.response_payload,
      '{idempotent}',
      'true'::jsonb,
      true
    );
  end if;

  select product.* into v_product
  from public.storefront_product_publications publication
  join public.storefront_settings setting
    on setting.shop_id = publication.shop_id
  join public.inventory_products product
    on product.id = publication.source_product_id
  where publication.shop_id = v_shop_id
    and publication.id = p_publication_id
    and publication.publication_status = 'published'
    and publication.published_at is not null
    and setting.storefront_enabled
    and setting.reservation_enabled
    and publication.reservation_enabled
    and product.deleted_at is null
    and app_private.storefront_product_matches_shop_v1(product.id, v_shop_id)
  for update of product;

  if not found then
    v_result := pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'unavailable',
      'idempotent', false,
      'serverTime', v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  update public.customer_reservation_holds hold
  set status = 'expired',
      terminal_at = v_now,
      updated_at = v_now
  where hold.user_id = v_user_id
    and hold.shop_id = v_shop_id
    and hold.publication_id = p_publication_id
    and hold.status = 'active'
    and hold.expires_at <= v_now;

  select hold.* into v_existing
  from public.customer_reservation_holds hold
  where hold.user_id = v_user_id
    and hold.shop_id = v_shop_id
    and hold.publication_id = p_publication_id
    and hold.status = 'active'
    and hold.expires_at > v_now
  for update;
  if found then
    v_result := app_private.customer_reservation_hold_payload_v1(
      v_existing.id,
      'active_hold_exists',
      false,
      v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, hold_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, v_existing.id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  select count(*)::integer into v_active_count
  from public.customer_reservation_holds hold
  where hold.user_id = v_user_id
    and hold.shop_id = v_shop_id
    and hold.status = 'active'
    and hold.expires_at > v_now;
  if v_active_count >= 25 then
    v_result := pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'hold_limit_reached',
      'idempotent', false,
      'serverTime', v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  v_reserved := app_private.storefront_reservation_active_quantity_v1(
    v_product.id,
    v_now
  );
  if v_product.stock_quantity is null
    or v_product.stock_quantity in (
      'Infinity'::double precision,
      '-Infinity'::double precision,
      'NaN'::double precision
    )
    or v_product.stock_quantity - v_reserved::double precision < p_quantity then
    v_result := pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'unavailable',
      'idempotent', false,
      'serverTime', v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  insert into public.customer_reservation_holds(
    user_id,
    shop_id,
    publication_id,
    source_product_id,
    quantity,
    status,
    expires_at,
    create_idempotency_key,
    create_request_sha256,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_shop_id,
    p_publication_id,
    v_product.id,
    p_quantity,
    'active',
    v_now + interval '15 minutes',
    p_idempotency_key,
    v_request_sha256,
    v_now,
    v_now
  ) returning id into v_hold_id;

  v_result := app_private.customer_reservation_hold_payload_v1(
    v_hold_id,
    'ok',
    false,
    v_now
  );
  insert into public.customer_reservation_hold_mutations(
    user_id, shop_id, hold_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_shop_id, v_hold_id, p_idempotency_key, 'create',
    v_request_sha256, v_result
  );

  perform app_private.storefront_reservation_refresh_availability_v1(
    v_product.id,
    v_now
  );
  return v_result;
end;
$$;

comment on function public.customer_reservation_hold_create_v1(
  text, uuid, integer, uuid
) is
  'Atomically reserves eligible private available-to-promise capacity without exposing exact inventory.';

notify pgrst, 'reload schema';

commit;
