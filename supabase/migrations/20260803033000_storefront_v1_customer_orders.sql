-- Storefront v1 / TASK-027
--
-- Private customer orders, immutable economic/fulfillment snapshots, first status
-- event, POS-neutral outbox and owner-scoped idempotency ledger. A customer order is
-- explicitly not a fiscal sale. The public mutation RPC is installed by the following
-- capacity-integration migration after checkout/ATP helpers have been upgraded.

begin;

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  public_order_code text not null default (
    'MC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20))
  ),
  user_id uuid references auth.users(id) on delete set null,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  quote_id uuid references public.customer_checkout_quotes(id) on delete set null,
  cart_id uuid,
  quote_version bigint not null,
  status text not null default 'confirmed',
  status_version bigint not null default 1,
  fulfillment_mode text not null,
  slot_id uuid not null,
  currency_code text not null default 'CLP',
  subtotal_clp bigint not null,
  delivery_fee_clp bigint not null default 0,
  total_clp bigint not null,
  fulfillment_snapshot jsonb not null,
  placed_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_orders_public_code_unique unique (public_order_code),
  constraint customer_orders_quote_unique unique (quote_id),
  constraint customer_orders_shop_id_id_unique unique (shop_id, id),
  constraint customer_orders_slot_fkey foreign key (shop_id, slot_id)
    references public.storefront_fulfillment_slots(shop_id, id) on delete restrict,
  constraint customer_orders_code_check check (
    public_order_code ~ '^MC-[0-9A-F]{20}$'
  ),
  constraint customer_orders_version_check check (
    quote_version >= 1 and status_version >= 1
  ),
  constraint customer_orders_status_check check (
    status in (
      'confirmed', 'accepted', 'rejected', 'preparing', 'ready',
      'out_for_delivery', 'completed', 'cancelled'
    )
  ),
  constraint customer_orders_mode_check check (
    fulfillment_mode in ('pickup', 'reservation', 'delivery')
  ),
  constraint customer_orders_money_check check (
    currency_code = 'CLP'
    and subtotal_clp between 0 and 999999999999
    and delivery_fee_clp between 0 and 999999999999
    and total_clp = subtotal_clp + delivery_fee_clp
    and total_clp between 0 and 999999999999
  ),
  constraint customer_orders_fulfillment_snapshot_check check (
    jsonb_typeof(fulfillment_snapshot) = 'object'
    and pg_column_size(fulfillment_snapshot) <= 32768
  ),
  constraint customer_orders_time_check check (updated_at >= placed_at)
);

create index customer_orders_owner_placed_idx
  on public.customer_orders(user_id, placed_at desc, id)
  where user_id is not null;
create index customer_orders_shop_status_placed_idx
  on public.customer_orders(shop_id, status, placed_at, id);
create index customer_orders_active_slot_idx
  on public.customer_orders(slot_id, status, placed_at, id)
  where status in ('confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery');

create table public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  shop_id uuid not null,
  line_position integer not null,
  publication_id uuid not null,
  source_product_id uuid not null references public.inventory_products(id)
    on delete restrict,
  hold_id uuid references public.customer_reservation_holds(id) on delete set null,
  public_name text not null,
  quantity integer not null,
  unit_price_clp bigint not null,
  compare_at_price_clp bigint,
  line_total_clp bigint not null,
  promotion_name text,
  promotion_ends_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_order_items_order_shop_fkey foreign key (shop_id, order_id)
    references public.customer_orders(shop_id, id) on delete cascade,
  constraint customer_order_items_publication_fkey foreign key (
    shop_id,
    publication_id
  ) references public.storefront_product_publications(shop_id, id) on delete restrict,
  constraint customer_order_items_position_unique unique (order_id, line_position),
  constraint customer_order_items_publication_unique unique (order_id, publication_id),
  constraint customer_order_items_position_check check (line_position between 1 and 100),
  constraint customer_order_items_name_check check (
    public_name = btrim(public_name)
    and length(public_name) between 1 and 200
    and public_name !~ '[[:cntrl:]]'
  ),
  constraint customer_order_items_quantity_check check (quantity between 1 and 99),
  constraint customer_order_items_money_check check (
    unit_price_clp between 0 and 999999999999
    and (
      compare_at_price_clp is null
      or compare_at_price_clp between unit_price_clp and 999999999999
    )
    and line_total_clp = unit_price_clp * quantity
    and line_total_clp between 0 and 999999999999
  ),
  constraint customer_order_items_promotion_name_check check (
    promotion_name is null
    or (
      promotion_name = btrim(promotion_name)
      and length(promotion_name) between 1 and 160
      and promotion_name !~ '[[:cntrl:]]'
    )
  )
);

