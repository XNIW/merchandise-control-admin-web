-- Owner-scoped historical order lines for customer after-sales intake.
-- This boundary deliberately reads immutable order snapshots instead of the
-- current storefront catalog used by reorder.

create or replace function public.customer_after_sales_order_lines_v1(
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
  v_user_id uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_shop_slug text;
  v_items jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_order_id is null then
    return jsonb_build_object(
      'apiVersion', 'customer-after-sales-order-lines.v1',
      'status', 'invalid'
    );
  end if;
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = p_order_id
    and customer_order.user_id = v_user_id;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'customer-after-sales-order-lines.v1',
      'status', 'not_found'
    );
  end if;
  select setting.public_slug into v_shop_slug
  from public.storefront_settings setting
  where setting.shop_id = v_order.shop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', item.id,
    'name', item.public_name,
    'orderedQuantity', item.quantity,
    'existingOpenQuantity', greatest(coalesce(claimed.quantity, 0), 0),
    'maximumRequestQuantity', greatest(item.quantity - coalesce(claimed.quantity, 0), 0)
  ) order by item.line_position, item.id), '[]'::jsonb)
  into v_items
  from public.customer_order_items item
  left join lateral (
    select coalesce(sum(case_line.quantity), 0)::integer as quantity
    from public.customer_service_case_lines case_line
    join public.customer_service_cases customer_case
      on customer_case.id = case_line.case_id
    where case_line.order_item_id = item.id
      and customer_case.user_id = v_user_id
      and customer_case.order_id = v_order.id
      and customer_case.status not in ('rejected', 'closed')
  ) claimed on true
  where item.order_id = v_order.id;

  return jsonb_build_object(
    'apiVersion', 'customer-after-sales-order-lines.v1',
    'status', 'ok',
    'orderId', v_order.id,
    'shopSlug', v_shop_slug,
    'items', v_items,
    'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.customer_after_sales_create_v1(
  p_order_id uuid,
  p_type text,
  p_reason text,
  p_note text,
  p_lines jsonb,
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
  v_user_id uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_previous public.customer_service_case_mutations%rowtype;
  v_case public.customer_service_cases%rowtype;
  v_hash text;
  v_result jsonb;
  v_line jsonb;
  v_item public.customer_order_items%rowtype;
  v_requested_quantity integer;
  v_existing_quantity integer;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_type not in ('orderProblem', 'returnRequest', 'refundRequest')
    or p_reason not in (
      'damaged', 'wrong_item', 'missing_item', 'quality_issue',
      'changed_mind', 'delivery_issue', 'other'
    )
    or (p_note is not null and (p_note <> btrim(p_note)
      or length(p_note) not between 1 and 1000 or p_note ~ '[[:cntrl:]]'))
    or p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 100
    or p_idempotency_key is null then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid');
  end if;
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = p_order_id and customer_order.user_id = v_user_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'not_found');
  end if;
  v_hash := encode(extensions.digest(pg_catalog.convert_to(jsonb_build_array(
    p_order_id, p_type, p_reason, p_note, p_lines
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-after-sales:' || v_user_id::text || ':' || v_order.shop_id::text,
    50053
  ));
  select mutation.* into v_previous
  from public.customer_service_case_mutations mutation
  where mutation.user_id = v_user_id and mutation.shop_id = v_order.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create' or v_previous.request_sha256 <> v_hash then
      return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'idempotency_conflict');
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;
  insert into public.customer_service_cases(
    user_id, shop_id, order_id, case_type, reason_key, customer_note
  ) values (
    v_user_id, v_order.shop_id, v_order.id, p_type, p_reason, nullif(p_note, '')
  ) returning * into v_case;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or nullif(v_line->>'orderItemId', '') is null
      or nullif(v_line->>'quantity', '') is null then
      raise check_violation using message = 'invalid_case_line';
    end if;
    v_requested_quantity := (v_line->>'quantity')::integer;
    select item.* into v_item
    from public.customer_order_items item
    where item.id = (v_line->>'orderItemId')::uuid
      and item.order_id = v_order.id;
    if not found then
      raise check_violation using message = 'invalid_case_line';
    end if;
    select coalesce(sum(case_line.quantity), 0)::integer
    into v_existing_quantity
    from public.customer_service_case_lines case_line
    join public.customer_service_cases customer_case
      on customer_case.id = case_line.case_id
    where case_line.order_item_id = v_item.id
      and customer_case.user_id = v_user_id
      and customer_case.order_id = v_order.id
      and customer_case.status not in ('rejected', 'closed');
    if v_requested_quantity not between 1 and v_item.quantity - v_existing_quantity then
      raise check_violation using message = 'invalid_case_line_quantity';
    end if;
    insert into public.customer_service_case_lines(case_id, order_item_id, quantity)
    values (v_case.id, v_item.id, v_requested_quantity);
  end loop;
  insert into public.customer_service_case_events(
    case_id, shop_id, event_version, status, actor_kind, note_key
  ) values (
    v_case.id, v_case.shop_id, 1, 'submitted', 'customer', 'afterSales.submitted'
  );
  v_result := jsonb_build_object(
    'apiVersion', 'customer-after-sales.v1', 'status', 'ok',
    'idempotent', false, 'case', app_private.customer_service_case_payload_v1(v_case.id),
    'serverTime', statement_timestamp()
  );
  insert into public.customer_service_case_mutations(
    user_id, shop_id, case_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_order.shop_id, v_case.id, p_idempotency_key,
    'create', v_hash, v_result
  );
  return v_result;
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid');
end;
$$;

revoke all on function public.customer_after_sales_order_lines_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.customer_after_sales_order_lines_v1(uuid)
  to authenticated;

comment on function public.customer_after_sales_order_lines_v1(uuid) is
  'Owner-scoped immutable order-line read model for after-sales intake; contains no customer PII.';
