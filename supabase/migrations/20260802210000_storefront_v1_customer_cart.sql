-- Storefront v1 / TASK-023
--
-- Owner-scoped persistent cart with optimistic versions, bounded idempotency and
-- server-side price revalidation. Client prices and totals are never accepted as
-- authoritative input.

begin;

create table public.customer_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  cart_version bigint not null default 0,
  last_revalidated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_carts_owner_shop_unique unique (user_id, shop_id),
  constraint customer_carts_owner_shop_id_unique unique (user_id, shop_id, id),
  constraint customer_carts_version_check check (cart_version >= 0)
);

create table public.customer_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null,
  user_id uuid not null,
  shop_id uuid not null,
  publication_id uuid not null,
  quantity integer not null,
  snapshot_public_name text not null,
  snapshot_price_clp bigint not null,
  snapshot_compare_at_price_clp bigint,
  snapshot_promotion_id uuid,
  snapshot_promotion_ends_at timestamptz,
  snapshot_image_url text,
  snapshot_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_cart_items_cart_publication_unique unique (
    cart_id,
    publication_id
  ),
  constraint customer_cart_items_cart_owner_fkey foreign key (
    user_id,
    shop_id,
    cart_id
  ) references public.customer_carts(user_id, shop_id, id) on delete cascade,
  constraint customer_cart_items_quantity_check check (quantity between 1 and 99),
  constraint customer_cart_items_name_check check (
    length(btrim(snapshot_public_name)) between 1 and 200
  ),
  constraint customer_cart_items_price_check check (
    snapshot_price_clp between 0 and 999999999999
    and (
      snapshot_compare_at_price_clp is null
      or snapshot_compare_at_price_clp between snapshot_price_clp and 999999999999
    )
  ),
  constraint customer_cart_items_image_check check (
    snapshot_image_url is null
    or (
      snapshot_image_url ~ '^https://[^[:space:]]+$'
      and snapshot_image_url !~* '/object/sign/'
      and snapshot_image_url !~* '[?&](token|signature)='
    )
  )
);

create table public.customer_cart_mutations (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null,
  user_id uuid not null,
  shop_id uuid not null,
  idempotency_key uuid not null,
  operation text not null,
  request_hash bytea not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '7 days',
  constraint customer_cart_mutations_owner_key_unique unique (
    user_id,
    shop_id,
    idempotency_key
  ),
  constraint customer_cart_mutations_cart_owner_fkey foreign key (
    user_id,
    shop_id,
    cart_id
  ) references public.customer_carts(user_id, shop_id, id) on delete cascade,
  constraint customer_cart_mutations_operation_check check (
    operation in ('set', 'remove', 'clear', 'merge', 'revalidate')
  ),
  constraint customer_cart_mutations_hash_check check (
    octet_length(request_hash) = 32
  ),
  constraint customer_cart_mutations_response_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 131072
  ),
  constraint customer_cart_mutations_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '8 days'
  )
);

create index customer_cart_items_owner_shop_updated_idx
  on public.customer_cart_items(user_id, shop_id, updated_at desc, id);
create index customer_cart_mutations_expiry_idx
  on public.customer_cart_mutations(expires_at, id);

create trigger customer_carts_touch_updated_at
  before update on public.customer_carts
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_cart_items_touch_updated_at
  before update on public.customer_cart_items
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_carts enable row level security;
alter table public.customer_carts force row level security;
alter table public.customer_cart_items enable row level security;
alter table public.customer_cart_items force row level security;
alter table public.customer_cart_mutations enable row level security;
alter table public.customer_cart_mutations force row level security;

create policy customer_carts_select_owner
  on public.customer_carts for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_carts_insert_owner
  on public.customer_carts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_carts_update_owner
  on public.customer_carts for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_carts_delete_owner
  on public.customer_carts for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

create policy customer_cart_items_select_owner
  on public.customer_cart_items for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_cart_items_insert_owner
  on public.customer_cart_items for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_cart_items_update_owner
  on public.customer_cart_items for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_cart_items_delete_owner
  on public.customer_cart_items for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