create index customer_order_items_product_active_idx
  on public.customer_order_items(source_product_id, order_id);
create index customer_order_items_shop_publication_idx
  on public.customer_order_items(shop_id, publication_id, order_id);

create table public.customer_order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  shop_id uuid not null,
  event_version bigint not null,
  status text not null,
  actor_kind text not null default 'system',
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_order_status_events_order_shop_fkey foreign key (
    shop_id,
    order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint customer_order_status_events_version_unique unique (
    order_id,
    event_version
  ),
  constraint customer_order_status_events_version_check check (event_version >= 1),
  constraint customer_order_status_events_status_check check (
    status in (
      'confirmed', 'accepted', 'rejected', 'preparing', 'ready',
      'out_for_delivery', 'completed', 'cancelled'
    )
  ),
  constraint customer_order_status_events_actor_check check (
    actor_kind in ('system', 'customer', 'admin', 'pos')
  ),
  constraint customer_order_status_events_metadata_check check (
    jsonb_typeof(metadata_redacted) = 'object'
    and pg_column_size(metadata_redacted) <= 16384
  )
);

create index customer_order_status_events_order_created_idx
  on public.customer_order_status_events(order_id, event_version, created_at);

create table public.customer_order_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  shop_id uuid not null,
  event_type text not null,
  idempotency_key uuid not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default statement_timestamp(),
  lease_expires_at timestamptz,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_order_outbox_order_shop_fkey foreign key (shop_id, order_id)
    references public.customer_orders(shop_id, id) on delete cascade,
  constraint customer_order_outbox_event_unique unique (order_id, event_type),
  constraint customer_order_outbox_idempotency_unique unique (
    shop_id,
    idempotency_key
  ),
  constraint customer_order_outbox_event_check check (
    event_type = 'customer_order.confirmed.v1'
  ),
  constraint customer_order_outbox_status_check check (
    status in ('pending', 'leased', 'delivered', 'dead_letter')
  ),
  constraint customer_order_outbox_attempt_check check (
    attempt_count between 0 and 1000
  ),
  constraint customer_order_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and pg_column_size(payload) <= 524288
  ),
  constraint customer_order_outbox_lease_check check (
    (status = 'leased' and lease_expires_at is not null)
    or (status <> 'leased' and lease_expires_at is null)
  ),
  constraint customer_order_outbox_delivery_check check (
    (status = 'delivered' and delivered_at is not null)
    or (status <> 'delivered' and delivered_at is null)
  ),
  constraint customer_order_outbox_error_check check (
    last_error_code is null
    or (
      last_error_code = btrim(last_error_code)
      and length(last_error_code) between 1 and 80
      and last_error_code ~ '^[a-z0-9_]+$'
    )
  )
);

create index customer_order_outbox_pending_idx
  on public.customer_order_outbox(status, available_at, id)
  where status in ('pending', 'leased');

create table public.customer_order_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  quote_id uuid references public.customer_checkout_quotes(id) on delete set null,
  order_id uuid references public.customer_orders(id) on delete set null,
  idempotency_key uuid not null,
  operation text not null default 'create',
  request_sha256 text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default (
    statement_timestamp() + interval '30 days'
  ),
  constraint customer_order_mutations_owner_key_unique unique (
    user_id,
    shop_id,
    idempotency_key
  ),
  constraint customer_order_mutations_operation_check check (operation = 'create'),
  constraint customer_order_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_order_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 524288
  ),
  constraint customer_order_mutations_retention_check check (
    retained_until > created_at
  )
);

