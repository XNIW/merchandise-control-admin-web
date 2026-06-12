-- TASK-057: shop-scoped mobile business history and bulk price history import.
-- Canonical target: mobile business history belongs to shops.shop_id.
-- owner_user_id remains a legacy bridge for Android/iOS rows created before
-- the Admin Web shop root existed.

begin;

alter table public.shared_sheet_sessions
  add column if not exists shop_id uuid references public.shops(shop_id) on delete cascade;

alter table public.sync_events
  add column if not exists shop_id uuid references public.shops(shop_id) on delete cascade;

with mapped_sources as (
  select owner_user_id, (array_agg(distinct shop_id))[1] as shop_id
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and owner_user_id is not null
    and shop_id is not null
  group by owner_user_id
  having count(distinct shop_id) = 1
)
update public.shared_sheet_sessions sessions
set shop_id = mapped_sources.shop_id
from mapped_sources
where sessions.shop_id is null
  and sessions.owner_user_id = mapped_sources.owner_user_id;

with mapped_sources as (
  select owner_user_id, (array_agg(distinct shop_id))[1] as shop_id
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and owner_user_id is not null
    and shop_id is not null
  group by owner_user_id
  having count(distinct shop_id) = 1
)
update public.sync_events events
set shop_id = mapped_sources.shop_id
from mapped_sources
where events.shop_id is null
  and events.owner_user_id = mapped_sources.owner_user_id;

create index if not exists shared_sheet_sessions_shop_updated_idx
  on public.shared_sheet_sessions (shop_id, updated_at desc)
  where shop_id is not null;

create index if not exists sync_events_shop_created_idx
  on public.sync_events (shop_id, created_at desc)
  where shop_id is not null;

drop policy if exists shared_sheet_sessions_select_shop_member on public.shared_sheet_sessions;
create policy shared_sheet_sessions_select_shop_member
  on public.shared_sheet_sessions for select to authenticated
  using (shop_id is not null and app_private.is_active_shop_member(shop_id));

drop policy if exists sync_events_select_shop_member on public.sync_events;
create policy sync_events_select_shop_member
  on public.sync_events for select to authenticated
  using (shop_id is not null and app_private.is_active_shop_member(shop_id));

create or replace function public.shop_catalog_import_price_history(
  p_shop_id uuid,
  p_prices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_price jsonb;
  v_price_id uuid;
  v_product_id uuid;
  v_type text;
  v_amount double precision;
  v_effective_at text;
  v_source text;
  v_note text;
  v_created_at text;
  v_applied integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if p_prices is null or jsonb_typeof(p_prices) <> 'array' then
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id);
  end if;

  if jsonb_array_length(p_prices) > 80000 then
    return app_private.shop_admin_action_result(false, 'row_limit_exceeded', p_shop_id);
  end if;

  for v_price in select value from jsonb_array_elements(p_prices)
  loop
    v_total := v_total + 1;

    begin
      if jsonb_typeof(v_price) <> 'object' then
        v_failed := v_failed + 1;
        continue;
      end if;

      v_product_id := nullif(v_price->>'product_id', '')::uuid;
      v_price_id := coalesce(nullif(v_price->>'price_id', '')::uuid, gen_random_uuid());
      v_type := upper(app_private.normalize_admin_label(v_price->>'type'));
      v_amount := nullif(v_price->>'price', '')::double precision;
      v_effective_at := nullif(left(app_private.normalize_admin_label(v_price->>'effective_at'), 80), '');
      v_source := nullif(left(app_private.normalize_admin_label(v_price->>'source'), 80), '');
      v_note := nullif(left(app_private.normalize_admin_label(v_price->>'note'), 250), '');
      v_created_at := coalesce(
        nullif(left(app_private.normalize_admin_label(v_price->>'created_at'), 80), ''),
        v_effective_at
      );

      if v_product_id is null
        or v_type not in ('PURCHASE', 'RETAIL')
        or v_amount is null
        or v_amount < 0
        or v_effective_at is null then
        v_failed := v_failed + 1;
        continue;
      end if;

      if not exists (
        select 1
        from public.inventory_products product
        where product.id = v_product_id
          and product.deleted_at is null
          and (
            product.shop_id = p_shop_id
            or (product.shop_id is null and product.owner_user_id = v_scope.owner_user_id)
          )
      ) then
        v_failed := v_failed + 1;
        continue;
      end if;

      update public.inventory_product_prices
      set shop_id = p_shop_id,
          owner_user_id = v_scope.owner_user_id,
          product_id = v_product_id,
          type = v_type,
          price = v_amount,
          effective_at = v_effective_at,
          source = v_source,
          note = v_note,
          created_at = coalesce(v_created_at, v_effective_at)
      where id = v_price_id
        and (
          shop_id = p_shop_id
          or (shop_id is null and owner_user_id = v_scope.owner_user_id)
        );

      if not found then
        insert into public.inventory_product_prices (
          id,
          owner_user_id,
          shop_id,
          product_id,
          type,
          price,
          effective_at,
          source,
          note,
          created_at
        )
        values (
          v_price_id,
          v_scope.owner_user_id,
          p_shop_id,
          v_product_id,
          v_type,
          v_amount,
          v_effective_at,
          v_source,
          v_note,
          coalesce(v_created_at, v_effective_at)
        )
        on conflict on constraint inventory_product_prices_owner_product_type_effective_uniq
        do update
        set shop_id = excluded.shop_id,
            price = excluded.price,
            source = excluded.source,
            note = excluded.note,
            created_at = excluded.created_at;
      end if;

      v_applied := v_applied + 1;
    exception
      when invalid_text_representation or numeric_value_out_of_range or check_violation then
        v_failed := v_failed + 1;
    end;
  end loop;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id,
    case when v_failed = 0 then 'shop.catalog.price_history.import.success' else 'shop.catalog.price_history.import.partial' end,
    case when v_failed = 0 then 'info' else 'warning' end,
    case when v_failed = 0 then 'success' else 'failure' end,
    'price_history',
    null,
    case when v_failed = 0 then 'success' else 'partial_failure' end,
    jsonb_build_object(
      'catalog_scope', v_scope.catalog_scope,
      'source', 'admin_web',
      'priceHistoryApplied', v_applied,
      'failedRows', v_failed,
      'totalRows', v_total
    )
  );

  return app_private.shop_admin_action_result(
    v_failed = 0,
    case when v_failed = 0 then 'success' else 'partial_failure' end,
    p_shop_id,
    null,
    audit_event_id,
    jsonb_build_object(
      'priceHistoryApplied', v_applied,
      'failedRows', v_failed,
      'totalRows', v_total
    )
  );
exception
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id,
      'shop.catalog.price_history.import.failure',
      'critical',
      'failure',
      'price_history',
      null,
      'db_failure',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;

revoke all on function public.shop_catalog_import_price_history(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.shop_catalog_import_price_history(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
