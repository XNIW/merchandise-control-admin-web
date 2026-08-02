-- Storefront v1 / TASK-023 contract bridge
--
-- The public client is configured with the stable Storefront slug, not an
-- internal shop UUID. Preserve the already-applied cart engine as private
-- primitives and expose the same four RPC names through a slug-only boundary.

begin;

revoke all on function public.customer_cart_read_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_cart_mutate_v1(
  uuid, text, uuid, integer, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_cart_merge_guest_v1(
  uuid, jsonb, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_cart_revalidate_v1(uuid, bigint, uuid)
  from public, anon, authenticated, service_role;

alter function public.customer_cart_read_v1(uuid)
  set schema app_private;
alter function public.customer_cart_mutate_v1(
  uuid, text, uuid, integer, bigint, uuid
) set schema app_private;
alter function public.customer_cart_merge_guest_v1(
  uuid, jsonb, bigint, uuid
) set schema app_private;
alter function public.customer_cart_revalidate_v1(uuid, bigint, uuid)
  set schema app_private;

revoke all on function app_private.customer_cart_read_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_cart_mutate_v1(
  uuid, text, uuid, integer, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_cart_merge_guest_v1(
  uuid, jsonb, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_cart_revalidate_v1(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;

create or replace function app_private.customer_cart_shop_id_v1(
  p_shop_slug text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select setting.shop_id
  from public.storefront_settings setting
  where p_shop_slug is not null
    and p_shop_slug = lower(btrim(p_shop_slug))
    and p_shop_slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'
    and setting.public_slug = p_shop_slug
    and setting.storefront_enabled
  limit 1
$$;

create or replace function app_private.customer_cart_public_payload_v1(
  p_payload jsonb,
  p_shop_slug text
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_payload) = 'object'
      and (p_payload ? 'shopId' or p_payload ? 'cartId')
    then (p_payload - 'shopId' - 'cartId')
      || jsonb_build_object('shopSlug', p_shop_slug)
    else p_payload
  end
$$;

revoke all on function app_private.customer_cart_shop_id_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_cart_public_payload_v1(jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function public.customer_cart_read_v1(p_shop_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_result jsonb;
begin
  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  v_result := app_private.customer_cart_read_v1(v_shop_id);
  return app_private.customer_cart_public_payload_v1(v_result, p_shop_slug);
end;
$$;

create or replace function public.customer_cart_mutate_v1(
  p_shop_slug text,
  p_operation text,
  p_publication_id uuid,
  p_quantity integer,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_result jsonb;
begin
  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  v_result := app_private.customer_cart_mutate_v1(
    v_shop_id,
    p_operation,
    p_publication_id,
    p_quantity,
    p_expected_version,
    p_idempotency_key
  );
  return app_private.customer_cart_public_payload_v1(v_result, p_shop_slug);
end;
$$;

create or replace function public.customer_cart_merge_guest_v1(
  p_shop_slug text,
  p_guest_items jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_result jsonb;
begin
  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  v_result := app_private.customer_cart_merge_guest_v1(
    v_shop_id,
    p_guest_items,
    p_expected_version,
    p_idempotency_key
  );
  return app_private.customer_cart_public_payload_v1(v_result, p_shop_slug);
end;
$$;

create or replace function public.customer_cart_revalidate_v1(
  p_shop_slug text,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_result jsonb;
begin
  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  v_result := app_private.customer_cart_revalidate_v1(
    v_shop_id,
    p_expected_version,
    p_idempotency_key
  );
  return app_private.customer_cart_public_payload_v1(v_result, p_shop_slug);
end;
$$;

revoke all on function public.customer_cart_read_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_cart_mutate_v1(
  text, text, uuid, integer, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_cart_merge_guest_v1(
  text, jsonb, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_cart_revalidate_v1(text, bigint, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_cart_read_v1(text)
  to authenticated;
grant execute on function public.customer_cart_mutate_v1(
  text, text, uuid, integer, bigint, uuid
) to authenticated;
grant execute on function public.customer_cart_merge_guest_v1(
  text, jsonb, bigint, uuid
) to authenticated;
grant execute on function public.customer_cart_revalidate_v1(text, bigint, uuid)
  to authenticated;

comment on function public.customer_cart_read_v1(text) is
  'Owner-only cart read resolved from a public Storefront slug; internal cart/shop UUIDs are omitted.';
comment on function public.customer_cart_mutate_v1(
  text, text, uuid, integer, bigint, uuid
) is
  'Idempotent optimistic cart mutation using public Storefront and publication identifiers only.';
comment on function public.customer_cart_merge_guest_v1(
  text, jsonb, bigint, uuid
) is
  'Bounded max-quantity guest/account merge using a public Storefront slug.';
comment on function public.customer_cart_revalidate_v1(text, bigint, uuid) is
  'Server-side price/promotion revalidation using a public Storefront slug and no client total.';

notify pgrst, 'reload schema';

commit;