create index customer_order_mutations_retention_idx
  on public.customer_order_mutations(retained_until, id);

create or replace function app_private.customer_order_guard_snapshot_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.public_order_code is distinct from old.public_order_code
    or (
      new.user_id is distinct from old.user_id
      and new.user_id is not null
    )
    or new.shop_id is distinct from old.shop_id
    or (
      new.quote_id is distinct from old.quote_id
      and new.quote_id is not null
    )
    or new.cart_id is distinct from old.cart_id
    or new.quote_version is distinct from old.quote_version
    or new.fulfillment_mode is distinct from old.fulfillment_mode
    or new.slot_id is distinct from old.slot_id
    or new.currency_code is distinct from old.currency_code
    or new.subtotal_clp is distinct from old.subtotal_clp
    or new.delivery_fee_clp is distinct from old.delivery_fee_clp
    or new.total_clp is distinct from old.total_clp
    or new.fulfillment_snapshot is distinct from old.fulfillment_snapshot
    or new.placed_at is distinct from old.placed_at
  then
    raise exception using
      errcode = '55000',
      message = 'customer_order_snapshot_immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.customer_order_item_guard_snapshot_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.shop_id is distinct from old.shop_id
    or new.line_position is distinct from old.line_position
    or new.publication_id is distinct from old.publication_id
    or new.source_product_id is distinct from old.source_product_id
    or (
      new.hold_id is distinct from old.hold_id
      and new.hold_id is not null
    )
    or new.public_name is distinct from old.public_name
    or new.quantity is distinct from old.quantity
    or new.unit_price_clp is distinct from old.unit_price_clp
    or new.compare_at_price_clp is distinct from old.compare_at_price_clp
    or new.line_total_clp is distinct from old.line_total_clp
    or new.promotion_name is distinct from old.promotion_name
    or new.promotion_ends_at is distinct from old.promotion_ends_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'customer_order_item_snapshot_immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.customer_order_event_guard_append_only_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'customer_order_status_event_append_only';
end;
$$;

create or replace function app_private.customer_order_outbox_guard_envelope_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.shop_id is distinct from old.shop_id
    or new.event_type is distinct from old.event_type
    or new.idempotency_key is distinct from old.idempotency_key
    or new.payload is distinct from old.payload
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'customer_order_outbox_envelope_immutable';
  end if;

  return new;
end;
$$;

create trigger customer_orders_guard_snapshot
  before update on public.customer_orders
  for each row execute function app_private.customer_order_guard_snapshot_v1();
create trigger customer_orders_touch_updated_at
  before update on public.customer_orders
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_order_items_guard_snapshot
  before update on public.customer_order_items
  for each row execute function app_private.customer_order_item_guard_snapshot_v1();
create trigger customer_order_status_events_guard_append_only
  before update on public.customer_order_status_events
  for each row execute function app_private.customer_order_event_guard_append_only_v1();
create trigger customer_order_outbox_guard_envelope
  before update on public.customer_order_outbox
  for each row execute function app_private.customer_order_outbox_guard_envelope_v1();
create trigger customer_order_outbox_touch_updated_at
  before update on public.customer_order_outbox
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_orders enable row level security;
alter table public.customer_orders force row level security;
alter table public.customer_order_items enable row level security;
alter table public.customer_order_items force row level security;
alter table public.customer_order_status_events enable row level security;
alter table public.customer_order_status_events force row level security;
alter table public.customer_order_outbox enable row level security;
alter table public.customer_order_outbox force row level security;
alter table public.customer_order_mutations enable row level security;
alter table public.customer_order_mutations force row level security;

