-- TASK-036: make the canonical IANA timezone part of each commerce snapshot.
-- The original RPC implementations are moved behind non-executable app_private
-- boundaries; public wrappers enrich only successful payloads in the same database
-- statement, eliminating client-side cache staleness and cross-RPC races.

begin;

alter function public.storefront_fulfillment_options_v1(text)
  set schema app_private;
alter function public.customer_order_list_v1(text, integer, timestamptz, uuid)
  set schema app_private;
alter function public.customer_order_detail_v1(text, uuid)
  set schema app_private;
alter function public.customer_order_cancel_v1(text, uuid, bigint, uuid)
  set schema app_private;

revoke all on function app_private.storefront_fulfillment_options_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_list_v1(
  text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_detail_v1(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_cancel_v1(
  text, uuid, bigint, uuid
) from public, anon, authenticated, service_role;

create or replace function app_private.storefront_payload_with_time_zone_v1(
  p_payload jsonb,
  p_time_zone text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_payload ->> 'status' <> 'ok' then
    return p_payload;
  end if;

  if p_time_zone is null
    or pg_catalog.length(p_time_zone) not between 1 and 64
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names zone
      where zone.name = p_time_zone
    ) then
    raise exception using
      errcode = '22023',
      message = 'invalid storefront time zone configuration';
  end if;

  return p_payload || pg_catalog.jsonb_build_object('timeZone', p_time_zone);
end;
$$;

revoke all on function app_private.storefront_payload_with_time_zone_v1(
  jsonb, text
) from public, anon, authenticated, service_role;

create or replace function public.storefront_fulfillment_options_v1(
  p_shop_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_time_zone text;
  v_payload jsonb;
begin
  select setting.catalog_time_zone
  into v_time_zone
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug;

  v_payload := app_private.storefront_fulfillment_options_v1(p_shop_slug);
  return app_private.storefront_payload_with_time_zone_v1(
    v_payload,
    v_time_zone
  );
end;
$$;

create or replace function public.customer_order_list_v1(
  p_shop_slug text,
  p_limit integer default 20,
  p_before_placed_at timestamptz default null,
  p_before_order_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_time_zone text;
  v_payload jsonb;
begin
  select setting.catalog_time_zone
  into v_time_zone
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug;

  v_payload := app_private.customer_order_list_v1(
    p_shop_slug,
    p_limit,
    p_before_placed_at,
    p_before_order_id
  );
  return app_private.storefront_payload_with_time_zone_v1(
    v_payload,
    v_time_zone
  );
end;
$$;

create or replace function public.customer_order_detail_v1(
  p_shop_slug text,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_time_zone text;
  v_payload jsonb;
begin
  select setting.catalog_time_zone
  into v_time_zone
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug;

  v_payload := app_private.customer_order_detail_v1(
    p_shop_slug,
    p_order_id
  );
  return app_private.storefront_payload_with_time_zone_v1(
    v_payload,
    v_time_zone
  );
end;
$$;

create or replace function public.customer_order_cancel_v1(
  p_shop_slug text,
  p_order_id uuid,
  p_expected_status_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_time_zone text;
  v_payload jsonb;
begin
  -- The row lock prevents a concurrent configuration update from crossing the
  -- mutating order snapshot assembled by the delegated cancellation function.
  select setting.catalog_time_zone
  into v_time_zone
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug
  for share;

  v_payload := app_private.customer_order_cancel_v1(
    p_shop_slug,
    p_order_id,
    p_expected_status_version,
    p_idempotency_key
  );
  return app_private.storefront_payload_with_time_zone_v1(
    v_payload,
    v_time_zone
  );
end;
$$;

revoke all on function public.storefront_fulfillment_options_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_order_list_v1(
  text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_order_detail_v1(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_order_cancel_v1(
  text, uuid, bigint, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.storefront_fulfillment_options_v1(text)
  to anon, authenticated;
grant execute on function public.customer_order_list_v1(
  text, integer, timestamptz, uuid
) to authenticated;
grant execute on function public.customer_order_detail_v1(text, uuid)
  to authenticated;
grant execute on function public.customer_order_cancel_v1(
  text, uuid, bigint, uuid
) to authenticated;

comment on function public.storefront_fulfillment_options_v1(text) is
  'Atomic Storefront fulfillment snapshot including the validated IANA timezone.';
comment on function public.customer_order_list_v1(
  text, integer, timestamptz, uuid
) is
  'Owner/shop order cards and canonical IANA timezone in one snapshot.';
comment on function public.customer_order_detail_v1(text, uuid) is
  'Owner/shop order detail and canonical IANA timezone in one snapshot.';
comment on function public.customer_order_cancel_v1(
  text, uuid, bigint, uuid
) is
  'Idempotent owner cancellation returning canonical IANA timezone atomically.';

notify pgrst, 'reload schema';

commit;