create policy customer_cart_mutations_select_owner
  on public.customer_cart_mutations for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_cart_mutations_insert_owner
  on public.customer_cart_mutations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_cart_mutations_update_owner
  on public.customer_cart_mutations for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_cart_mutations_delete_owner
  on public.customer_cart_mutations for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

revoke all on table public.customer_carts
  from public, anon, authenticated;
revoke all on table public.customer_cart_items
  from public, anon, authenticated;
revoke all on table public.customer_cart_mutations
  from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_carts
  to service_role;
grant select, insert, update, delete on table public.customer_cart_items
  to service_role;
grant select, insert, update, delete on table public.customer_cart_mutations
  to service_role;

create or replace function app_private.customer_cart_payload_v1(
  p_cart_id uuid,
  p_status text,
  p_idempotent boolean,
  p_quote_status text,
  p_quoted_at timestamptz default null,
  p_quote_expires_at timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cart_row as (
    select cart.*
    from public.customer_carts cart
    where cart.id = p_cart_id
  ),
  resolved as (
    select
      item.id,
      item.publication_id,
      item.quantity,
      item.snapshot_public_name,
      item.snapshot_price_clp,
      item.snapshot_compare_at_price_clp,
      item.snapshot_promotion_id,
      item.snapshot_image_url,
      source.public_name,
      source.price_clp,
      source.compare_at_price_clp,
      source.promotion_id,
      source.promotion_name,
      source.promotion_ends_at,
      source.image_thumb_url,
      source.availability_mode,
      source.storefront_enabled,
      case
        when source.publication_id is null
          or not coalesce(source.storefront_enabled, false)
          or source.availability_mode = 'unavailable'
          then 'unavailable'
        else 'available'
      end as line_status,
      case
        when source.publication_id is null
          or not coalesce(source.storefront_enabled, false)
          or source.availability_mode = 'unavailable'
          then 'unavailable'
        when item.snapshot_price_clp <> source.price_clp
          then 'price_changed'
        when item.snapshot_promotion_id is distinct from source.promotion_id
          then 'promotion_changed'
        else 'none'
      end as change_type
    from cart_row cart
    join public.customer_cart_items item on item.cart_id = cart.id
    left join lateral app_private.storefront_catalog_source_v1(
      item.publication_id,
      cart.shop_id,
      statement_timestamp()
    ) source on true
  ),
  line_payload as (
    select
      resolved.*,
      jsonb_build_object(
        'publicationId', resolved.publication_id,
        'quantity', resolved.quantity,
        'publicName', coalesce(resolved.public_name, resolved.snapshot_public_name),
        'imageUrl', coalesce(resolved.image_thumb_url, resolved.snapshot_image_url),
        'status', resolved.line_status,
        'availabilityMode', coalesce(resolved.availability_mode, 'unavailable'),
        'snapshotPriceClp', resolved.snapshot_price_clp,
        'priceClp', case when resolved.line_status = 'available'
          then resolved.price_clp else null end,
        'compareAtPriceClp', case when resolved.line_status = 'available'
          then resolved.compare_at_price_clp else null end,
        'promotionId', case when resolved.line_status = 'available'
          then resolved.promotion_id else null end,
        'promotionName', case when resolved.line_status = 'available'
          then resolved.promotion_name else null end,
        'promotionEndsAt', case when resolved.line_status = 'available'
          then resolved.promotion_ends_at else null end,
        'changeType', resolved.change_type
      ) as payload
    from resolved
  )
  select jsonb_build_object(
    'apiVersion', 'customer-cart.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'cartId', cart.id,
    'shopId', cart.shop_id,
    'cartVersion', cart.cart_version,
    'currencyCode', 'CLP',
    'quoteStatus', p_quote_status,
    'quotedAt', p_quoted_at,
    'quoteExpiresAt', p_quote_expires_at,
    'requiresCustomerReview', coalesce((
      select bool_or(line.change_type <> 'none') from line_payload line
    ), false),
    'itemCount', (select count(*)::integer from line_payload),
    'totalQuantity', coalesce((
      select sum(line.quantity)::bigint from line_payload line
    ), 0::bigint),
    'unavailableItemCount', (
      select count(*)::integer from line_payload line
      where line.line_status = 'unavailable'
    ),
    'subtotalClp', coalesce((
      select sum(line.price_clp * line.quantity)::bigint
      from line_payload line
      where line.line_status = 'available'
    ), 0::bigint),
    'items', coalesce((
      select jsonb_agg(line.payload order by line.id) from line_payload line
    ), '[]'::jsonb)
  )
  from cart_row cart;
$$;

revoke all on function app_private.customer_cart_payload_v1(
  uuid,
  text,
  boolean,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.customer_cart_read_v1(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_result jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_id is null then
    return jsonb_build_object(
      'apiVersion', 'customer-cart.v1',
      'status', 'invalid'
    );
  end if;

  select cart.id into v_cart_id
  from public.customer_carts cart
  where cart.user_id = v_user_id and cart.shop_id = p_shop_id;

  if v_cart_id is null then
    return jsonb_build_object(
      'apiVersion', 'customer-cart.v1',
      'status', 'ok',
      'idempotent', true,
      'cartId', null,
      'shopId', p_shop_id,
      'cartVersion', 0,
      'currencyCode', 'CLP',
      'quoteStatus', 'indicative',
      'quotedAt', null,
      'quoteExpiresAt', null,
      'requiresCustomerReview', false,
      'itemCount', 0,
      'totalQuantity', 0,
      'unavailableItemCount', 0,
      'subtotalClp', 0,
      'items', '[]'::jsonb
    );
  end if;

  v_result := app_private.customer_cart_payload_v1(
    v_cart_id,
    'ok',
    true,
    'indicative',
    null,
    null
  );
  return v_result;
end;
$$;

create or replace function public.customer_cart_mutate_v1(
  p_shop_id uuid,
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
  v_user_id uuid := auth.uid();
  v_cart public.customer_carts%rowtype;
  v_previous public.customer_cart_mutations%rowtype;
  v_source record;
  v_request_hash bytea;
  v_result jsonb;
  v_now timestamptz := statement_timestamp();
  v_item_count integer;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_id is null
    or p_operation is null
    or p_operation not in ('set', 'remove', 'clear')
    or p_expected_version is null
    or p_expected_version < 0
    or p_idempotency_key is null
    or (p_operation in ('set', 'remove') and p_publication_id is null)
    or (p_operation = 'set' and (p_quantity is null or p_quantity not between 1 and 99))
    or (p_operation <> 'set' and p_quantity is not null)
    or (p_operation = 'clear' and p_publication_id is not null) then
    return jsonb_build_object(
      'apiVersion', 'customer-cart.v1',
      'status', 'invalid'
    );
  end if;

  v_request_hash := extensions.digest(
    pg_catalog.concat_ws(
      E'\x1f',
      p_shop_id::text,
      p_operation,
      coalesce(p_publication_id::text, ''),
      coalesce(p_quantity::text, ''),
      p_expected_version::text
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-cart:' || v_user_id::text || ':' || p_shop_id::text,
    23023
  ));

  insert into public.customer_carts(user_id, shop_id)
  values (v_user_id, p_shop_id)
  on conflict (user_id, shop_id) do nothing;

  select cart.* into v_cart
  from public.customer_carts cart
  where cart.user_id = v_user_id and cart.shop_id = p_shop_id
  for update;

  delete from public.customer_cart_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = p_shop_id
    and mutation.expires_at <= v_now;

  select mutation.* into v_previous
  from public.customer_cart_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> p_operation
      or v_previous.request_hash <> v_request_hash then
      return jsonb_build_object(
        'apiVersion', 'customer-cart.v1',
        'status', 'idempotency_conflict'
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  if v_cart.cart_version <> p_expected_version then
    v_result := app_private.customer_cart_payload_v1(
      v_cart.id,
      'version_conflict',
      false,
      'indicative',
      null,
      null
    );
    insert into public.customer_cart_mutations(
      cart_id, user_id, shop_id, idempotency_key, operation,
      request_hash, response_payload
    ) values (
      v_cart.id, v_user_id, p_shop_id, p_idempotency_key, p_operation,
      v_request_hash, v_result
    );
    return v_result;
  end if;

  if p_operation = 'set' then
    select source.* into v_source
    from app_private.storefront_catalog_source_v1(
      p_publication_id,
      p_shop_id,
      v_now
    ) source
    where source.storefront_enabled
      and source.availability_mode <> 'unavailable'
    limit 1;

    if not found then
      v_result := app_private.customer_cart_payload_v1(
        v_cart.id,
        'unavailable',
        false,
        'indicative',
        null,
        null
      );
      insert into public.customer_cart_mutations(
        cart_id, user_id, shop_id, idempotency_key, operation,
        request_hash, response_payload
      ) values (
        v_cart.id, v_user_id, p_shop_id, p_idempotency_key, p_operation,
        v_request_hash, v_result
      );
      return v_result;
    end if;

    select count(*)::integer into v_item_count
    from public.customer_cart_items item
    where item.cart_id = v_cart.id;
    if v_item_count >= 100 and not exists (
      select 1 from public.customer_cart_items item
      where item.cart_id = v_cart.id
        and item.publication_id = p_publication_id
    ) then
      v_result := app_private.customer_cart_payload_v1(
        v_cart.id,
        'cart_limit_reached',
        false,
        'indicative',
        null,
        null
      );
      insert into public.customer_cart_mutations(
        cart_id, user_id, shop_id, idempotency_key, operation,
        request_hash, response_payload
      ) values (
        v_cart.id, v_user_id, p_shop_id, p_idempotency_key, p_operation,
        v_request_hash, v_result
      );
      return v_result;
    end if;

    insert into public.customer_cart_items(
      cart_id, user_id, shop_id, publication_id, quantity,
      snapshot_public_name, snapshot_price_clp,
      snapshot_compare_at_price_clp, snapshot_promotion_id,
      snapshot_promotion_ends_at, snapshot_image_url, snapshot_at
    ) values (
      v_cart.id, v_user_id, p_shop_id, p_publication_id, p_quantity,
      v_source.public_name, v_source.price_clp,
      v_source.compare_at_price_clp, v_source.promotion_id,
      v_source.promotion_ends_at, v_source.image_thumb_url, v_now
    )
    on conflict (cart_id, publication_id) do update
    set quantity = excluded.quantity,
        snapshot_public_name = excluded.snapshot_public_name,
        snapshot_price_clp = excluded.snapshot_price_clp,
        snapshot_compare_at_price_clp = excluded.snapshot_compare_at_price_clp,
        snapshot_promotion_id = excluded.snapshot_promotion_id,
        snapshot_promotion_ends_at = excluded.snapshot_promotion_ends_at,
        snapshot_image_url = excluded.snapshot_image_url,
        snapshot_at = excluded.snapshot_at;
  elsif p_operation = 'remove' then
    delete from public.customer_cart_items item
    where item.cart_id = v_cart.id
      and item.publication_id = p_publication_id;
  else
    delete from public.customer_cart_items item where item.cart_id = v_cart.id;
  end if;

  update public.customer_carts cart
  set cart_version = cart.cart_version + 1
  where cart.id = v_cart.id
  returning * into v_cart;

  v_result := app_private.customer_cart_payload_v1(
    v_cart.id,
    'ok',
    false,
    'indicative',
    null,
    null
  );
  insert into public.customer_cart_mutations(
    cart_id, user_id, shop_id, idempotency_key, operation,
    request_hash, response_payload
  ) values (
    v_cart.id, v_user_id, p_shop_id, p_idempotency_key, p_operation,
    v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.customer_cart_merge_guest_v1(
  p_shop_id uuid,
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
  v_user_id uuid := auth.uid();
  v_cart public.customer_carts%rowtype;
  v_previous public.customer_cart_mutations%rowtype;
  v_canonical jsonb;
  v_request_hash bytea;
  v_result jsonb;
  v_rejected jsonb;
  v_accepted_publication_ids jsonb := '[]'::jsonb;
  v_accepted integer := 0;
  v_item_count integer := 0;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_id is null
    or p_guest_items is null
    or jsonb_typeof(p_guest_items) <> 'array'
    or jsonb_array_length(p_guest_items) > 100
    or pg_column_size(p_guest_items) > 32768
    or p_expected_version is null
    or p_expected_version < 0
    or p_idempotency_key is null
    or exists (
      select 1
      from jsonb_array_elements(p_guest_items) guest(item)
      where jsonb_typeof(guest.item) <> 'object'
        or not (guest.item ? 'publicationId')
        or not (guest.item ? 'quantity')
        or guest.item - 'publicationId' - 'quantity' <> '{}'::jsonb
        or coalesce(guest.item ->> 'publicationId', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or jsonb_typeof(guest.item -> 'quantity') <> 'number'
        or coalesce(guest.item ->> 'quantity', '') !~ '^[1-9][0-9]?$'
        or (guest.item ->> 'quantity')::integer not between 1 and 99
    ) then
    return jsonb_build_object(
      'apiVersion', 'customer-cart.v1',
      'status', 'invalid'
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'publicationId', canonical.publication_id,
      'quantity', canonical.quantity
    ) order by canonical.publication_id
  ), '[]'::jsonb)
  into v_canonical
  from (
    select
      (guest.item ->> 'publicationId')::uuid as publication_id,
      max((guest.item ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_guest_items) guest(item)
    group by (guest.item ->> 'publicationId')::uuid
  ) canonical;

  v_request_hash := extensions.digest(
    p_shop_id::text || E'\x1f' || v_canonical::text || E'\x1f'
      || p_expected_version::text,
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-cart:' || v_user_id::text || ':' || p_shop_id::text,
    23023
  ));

  insert into public.customer_carts(user_id, shop_id)
  values (v_user_id, p_shop_id)
  on conflict (user_id, shop_id) do nothing;
  select cart.* into v_cart
  from public.customer_carts cart
  where cart.user_id = v_user_id and cart.shop_id = p_shop_id
  for update;

  delete from public.customer_cart_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = p_shop_id
    and mutation.expires_at <= v_now;
  select mutation.* into v_previous
  from public.customer_cart_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'merge'
      or v_previous.request_hash <> v_request_hash then
      return jsonb_build_object(
        'apiVersion', 'customer-cart.v1',
        'status', 'idempotency_conflict'
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  if v_cart.cart_version <> p_expected_version then
    v_result := app_private.customer_cart_payload_v1(
      v_cart.id, 'version_conflict', false, 'indicative', null, null
    );
    insert into public.customer_cart_mutations(
      cart_id, user_id, shop_id, idempotency_key, operation,
      request_hash, response_payload
    ) values (
      v_cart.id, v_user_id, p_shop_id, p_idempotency_key, 'merge',
      v_request_hash, v_result
    );
    return v_result;
  end if;

  select count(*)::integer
  into v_item_count
  from public.customer_cart_items item
  where item.cart_id = v_cart.id;

  with guest as (
    select
      (item ->> 'publicationId')::uuid as publication_id,
      (item ->> 'quantity')::integer as quantity
    from jsonb_array_elements(v_canonical) row(item)
  ),
  eligible_candidates as (
    select
      guest.publication_id,
      guest.quantity,
      source.public_name,
      source.price_clp,
      source.compare_at_price_clp,
      source.promotion_id,
      source.promotion_ends_at,
      source.image_thumb_url,
      existing.id is not null as existing_line,
      sum(case when existing.id is null then 1 else 0 end) over (
        order by guest.publication_id
        rows between unbounded preceding and current row
      ) as new_item_rank
    from guest
    join lateral app_private.storefront_catalog_source_v1(
      guest.publication_id,
      p_shop_id,
      v_now
    ) source on source.storefront_enabled
      and source.availability_mode <> 'unavailable'
    left join public.customer_cart_items existing
      on existing.cart_id = v_cart.id
     and existing.publication_id = guest.publication_id
  ),
  eligible as (
    select candidate.*
    from eligible_candidates candidate
    where candidate.existing_line
      or candidate.new_item_rank <= greatest(100 - v_item_count, 0)
  ),
  merged as (
    insert into public.customer_cart_items(
      cart_id, user_id, shop_id, publication_id, quantity,
      snapshot_public_name, snapshot_price_clp,
      snapshot_compare_at_price_clp, snapshot_promotion_id,
      snapshot_promotion_ends_at, snapshot_image_url, snapshot_at
    )
    select
      v_cart.id, v_user_id, p_shop_id, eligible.publication_id,
      eligible.quantity, eligible.public_name, eligible.price_clp,
      eligible.compare_at_price_clp, eligible.promotion_id,
      eligible.promotion_ends_at, eligible.image_thumb_url, v_now
    from eligible
    on conflict (cart_id, publication_id) do update
    set quantity = greatest(customer_cart_items.quantity, excluded.quantity),
        snapshot_public_name = excluded.snapshot_public_name,
        snapshot_price_clp = excluded.snapshot_price_clp,
        snapshot_compare_at_price_clp = excluded.snapshot_compare_at_price_clp,
        snapshot_promotion_id = excluded.snapshot_promotion_id,
        snapshot_promotion_ends_at = excluded.snapshot_promotion_ends_at,
        snapshot_image_url = excluded.snapshot_image_url,
        snapshot_at = excluded.snapshot_at
    returning publication_id
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(merged.publication_id order by merged.publication_id),
      '[]'::jsonb
    )
  into v_accepted, v_accepted_publication_ids
  from merged;

  select coalesce(jsonb_agg(guest.publication_id order by guest.publication_id), '[]'::jsonb)
  into v_rejected
  from (
    select (item ->> 'publicationId')::uuid as publication_id
    from jsonb_array_elements(v_canonical) row(item)
  ) guest
  where not exists (
    select 1
    from jsonb_array_elements_text(v_accepted_publication_ids) accepted(value)
    where accepted.value::uuid = guest.publication_id
  );

  if v_accepted > 0 then
    update public.customer_carts cart
    set cart_version = cart.cart_version + 1
    where cart.id = v_cart.id
    returning * into v_cart;
  end if;

  v_result := app_private.customer_cart_payload_v1(
    v_cart.id,
    case when jsonb_array_length(v_rejected) = 0 then 'merged' else 'partial' end,
    false,
    'indicative',
    null,
    null
  ) || jsonb_build_object(
    'mergeStatus', case
      when jsonb_array_length(v_rejected) = 0 then 'complete'
      when v_accepted = 0 then 'no_eligible_items'
      else 'partial'
    end,
    'acceptedCount', v_accepted,
    'rejectedPublicationIds', v_rejected
  );

  insert into public.customer_cart_mutations(
    cart_id, user_id, shop_id, idempotency_key, operation,
    request_hash, response_payload
  ) values (
    v_cart.id, v_user_id, p_shop_id, p_idempotency_key, 'merge',
    v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.customer_cart_revalidate_v1(
  p_shop_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart public.customer_carts%rowtype;
  v_previous public.customer_cart_mutations%rowtype;
  v_request_hash bytea;
  v_result jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_id is null
    or p_expected_version is null
    or p_expected_version < 0
    or p_idempotency_key is null then
    return jsonb_build_object(
      'apiVersion', 'customer-cart.v1',
      'status', 'invalid'
    );
  end if;

  v_request_hash := extensions.digest(
    'revalidate:' || p_shop_id::text || ':' || p_expected_version::text,
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-cart:' || v_user_id::text || ':' || p_shop_id::text,
    23023
  ));

  insert into public.customer_carts(user_id, shop_id)
  values (v_user_id, p_shop_id)
  on conflict (user_id, shop_id) do nothing;
  select cart.* into v_cart
  from public.customer_carts cart
  where cart.user_id = v_user_id and cart.shop_id = p_shop_id
  for update;

  delete from public.customer_cart_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = p_shop_id
    and mutation.expires_at <= v_now;
  select mutation.* into v_previous
  from public.customer_cart_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'revalidate'
      or v_previous.request_hash <> v_request_hash then
      return jsonb_build_object(
        'apiVersion', 'customer-cart.v1',
        'status', 'idempotency_conflict'
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  if v_cart.cart_version <> p_expected_version then
    v_result := app_private.customer_cart_payload_v1(
      v_cart.id, 'version_conflict', false, 'indicative', null, null
    );
    insert into public.customer_cart_mutations(
      cart_id, user_id, shop_id, idempotency_key, operation,
      request_hash, response_payload
    ) values (
      v_cart.id, v_user_id, p_shop_id, p_idempotency_key, 'revalidate',
      v_request_hash, v_result
    );
    return v_result;
  end if;

  update public.customer_carts cart
  set cart_version = cart.cart_version + 1,
      last_revalidated_at = v_now
  where cart.id = v_cart.id
  returning * into v_cart;

  -- Build the response before replacing snapshots so price/promotion deltas remain
  -- visible to the customer in this exact revalidation response.
  v_result := app_private.customer_cart_payload_v1(
    v_cart.id,
    'revalidated',
    false,
    'confirmed',
    v_now,
    v_now + interval '5 minutes'
  );

  with resolved as (
    select
      item.id,
      source.public_name,
      source.price_clp,
      source.compare_at_price_clp,
      source.promotion_id,
      source.promotion_ends_at,
      source.image_thumb_url
    from public.customer_cart_items item
    join lateral app_private.storefront_catalog_source_v1(
      item.publication_id,
      p_shop_id,
      v_now
    ) source on source.storefront_enabled
      and source.availability_mode <> 'unavailable'
    where item.cart_id = v_cart.id
  )
  update public.customer_cart_items item
  set snapshot_public_name = resolved.public_name,
      snapshot_price_clp = resolved.price_clp,
      snapshot_compare_at_price_clp = resolved.compare_at_price_clp,
      snapshot_promotion_id = resolved.promotion_id,
      snapshot_promotion_ends_at = resolved.promotion_ends_at,
      snapshot_image_url = resolved.image_thumb_url,
      snapshot_at = v_now
  from resolved
  where item.id = resolved.id;

  insert into public.customer_cart_mutations(
    cart_id, user_id, shop_id, idempotency_key, operation,
    request_hash, response_payload
  ) values (
    v_cart.id, v_user_id, p_shop_id, p_idempotency_key, 'revalidate',
    v_request_hash, v_result
  );
  return v_result;
end;
$$;

do $grants$
begin
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

  grant execute on function public.customer_cart_read_v1(uuid)
    to authenticated;
  grant execute on function public.customer_cart_mutate_v1(
    uuid, text, uuid, integer, bigint, uuid
  ) to authenticated;
  grant execute on function public.customer_cart_merge_guest_v1(
    uuid, jsonb, bigint, uuid
  ) to authenticated;
  grant execute on function public.customer_cart_revalidate_v1(uuid, bigint, uuid)
    to authenticated;
end;
$grants$;

comment on table public.customer_carts is
  'Owner/shop-scoped Storefront carts. cart_version is the optimistic concurrency boundary.';
comment on table public.customer_cart_items is
  'Requested quantities plus server-generated public snapshots; never authoritative inventory or totals.';
comment on table public.customer_cart_mutations is
  'Bounded idempotency ledger containing only customer-safe cart responses.';
comment on function public.customer_cart_revalidate_v1(uuid, bigint, uuid) is
  'Reprices from current Storefront publication/promotion state; no client price or total parameter exists.';

notify pgrst, 'reload schema';

commit;