create policy customer_orders_select_owner
  on public.customer_orders for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_order_items_select_owner
  on public.customer_order_items for select to authenticated
  using (exists (
    select 1
    from public.customer_orders customer_order
    where customer_order.id = customer_order_items.order_id
      and customer_order.user_id = (select auth.uid())
      and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  ));
create policy customer_order_status_events_select_owner
  on public.customer_order_status_events for select to authenticated
  using (exists (
    select 1
    from public.customer_orders customer_order
    where customer_order.id = customer_order_status_events.order_id
      and customer_order.user_id = (select auth.uid())
      and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  ));
create policy customer_order_mutations_select_owner
  on public.customer_order_mutations for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

revoke all on table public.customer_orders
  from public, anon, authenticated;
revoke all on table public.customer_order_items
  from public, anon, authenticated;
revoke all on table public.customer_order_status_events
  from public, anon, authenticated;
revoke all on table public.customer_order_outbox
  from public, anon, authenticated;
revoke all on table public.customer_order_mutations
  from public, anon, authenticated;

grant select, insert, update, delete on table public.customer_orders
  to service_role;
grant select, insert, update, delete on table public.customer_order_items
  to service_role;
grant select, insert, update, delete on table public.customer_order_status_events
  to service_role;
grant select, insert, update, delete on table public.customer_order_outbox
  to service_role;
grant select, insert, update, delete on table public.customer_order_mutations
  to service_role;

revoke all on function app_private.customer_order_guard_snapshot_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_item_guard_snapshot_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_event_guard_append_only_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_outbox_guard_envelope_v1()
  from public, anon, authenticated, service_role;

create or replace function app_private.customer_order_error_v1(
  p_status text,
  p_idempotent boolean,
  p_at timestamptz,
  p_order_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-order.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'orderId', p_order_id,
    'serverTime', p_at
  ));
$$;

create or replace function app_private.customer_order_payload_v1(
  p_order_id uuid,
  p_status text,
  p_idempotent boolean,
  p_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-order.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'orderId', customer_order.id,
    'orderCode', customer_order.public_order_code,
    'orderStatus', customer_order.status,
    'orderVersion', customer_order.status_version,
    'shopSlug', setting.public_slug,
    'fulfillmentMode', customer_order.fulfillment_mode,
    'fulfillment', customer_order.fulfillment_snapshot,
    'currencyCode', customer_order.currency_code,
    'subtotalClp', customer_order.subtotal_clp,
    'deliveryFeeClp', customer_order.delivery_fee_clp,
    'totalClp', customer_order.total_clp,
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'publicationId', item.publication_id,
        'publicName', item.public_name,
        'quantity', item.quantity,
        'unitPriceClp', item.unit_price_clp,
        'compareAtPriceClp', item.compare_at_price_clp,
        'lineTotalClp', item.line_total_clp,
        'promotionName', item.promotion_name,
        'promotionEndsAt', item.promotion_ends_at
      )) order by item.line_position)
      from public.customer_order_items item
      where item.order_id = customer_order.id
    ), '[]'::jsonb),
    'placedAt', customer_order.placed_at,
    'serverTime', p_at
  ))
  from public.customer_orders customer_order
  join public.storefront_settings setting on setting.shop_id = customer_order.shop_id
  where customer_order.id = p_order_id;
$$;

revoke all on function app_private.customer_order_error_v1(
  text, boolean, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_payload_v1(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;

comment on table public.customer_orders is
  'Customer commerce order with immutable server-derived CLP and fulfillment snapshots; not a fiscal sale.';
comment on table public.customer_order_items is
  'Private order line snapshots. source_product_id and hold_id never cross the customer RPC boundary.';
comment on table public.customer_order_status_events is
  'Append-only logical order status history beginning with confirmed.';
comment on table public.customer_order_outbox is
  'POS-neutral idempotent customer-order event outbox; consumption belongs to TASK-030.';
comment on table public.customer_order_mutations is
  'Owner/shop idempotency ledger retained independently from checkout mutation keys.';

notify pgrst, 'reload schema';

commit;
