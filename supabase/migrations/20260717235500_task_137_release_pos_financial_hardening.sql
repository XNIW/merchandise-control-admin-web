-- TASK-137 release hardening: reject mixed-sign POS tenders and require the
-- independent pos.pay permission before idempotency and before every sink.

begin;

insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
select
  shop.shop_id,
  role.role_key,
  'pos.pay',
  true,
  null,
  now()
from public.shops shop
cross join (values ('cashier'), ('manager'), ('pos_admin')) role(role_key)
on conflict (shop_id, role_key, permission_key) do nothing;

create or replace function public.pos_sales_sync_apply_v1(
  p_shop_id uuid,
  p_shop_code text,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_client_batch_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_sales jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale jsonb;
  v_line jsonb;
  v_payment jsonb;
  v_batch_id uuid;
  v_sale_id uuid;
  v_sale_line_id uuid;
  v_existing_batch public.pos_sales_sync_batches%rowtype;
  v_existing_sale public.pos_sales%rowtype;
  v_original_sale public.pos_sales%rowtype;
  v_original_line public.pos_sale_lines%rowtype;
  v_staff_role text;
  v_max_discount_percent numeric(5,2);
  v_business_kind text;
  v_required_permission text;
  v_client_sale_id text;
  v_client_original_sale_id text;
  v_client_original_line_id text;
  v_client_line_id text;
  v_line_type text;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_stock_quantity_delta numeric(12,3);
  v_unit_amount_clp bigint;
  v_line_amount_clp bigint;
  v_catalog_unit_amount_clp bigint;
  v_authoritative_line_amount_clp bigint;
  v_authoritative_gross bigint;
  v_client_gross bigint;
  v_client_discount bigint;
  v_client_tax bigint;
  v_client_net bigint;
  v_client_paid bigint;
  v_client_change bigint;
  v_payment_amount_total bigint;
  v_payment_change_total bigint;
  v_discount_line_total bigint;
  v_tax_line_total bigint;
  v_discount_cap_percent numeric(5,2);
  v_discount_cap_clp bigint;
  v_has_discount_permission boolean;
  v_has_discount_over_limit_permission boolean;
  v_original_line_candidate_count integer;
  v_original_product_line_count integer;
  v_already_reversed_quantity numeric(12,3);
  v_already_reversed_value_clp bigint;
  v_historical_unbound_quantity numeric(12,3);
  v_historical_unbound_value_clp bigint;
  v_historical_unbound_count integer;
  v_pending_reversal_quantity numeric(12,3);
  v_pending_reversal_value_clp bigint;
  v_pending_reversal_quantities jsonb;
  v_pending_reversal_values jsonb;
  v_already_reversed_sale_gross_clp bigint;
  v_already_reversed_sale_discount_clp bigint;
  v_already_reversed_sale_tax_clp bigint;
  v_historical_reversal_economics_invalid boolean;
  v_expected_prior_discount_clp bigint;
  v_expected_prior_tax_clp bigint;
  v_target_cumulative_discount_clp bigint;
  v_target_cumulative_tax_clp bigint;
  v_derived_reversal_discount_clp bigint;
  v_derived_reversal_tax_clp bigint;
  v_derived_reversal_net_clp bigint;
  v_line_count integer;
  v_accepted_count integer := 0;
  v_duplicate_count integer := 0;
  v_stock_warning_count integer;
  v_stock_status text;
  v_stock_issue_code text;
  v_stock_has_applied boolean;
  v_stock_has_conflict boolean;
  v_result_sales jsonb := '[]'::jsonb;
begin
  begin
    if jsonb_typeof(p_sales) <> 'array'
      or not (jsonb_array_length(p_sales) between 1 and 100) then
      raise exception using errcode = 'P8801', message = 'validation_failed';
    end if;

    select coalesce(sum(jsonb_array_length(sale_item -> 'lines')), 0)::integer
      into v_line_count
    from jsonb_array_elements(p_sales) sale_item
    where jsonb_typeof(sale_item -> 'lines') = 'array';

    if v_line_count < 1 or v_line_count > 1000
      or exists (
        select 1
        from jsonb_array_elements(p_sales) sale_item
        where jsonb_typeof(sale_item -> 'lines') <> 'array'
      )
      or p_schema_version <> 'pos-sales-ledger-v2'
      or coalesce(trim(p_client_batch_id), '') = ''
      or coalesce(trim(p_idempotency_key), '') = ''
      or p_payload_hash !~ '^sha256:[0-9a-f]{64}$'
      or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object' then
      raise exception using errcode = 'P8801', message = 'validation_failed';
    end if;

    select staff.role_key,
           staff.max_discount_percent
      into v_staff_role,
           v_max_discount_percent
    from public.pos_sessions session_row
    join public.staff_accounts staff
      on staff.staff_id = session_row.staff_id
     and staff.shop_id = session_row.shop_id
    join public.shop_devices device
      on device.shop_device_id = session_row.shop_device_id
     and device.shop_id = session_row.shop_id
    join public.pos_device_credentials credential
      on credential.pos_device_credential_id = session_row.pos_device_credential_id
     and credential.shop_device_id = session_row.shop_device_id
     and credential.shop_id = session_row.shop_id
     and credential.staff_id = session_row.staff_id
    join public.shops shop
      on shop.shop_id = session_row.shop_id
    where session_row.pos_session_id = p_pos_session_id
      and session_row.shop_id = p_shop_id
      and session_row.shop_device_id = p_shop_device_id
      and session_row.staff_id = p_staff_id
      and session_row.status = 'active'
      and session_row.revoked_at is null
      and session_row.expires_at > now()
      and device.status = 'active'
      and device.revoked_at is null
      and credential.status = 'active'
      and credential.revoked_at is null
      and credential.expires_at > now()
      and credential.staff_credential_version = session_row.staff_credential_version
      and staff.status = 'active'
      and staff.credential_status = 'active'
      and staff.credential_version = session_row.staff_credential_version
      and staff.must_change_credential = false
      and (
        staff.session_invalidated_at is null
        or staff.session_invalidated_at <= session_row.issued_at
      )
      and (staff.credential_expires_at is null or staff.credential_expires_at > now())
      and (staff.locked_until is null or staff.locked_until <= now())
      and shop.shop_code = p_shop_code
      and shop.shop_status = 'active'
    for update of session_row, staff, device, credential, shop;

    if v_staff_role is null then
      raise exception using errcode = 'P8802', message = 'denied';
    end if;

    -- Freeze the current role permission state for the whole financial write.
    perform permission.staff_role_permission_id
    from public.staff_role_permissions permission
    where permission.shop_id = p_shop_id
      and permission.role_key = v_staff_role
    order by permission.permission_key
    for update;

    -- Authorization is checked before idempotency lookup so a revoked current
    -- permission cannot replay an older accepted batch.
    for v_sale in select value from jsonb_array_elements(p_sales)
    loop
      v_business_kind := v_sale ->> 'businessKind';
      v_required_permission := case v_business_kind
        when 'sale' then 'pos.sell'
        when 'refund' then 'pos.refund'
        when 'void' then 'pos.void'
        else null
      end;

      if v_required_permission is null then
        raise exception using errcode = 'P8801', message = 'validation_failed';
      end if;

      if jsonb_typeof(v_sale -> 'payments') is distinct from 'array' then
        raise exception using errcode = 'P8801', message = 'validation_failed';
      end if;

      if jsonb_array_length(v_sale -> 'payments') < 1
        or jsonb_typeof(v_sale -> 'changeAmountClp') is distinct from 'number'
        or (v_sale ->> 'changeAmountClp') !~ '^[0-9]+$'
        or jsonb_typeof(v_sale -> 'netAmountClp') is distinct from 'number'
        or (v_sale ->> 'netAmountClp') !~ '^-?[0-9]+$'
        or (
          v_sale ? 'paidAmountClp'
          and v_sale -> 'paidAmountClp' <> 'null'::jsonb
          and (
            jsonb_typeof(v_sale -> 'paidAmountClp') is distinct from 'number'
            or (v_sale ->> 'paidAmountClp') !~ '^-?[0-9]+$'
          )
        )
        or exists (
          select 1
          from jsonb_array_elements(v_sale -> 'payments') payment_item(value)
          where jsonb_typeof(payment_item.value) is distinct from 'object'
            or coalesce(payment_item.value ->> 'clientPaymentId', '') = ''
            or coalesce(payment_item.value ->> 'method', '') not in ('cash', 'card', 'other')
            or jsonb_typeof(payment_item.value -> 'amountClp') is distinct from 'number'
            or (payment_item.value ->> 'amountClp') !~ '^-?[0-9]+$'
            or jsonb_typeof(payment_item.value -> 'changeClp') is distinct from 'number'
            or (payment_item.value ->> 'changeClp') !~ '^[0-9]+$'
        ) then
        raise exception using errcode = 'P8801', message = 'validation_failed';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(v_sale -> 'payments') payment_item(value)
        where (
          v_business_kind = 'sale'
          and (payment_item.value ->> 'amountClp')::bigint < 0
        ) or (
          v_business_kind in ('refund', 'void')
          and (
            (payment_item.value ->> 'amountClp')::bigint > 0
            or (payment_item.value ->> 'changeClp')::bigint <> 0
          )
        )
      ) then
        raise exception using errcode = 'P8801', message = 'validation_failed';
      end if;

      select coalesce(sum((payment_item.value ->> 'amountClp')::bigint), 0),
             coalesce(sum((payment_item.value ->> 'changeClp')::bigint), 0)
        into v_payment_amount_total,
             v_payment_change_total
      from jsonb_array_elements(v_sale -> 'payments') payment_item(value);

      v_client_paid := nullif(v_sale ->> 'paidAmountClp', '')::bigint;
      v_client_change := (v_sale ->> 'changeAmountClp')::bigint;
      v_client_net := (v_sale ->> 'netAmountClp')::bigint;

      if v_payment_amount_total <> coalesce(v_client_paid, v_payment_amount_total)
        or v_payment_change_total <> v_client_change
        or v_payment_amount_total - v_payment_change_total <> v_client_net then
        raise exception using errcode = 'P8801', message = 'payment_totals_mismatch';
      end if;

      if not exists (
        select 1
        from public.staff_role_permissions permission
        where permission.shop_id = p_shop_id
          and permission.role_key = v_staff_role
          and permission.permission_key = v_required_permission
          and permission.enabled = true
      ) then
        raise exception using errcode = 'P8802', message = 'denied';
      end if;

      if not exists (
        select 1
        from public.staff_role_permissions permission
        where permission.shop_id = p_shop_id
          and permission.role_key = v_staff_role
          and permission.permission_key = 'pos.pay'
          and permission.enabled = true
      ) then
        raise exception using errcode = 'P8802', message = 'denied';
      end if;

      if v_business_kind = 'sale'
        and coalesce((v_sale ->> 'discountAmountClp')::bigint, 0) > 0 then
        select exists (
                 select 1
                 from public.staff_role_permissions permission
                 where permission.shop_id = p_shop_id
                   and permission.role_key = v_staff_role
                   and permission.permission_key = 'pos.discount'
                   and permission.enabled = true
               ),
               exists (
                 select 1
                 from public.staff_role_permissions permission
                 where permission.shop_id = p_shop_id
                   and permission.role_key = v_staff_role
                   and permission.permission_key = 'pos.discount_over_limit'
                   and permission.enabled = true
               )
          into v_has_discount_permission,
               v_has_discount_over_limit_permission;

        if not v_has_discount_permission then
          raise exception using errcode = 'P8802', message = 'pos.discount';
        end if;

        v_discount_cap_clp := floor(
          (v_sale ->> 'grossAmountClp')::numeric
            * v_max_discount_percent
            / 100
        )::bigint;
        if (v_sale ->> 'discountAmountClp')::bigint > v_discount_cap_clp
          and not v_has_discount_over_limit_permission then
          raise exception using
            errcode = 'P8802',
            message = 'pos.discount_over_limit';
        end if;
      end if;
    end loop;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_shop_id::text || ':' || p_shop_device_id::text || ':' || p_idempotency_key,
        0
      )
    );

    select *
      into v_existing_batch
    from public.pos_sales_sync_batches batch_row
    where batch_row.shop_id = p_shop_id
      and batch_row.shop_device_id = p_shop_device_id
      and (
        batch_row.client_batch_id = p_client_batch_id
        or batch_row.idempotency_key = p_idempotency_key
      )
    order by batch_row.created_at
    limit 1
    for update;

    if found then
      if v_existing_batch.payload_hash <> p_payload_hash then
        raise exception using errcode = 'P8803', message = 'conflict';
      end if;

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'clientSaleId', sale_item.value ->> 'clientSaleId',
            'posSaleId', existing.pos_sale_id,
            'status', 'duplicate'
          )
          order by sale_item.ordinality
        ),
        '[]'::jsonb
      )
        into v_result_sales
      from jsonb_array_elements(p_sales) with ordinality sale_item(value, ordinality)
      left join lateral (
        select sale_row.pos_sale_id
        from public.pos_sales sale_row
        where sale_row.shop_id = p_shop_id
          and sale_row.shop_device_id = p_shop_device_id
          and (
            sale_row.client_sale_id = sale_item.value ->> 'clientSaleId'
            or sale_row.idempotency_key = sale_item.value ->> 'idempotencyKey'
          )
        order by sale_row.created_at
        limit 1
      ) existing on true;

      return jsonb_build_object(
        'ok', true,
        'code', 'success',
        'batch', jsonb_build_object(
          'acceptedSaleCount', 0,
          'clientBatchId', p_client_batch_id,
          'conflictCount', 0,
          'duplicateSaleCount', jsonb_array_length(p_sales),
          'lineCount', v_line_count,
          'posSalesSyncBatchId', v_existing_batch.pos_sales_sync_batch_id,
          'saleCount', jsonb_array_length(p_sales),
          'status', 'duplicate'
        ),
        'sales', v_result_sales
      );
    end if;

    -- Lock every referenced catalog product and original sale/line in UUID order.
    -- This makes concurrent batches use one deterministic lock order.
    perform product.id
    from public.inventory_products product
    where product.id in (
      select distinct (line_item.value ->> 'productId')::uuid
      from jsonb_array_elements(p_sales) sale_item
      cross join lateral jsonb_array_elements(sale_item -> 'lines') line_item(value)
      where nullif(line_item.value ->> 'productId', '') is not null
    )
    order by product.id
    for update;

    perform original.pos_sale_id
    from public.pos_sales original
    where original.shop_id = p_shop_id
      and original.shop_device_id = p_shop_device_id
      and original.business_kind = 'sale'
      and original.client_sale_id in (
        select distinct sale_item ->> 'clientOriginalSaleId'
        from jsonb_array_elements(p_sales) sale_item
        where sale_item ->> 'businessKind' in ('refund', 'void')
      )
    order by original.pos_sale_id
    for update;

    perform original_line.pos_sale_line_id
    from public.pos_sale_lines original_line
    join public.pos_sales original
      on original.pos_sale_id = original_line.pos_sale_id
    where original.shop_id = p_shop_id
      and original.shop_device_id = p_shop_device_id
      and original.business_kind = 'sale'
      and original.client_sale_id in (
        select distinct sale_item ->> 'clientOriginalSaleId'
        from jsonb_array_elements(p_sales) sale_item
        where sale_item ->> 'businessKind' in ('refund', 'void')
      )
    order by original_line.pos_sale_line_id
    for update of original_line;

    -- Serialize overlapping sale identities before checking idempotency. Sorting
    -- prevents two multi-sale batches from taking advisory locks in opposite order.
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_shop_id::text || ':' || p_shop_device_id::text || ':'
          || sale_identity.client_sale_id,
        0
      )
    )
    from (
      select distinct sale_item ->> 'clientSaleId' as client_sale_id
      from jsonb_array_elements(p_sales) sale_item
      order by client_sale_id
    ) sale_identity;

    insert into public.pos_sales_sync_batches (
      shop_id,
      shop_code,
      shop_device_id,
      staff_id,
      pos_session_id,
      client_batch_id,
      idempotency_key,
      payload_hash,
      sale_count,
      line_count,
      status,
      conflict_count,
      metadata_redacted
    ) values (
      p_shop_id,
      p_shop_code,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_client_batch_id,
      p_idempotency_key,
      p_payload_hash,
      jsonb_array_length(p_sales),
      v_line_count,
      'accepted',
      0,
      coalesce(p_metadata_redacted, '{}'::jsonb)
        || jsonb_build_object('source', 'TASK-088', 'atomic_sales_rpc', true)
    )
    returning pos_sales_sync_batch_id into v_batch_id;

    for v_sale in select value from jsonb_array_elements(p_sales)
    loop
      v_client_sale_id := v_sale ->> 'clientSaleId';
      v_business_kind := v_sale ->> 'businessKind';
      v_client_original_sale_id := nullif(v_sale ->> 'clientOriginalSaleId', '');
      v_client_gross := (v_sale ->> 'grossAmountClp')::bigint;
      v_client_discount := (v_sale ->> 'discountAmountClp')::bigint;
      v_client_tax := (v_sale ->> 'taxAmountClp')::bigint;
      v_client_net := (v_sale ->> 'netAmountClp')::bigint;

      if v_business_kind not in ('sale', 'refund', 'void')
        or coalesce(v_client_sale_id, '') = ''
        or jsonb_typeof(v_sale -> 'lines') <> 'array'
        or jsonb_array_length(v_sale -> 'lines') < 1 then
        raise exception using errcode = 'P8801', message = 'validation_failed';
      end if;

      v_required_permission := case v_business_kind
        when 'sale' then 'pos.sell'
        when 'refund' then 'pos.refund'
        else 'pos.void'
      end;

      if not exists (
        select 1
        from public.staff_role_permissions permission
        where permission.shop_id = p_shop_id
          and permission.role_key = v_staff_role
          and permission.permission_key = v_required_permission
          and permission.enabled = true
      ) then
        raise exception using errcode = 'P8802', message = 'denied';
      end if;

      if not exists (
        select 1
        from public.staff_role_permissions permission
        where permission.shop_id = p_shop_id
          and permission.role_key = v_staff_role
          and permission.permission_key = 'pos.pay'
          and permission.enabled = true
      ) then
        raise exception using errcode = 'P8802', message = 'denied';
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended(
          p_shop_id::text || ':' || p_shop_device_id::text || ':' || v_client_sale_id,
          0
        )
      );

      select *
        into v_existing_sale
      from public.pos_sales existing
      where existing.shop_id = p_shop_id
        and existing.shop_device_id = p_shop_device_id
        and (
          existing.client_sale_id = v_client_sale_id
          or existing.idempotency_key = v_sale ->> 'idempotencyKey'
        )
      order by existing.created_at
      limit 1
      for update;

      if found then
        if v_existing_sale.payload_hash <> v_sale ->> 'payloadHash' then
          raise exception using errcode = 'P8803', message = 'conflict';
        end if;

        v_duplicate_count := v_duplicate_count + 1;
        v_result_sales := v_result_sales || jsonb_build_array(
          jsonb_build_object(
            'clientSaleId', v_client_sale_id,
            'posSaleId', v_existing_sale.pos_sale_id,
            'status', 'duplicate'
          )
        );
        continue;
      end if;

      v_authoritative_gross := 0;
      v_discount_line_total := 0;
      v_tax_line_total := 0;
      v_pending_reversal_quantities := '{}'::jsonb;
      v_pending_reversal_values := '{}'::jsonb;
      v_original_sale.pos_sale_id := null;

      if v_business_kind <> 'sale' then
        select *
          into v_original_sale
        from public.pos_sales original
        where original.shop_id = p_shop_id
          and original.shop_device_id = p_shop_device_id
          and original.client_sale_id = v_client_original_sale_id
          and original.business_kind = 'sale'
          and original.status = 'accepted'
        for update;

        if not found then
          raise exception using
            errcode = 'P8801',
            message = 'original_sale_invalid';
        end if;
      end if;

      for v_line in select value from jsonb_array_elements(v_sale -> 'lines')
      loop
        v_client_line_id := v_line ->> 'clientLineId';
        v_client_original_line_id := nullif(v_line ->> 'clientOriginalLineId', '');
        v_line_type := v_line ->> 'lineType';
        v_product_id := nullif(v_line ->> 'productId', '')::uuid;
        v_quantity := (v_line ->> 'quantity')::numeric(12,3);
        v_stock_quantity_delta := (v_line ->> 'stockQuantityDelta')::numeric(12,3);
        v_unit_amount_clp := (v_line ->> 'unitAmountClp')::bigint;
        v_line_amount_clp := (v_line ->> 'amountClp')::bigint;

        if coalesce(v_client_line_id, '') = ''
          or v_line_type not in ('item', 'discount', 'tax')
          or v_quantity <= 0
          or v_stock_quantity_delta <> (case
            when v_line_type <> 'item' then 0
            when v_business_kind = 'sale' then -v_quantity
            else v_quantity
          end) then
          raise exception using errcode = 'P8801', message = 'validation_failed';
        end if;

        if v_business_kind <> 'sale' and v_line_type <> 'item' then
          raise exception using
            errcode = 'P8801',
            message = 'reversal_non_item_line_not_allowed';
        end if;

        if v_line_type = 'discount' then
          v_discount_line_total := v_discount_line_total + abs(v_line_amount_clp);
          continue;
        end if;

        if v_line_type = 'tax' then
          v_tax_line_total := v_tax_line_total + abs(v_line_amount_clp);
          continue;
        end if;

        if v_product_id is null then
          raise exception using errcode = 'P8801', message = 'product_scope_mismatch';
        end if;

        if v_business_kind = 'sale' then
          select round(product.retail_price::numeric)::bigint
            into v_catalog_unit_amount_clp
          from public.inventory_products product
          where product.id = v_product_id
            and product.deleted_at is null
            and product.retail_price is not null
            and product.retail_price >= 0
            and (
              product.shop_id = p_shop_id
              or (
                product.shop_id is null
                and exists (
                  select 1
                  from public.shop_inventory_sources source
                  where source.shop_id = p_shop_id
                    and source.owner_user_id = product.owner_user_id
                    and source.mapping_state = 'mapped'
                    and source.disabled_at is null
                )
              )
            )
          for update;

          if not found then
            raise exception using errcode = 'P8801', message = 'product_scope_mismatch';
          end if;

          v_authoritative_line_amount_clp :=
            round(v_catalog_unit_amount_clp::numeric * v_quantity)::bigint;

          if v_unit_amount_clp is distinct from v_catalog_unit_amount_clp
            or abs(v_line_amount_clp) <> v_authoritative_line_amount_clp then
            raise exception using errcode = 'P8801', message = 'catalog_price_mismatch';
          end if;
        else
          select count(*)::integer,
                 (array_agg(candidate.pos_sale_line_id order by candidate.pos_sale_line_id))[1]
            into v_original_line_candidate_count,
                 v_original_line.pos_sale_line_id
          from public.pos_sale_lines candidate
          where candidate.pos_sale_id = v_original_sale.pos_sale_id
            and candidate.line_type = 'item'
            and candidate.product_id = v_product_id
            and (
              v_client_original_line_id is null
              or candidate.client_line_id = v_client_original_line_id
            );

          if v_original_line_candidate_count <> 1 then
            raise exception using errcode = 'P8801', message = 'original_line_ambiguous';
          end if;

          select *
            into v_original_line
          from public.pos_sale_lines original_line
          where original_line.pos_sale_line_id = v_original_line.pos_sale_line_id
          for update;

          if v_original_line.product_id is distinct from v_product_id
            or v_original_line.unit_amount_clp is null
            or v_original_line.amount_clp is null then
            raise exception using errcode = 'P8801', message = 'original_line_mismatch';
          end if;

          v_authoritative_line_amount_clp :=
            round(abs(v_original_line.unit_amount_clp)::numeric * v_quantity)::bigint;

          if v_unit_amount_clp <> abs(v_original_line.unit_amount_clp)
            or abs(v_line_amount_clp) <> v_authoritative_line_amount_clp then
            raise exception using errcode = 'P8801', message = 'original_line_value_mismatch';
          end if;

          select coalesce(sum(reversal_line.quantity), 0)::numeric(12,3),
                 coalesce(sum(abs(reversal_line.amount_clp)), 0)::bigint
            into v_already_reversed_quantity,
                 v_already_reversed_value_clp
          from public.pos_sale_lines reversal_line
          join public.pos_sales reversal
            on reversal.pos_sale_id = reversal_line.pos_sale_id
          where reversal_line.original_pos_sale_line_id = v_original_line.pos_sale_line_id
            and reversal.business_kind in ('refund', 'void')
            and reversal.status = 'accepted';

          select count(*)::integer
            into v_original_product_line_count
          from public.pos_sale_lines candidate
          where candidate.pos_sale_id = v_original_sale.pos_sale_id
            and candidate.line_type = 'item'
            and candidate.product_id = v_product_id;

          -- Backward compatibility for accepted reversals created before the FK
          -- existed. They consume residual only when the original product maps to
          -- exactly one line; otherwise allocation is ambiguous and fails closed.
          select coalesce(sum(reversal_line.quantity), 0)::numeric(12,3),
                 coalesce(sum(abs(reversal_line.amount_clp)), 0)::bigint,
                 count(*)::integer
            into v_historical_unbound_quantity,
                 v_historical_unbound_value_clp,
                 v_historical_unbound_count
          from public.pos_sale_lines reversal_line
          join public.pos_sales reversal
            on reversal.pos_sale_id = reversal_line.pos_sale_id
          where reversal.original_pos_sale_id = v_original_sale.pos_sale_id
            and reversal.business_kind in ('refund', 'void')
            and reversal.status = 'accepted'
            and reversal_line.original_pos_sale_line_id is null
            and reversal_line.line_type = 'item'
            and reversal_line.product_id = v_product_id;

          if v_historical_unbound_count > 0
            and v_original_product_line_count <> 1 then
            raise exception using
              errcode = 'P8801',
              message = 'historical_reversal_ambiguous';
          end if;

          v_already_reversed_quantity :=
            v_already_reversed_quantity + v_historical_unbound_quantity;
          v_already_reversed_value_clp :=
            v_already_reversed_value_clp + v_historical_unbound_value_clp;

          v_pending_reversal_quantity := coalesce(
            (v_pending_reversal_quantities ->> v_original_line.pos_sale_line_id::text)::numeric,
            0
          )::numeric(12,3);
          v_pending_reversal_value_clp := coalesce(
            (v_pending_reversal_values ->> v_original_line.pos_sale_line_id::text)::bigint,
            0
          );

          if v_pending_reversal_quantity > 0 then
            raise exception using
              errcode = 'P8801',
              message = 'duplicate_original_line_in_reversal';
          end if;

          if v_already_reversed_quantity
            + v_pending_reversal_quantity
            + v_quantity > v_original_line.quantity then
            raise exception using
              errcode = 'P8801',
              message = 'reversal_quantity_exceeds_residual';
          end if;

          if v_already_reversed_value_clp
            + v_pending_reversal_value_clp
            + v_authoritative_line_amount_clp
            > abs(v_original_line.amount_clp) then
            raise exception using
              errcode = 'P8801',
              message = 'reversal_value_exceeds_residual';
          end if;

          v_pending_reversal_quantities := jsonb_set(
            v_pending_reversal_quantities,
            array[v_original_line.pos_sale_line_id::text],
            to_jsonb(v_pending_reversal_quantity + v_quantity),
            true
          );
          v_pending_reversal_values := jsonb_set(
            v_pending_reversal_values,
            array[v_original_line.pos_sale_line_id::text],
            to_jsonb(v_pending_reversal_value_clp + v_authoritative_line_amount_clp),
            true
          );
        end if;

        v_authoritative_gross :=
          v_authoritative_gross + v_authoritative_line_amount_clp;
      end loop;

      if v_client_gross <> v_authoritative_gross
        or v_client_discount < 0
        or v_client_tax < 0
        or v_client_discount > v_authoritative_gross then
        raise exception using errcode = 'P8801', message = 'authoritative_gross_mismatch';
      end if;

      if v_business_kind = 'sale' then
        if v_client_net <> v_authoritative_gross - v_client_discount + v_client_tax
          or (v_discount_line_total > 0 and v_discount_line_total <> v_client_discount)
          or (v_tax_line_total > 0 and v_tax_line_total <> v_client_tax) then
          raise exception using errcode = 'P8801', message = 'authoritative_gross_mismatch';
        end if;

        if v_client_discount > 0 then
          select exists (
                   select 1
                   from public.staff_role_permissions permission
                   where permission.shop_id = p_shop_id
                     and permission.role_key = v_staff_role
                     and permission.permission_key = 'pos.discount'
                     and permission.enabled = true
                 ),
                 exists (
                   select 1
                   from public.staff_role_permissions permission
                   where permission.shop_id = p_shop_id
                     and permission.role_key = v_staff_role
                     and permission.permission_key = 'pos.discount_over_limit'
                     and permission.enabled = true
                 )
            into v_has_discount_permission,
                 v_has_discount_over_limit_permission;

          if not v_has_discount_permission then
            raise exception using errcode = 'P8802', message = 'pos.discount';
          end if;

          v_discount_cap_percent := v_max_discount_percent;
          v_discount_cap_clp :=
            floor(v_authoritative_gross::numeric * v_discount_cap_percent / 100)::bigint;

          if v_client_discount > v_discount_cap_clp
            and not v_has_discount_over_limit_permission then
            raise exception using
              errcode = 'P8802',
              message = 'pos.discount_over_limit';
          end if;
        end if;
      else
        -- Existing accepted reversals must themselves be economically coherent.
        -- Gross comes from their immutable item lines, never from caller headers.
        select coalesce(sum(economics.line_gross_clp), 0)::bigint,
               coalesce(sum(economics.discount_clp), 0)::bigint,
               coalesce(sum(economics.tax_clp), 0)::bigint,
               coalesce(
                 bool_or(
                   economics.header_gross_clp <> economics.line_gross_clp
                   or economics.discount_clp < 0
                   or economics.tax_clp < 0
                   or economics.discount_clp > economics.line_gross_clp
                   or economics.net_clp
                     <> -(economics.line_gross_clp
                       - economics.discount_clp
                       + economics.tax_clp)
                 ),
                 false
               )
          into v_already_reversed_sale_gross_clp,
               v_already_reversed_sale_discount_clp,
               v_already_reversed_sale_tax_clp,
               v_historical_reversal_economics_invalid
        from (
          select reversal.pos_sale_id,
                 coalesce(
                   sum(abs(reversal_line.amount_clp))
                     filter (where reversal_line.line_type = 'item'),
                   0
                 )::bigint as line_gross_clp,
                 coalesce(abs(reversal.gross_amount_clp), -1)::bigint
                   as header_gross_clp,
                 coalesce(reversal.discount_amount_clp, -1)::bigint
                   as discount_clp,
                 coalesce(reversal.tax_amount_clp, -1)::bigint as tax_clp,
                 coalesce(reversal.net_amount_clp, 1)::bigint as net_clp
          from public.pos_sales reversal
          left join public.pos_sale_lines reversal_line
            on reversal_line.pos_sale_id = reversal.pos_sale_id
          where reversal.original_pos_sale_id = v_original_sale.pos_sale_id
            and reversal.business_kind in ('refund', 'void')
            and reversal.status = 'accepted'
          group by
            reversal.pos_sale_id,
            reversal.gross_amount_clp,
            reversal.discount_amount_clp,
            reversal.tax_amount_clp,
            reversal.net_amount_clp
        ) economics;

        if v_original_sale.gross_amount_clp is null
          or v_original_sale.gross_amount_clp <= 0
          or v_original_sale.discount_amount_clp is null
          or v_original_sale.tax_amount_clp is null
          or v_original_sale.net_amount_clp is null
          or abs(v_original_sale.net_amount_clp)
            <> v_original_sale.gross_amount_clp
              - v_original_sale.discount_amount_clp
              + v_original_sale.tax_amount_clp then
          raise exception using
            errcode = 'P8801',
            message = 'original_sale_economics_invalid';
        end if;

        v_expected_prior_discount_clp := round(
          v_original_sale.discount_amount_clp::numeric
            * v_already_reversed_sale_gross_clp
            / v_original_sale.gross_amount_clp
        )::bigint;
        v_expected_prior_tax_clp := round(
          v_original_sale.tax_amount_clp::numeric
            * v_already_reversed_sale_gross_clp
            / v_original_sale.gross_amount_clp
        )::bigint;

        if v_historical_reversal_economics_invalid
          or v_already_reversed_sale_discount_clp
            <> v_expected_prior_discount_clp
          or v_already_reversed_sale_tax_clp <> v_expected_prior_tax_clp then
          raise exception using
            errcode = 'P8801',
            message = 'historical_reversal_economics_invalid';
        end if;

        if v_already_reversed_sale_gross_clp + v_authoritative_gross
          > v_original_sale.gross_amount_clp then
          raise exception using
            errcode = 'P8801',
            message = 'original_sale_value_exceeds_residual';
        end if;

        v_target_cumulative_discount_clp := round(
          v_original_sale.discount_amount_clp::numeric
            * (v_already_reversed_sale_gross_clp + v_authoritative_gross)
            / v_original_sale.gross_amount_clp
        )::bigint;
        v_target_cumulative_tax_clp := round(
          v_original_sale.tax_amount_clp::numeric
            * (v_already_reversed_sale_gross_clp + v_authoritative_gross)
            / v_original_sale.gross_amount_clp
        )::bigint;
        v_derived_reversal_discount_clp :=
          v_target_cumulative_discount_clp
            - v_already_reversed_sale_discount_clp;
        v_derived_reversal_tax_clp :=
          v_target_cumulative_tax_clp - v_already_reversed_sale_tax_clp;
        v_derived_reversal_net_clp := -(
          v_authoritative_gross
            - v_derived_reversal_discount_clp
            + v_derived_reversal_tax_clp
        );

        if v_client_discount <> v_derived_reversal_discount_clp
          or v_client_tax <> v_derived_reversal_tax_clp
          or v_client_net <> v_derived_reversal_net_clp
          or v_discount_line_total <> 0 then
          raise exception using
            errcode = 'P8801',
            message = 'reversal_economics_mismatch';
        end if;
      end if;

      v_sale_id := gen_random_uuid();
      insert into public.pos_sales (
        pos_sale_id,
        pos_sales_sync_batch_id,
        shop_id,
        shop_code,
        shop_device_id,
        staff_id,
        pos_session_id,
        client_sale_id,
        idempotency_key,
        payload_hash,
        sale_number,
        occurred_at,
        business_date,
        currency,
        subtotal,
        discount_total,
        tax_total,
        total,
        status,
        metadata_redacted,
        source_schema_version,
        business_kind,
        original_pos_sale_id,
        client_original_sale_id,
        reversal_reason_redacted,
        gross_amount_clp,
        discount_amount_clp,
        tax_amount_clp,
        net_amount_clp,
        paid_amount_clp,
        change_amount_clp,
        fiscal_status,
        fiscal_document_type,
        fiscal_document_number_redacted,
        fiscal_printed_at,
        stock_sync_status,
        stock_warning_count
      ) values (
        v_sale_id,
        v_batch_id,
        p_shop_id,
        p_shop_code,
        p_shop_device_id,
        p_staff_id,
        p_pos_session_id,
        v_client_sale_id,
        v_sale ->> 'idempotencyKey',
        v_sale ->> 'payloadHash',
        nullif(v_sale ->> 'saleNumber', ''),
        (v_sale ->> 'occurredAt')::timestamptz,
        nullif(v_sale ->> 'businessDate', '')::date,
        v_sale ->> 'currency',
        v_authoritative_gross,
        v_client_discount,
        v_client_tax,
        abs(v_client_net),
        'accepted',
        jsonb_build_object('source', 'TASK-088', 'atomic_sales_rpc', true),
        p_schema_version,
        v_business_kind,
        case when v_business_kind = 'sale' then null else v_original_sale.pos_sale_id end,
        v_client_original_sale_id,
        nullif(v_sale ->> 'reversalReasonRedacted', ''),
        v_authoritative_gross,
        v_client_discount,
        v_client_tax,
        v_client_net,
        nullif(v_sale ->> 'paidAmountClp', '')::bigint,
        (v_sale ->> 'changeAmountClp')::bigint,
        v_sale ->> 'fiscalStatus',
        nullif(v_sale ->> 'fiscalDocumentType', ''),
        nullif(v_sale ->> 'fiscalDocumentNumberRedacted', ''),
        nullif(v_sale ->> 'fiscalPrintedAt', '')::timestamptz,
        'not_applicable',
        0
      );

      v_stock_warning_count := 0;
      v_stock_has_applied := false;
      v_stock_has_conflict := false;

      for v_line in select value from jsonb_array_elements(v_sale -> 'lines')
      loop
        v_client_line_id := v_line ->> 'clientLineId';
        v_client_original_line_id := nullif(v_line ->> 'clientOriginalLineId', '');
        v_line_type := v_line ->> 'lineType';
        v_product_id := nullif(v_line ->> 'productId', '')::uuid;
        v_quantity := (v_line ->> 'quantity')::numeric(12,3);
        v_stock_quantity_delta := (v_line ->> 'stockQuantityDelta')::numeric(12,3);
        v_line_amount_clp := (v_line ->> 'amountClp')::bigint;
        v_original_line.pos_sale_line_id := null;

        if v_business_kind <> 'sale' and v_line_type = 'item' then
          select candidate.*
            into v_original_line
          from public.pos_sale_lines candidate
          where candidate.pos_sale_id = v_original_sale.pos_sale_id
            and candidate.line_type = 'item'
            and candidate.product_id = v_product_id
            and (
              v_client_original_line_id is null
              or candidate.client_line_id = v_client_original_line_id
            )
          order by candidate.pos_sale_line_id
          limit 1;
        end if;

        v_sale_line_id := gen_random_uuid();
        insert into public.pos_sale_lines (
          pos_sale_line_id,
          pos_sale_id,
          pos_sales_sync_batch_id,
          shop_id,
          client_line_id,
          line_position,
          product_id,
          item_number,
          barcode,
          product_name,
          quantity,
          unit_price,
          line_total,
          metadata_redacted,
          line_type,
          local_product_id,
          unit_amount_clp,
          amount_clp,
          stock_quantity_delta,
          stock_sync_status,
          original_pos_sale_line_id
        ) values (
          v_sale_line_id,
          v_sale_id,
          v_batch_id,
          p_shop_id,
          v_client_line_id,
          (v_line ->> 'linePosition')::integer,
          v_product_id,
          nullif(v_line ->> 'itemNumber', ''),
          nullif(v_line ->> 'barcode', ''),
          nullif(v_line ->> 'productName', ''),
          v_quantity,
          abs((v_line ->> 'unitAmountClp')::bigint),
          abs(v_line_amount_clp),
          jsonb_build_object('source', 'TASK-088', 'atomic_sales_rpc', true),
          v_line_type,
          nullif(v_line ->> 'localProductId', ''),
          (v_line ->> 'unitAmountClp')::bigint,
          v_line_amount_clp,
          v_stock_quantity_delta,
          'not_applicable',
          v_original_line.pos_sale_line_id
        );

        insert into public.pos_revenue_ledger_entries (
          pos_sale_id,
          pos_sales_sync_batch_id,
          shop_id,
          shop_device_id,
          staff_id,
          pos_session_id,
          business_date,
          occurred_at,
          currency,
          entry_type,
          amount_clp,
          quantity,
          client_entry_id,
          line_position,
          product_id,
          local_product_id,
          item_number,
          barcode,
          product_name,
          original_client_entry_id,
          metadata_redacted
        ) values (
          v_sale_id,
          v_batch_id,
          p_shop_id,
          p_shop_device_id,
          p_staff_id,
          p_pos_session_id,
          nullif(v_sale ->> 'businessDate', '')::date,
          (v_sale ->> 'occurredAt')::timestamptz,
          'CLP',
          case
            when v_line_type = 'discount' then 'discount'
            when v_line_type = 'tax' then 'tax'
            when v_business_kind = 'sale' then 'item'
            else 'refund_item'
          end,
          case
            when v_line_type = 'discount' then -abs(v_line_amount_clp)
            when v_line_type = 'tax' and v_business_kind <> 'sale' then -abs(v_line_amount_clp)
            when v_business_kind = 'sale' then abs(v_line_amount_clp)
            else -abs(v_line_amount_clp)
          end,
          v_quantity,
          'line:' || v_client_line_id,
          (v_line ->> 'linePosition')::integer,
          v_product_id,
          nullif(v_line ->> 'localProductId', ''),
          nullif(v_line ->> 'itemNumber', ''),
          nullif(v_line ->> 'barcode', ''),
          nullif(v_line ->> 'productName', ''),
          case
            when v_original_line.pos_sale_line_id is null then null
            else 'line:' || v_original_line.client_line_id
          end,
          jsonb_build_object('source', 'TASK-088')
        );

        select movement.status,
               movement.issue_code
          into v_stock_status,
               v_stock_issue_code
        from public.pos_apply_sale_stock_movement(
          p_shop_id,
          v_sale_id,
          v_sale_line_id,
          v_product_id,
          p_shop_id::text || ':' || p_shop_device_id::text || ':'
            || v_client_sale_id || ':' || v_client_line_id || ':'
            || case
              when v_stock_quantity_delta = 0 then 'no_stock'
              when v_business_kind = 'void' then 'void_reverse'
              when v_stock_quantity_delta < 0 then 'sale_decrement'
              else 'refund_increment'
            end,
          v_stock_quantity_delta,
          case
            when v_stock_quantity_delta = 0 then 'no_stock'
            when v_business_kind = 'void' then 'void_reverse'
            when v_stock_quantity_delta < 0 then 'sale_decrement'
            else 'refund_increment'
          end,
          jsonb_build_object('source', 'TASK-088', 'atomic_sales_rpc', true)
        ) movement;

        update public.pos_sale_lines
           set stock_sync_status = v_stock_status,
               stock_issue_code = v_stock_issue_code
         where pos_sale_line_id = v_sale_line_id;

        v_stock_has_applied := v_stock_has_applied or v_stock_status = 'applied';
        v_stock_has_conflict :=
          v_stock_has_conflict or v_stock_status = 'stock_conflict';
        if v_stock_status not in ('applied', 'not_applicable') then
          v_stock_warning_count := v_stock_warning_count + 1;
        end if;
      end loop;

      if v_discount_line_total = 0 and v_client_discount > 0 then
        insert into public.pos_revenue_ledger_entries (
          pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_device_id,
          staff_id, pos_session_id, business_date, occurred_at, currency,
          entry_type, amount_clp, client_entry_id, metadata_redacted
        ) values (
          v_sale_id, v_batch_id, p_shop_id, p_shop_device_id,
          p_staff_id, p_pos_session_id,
          nullif(v_sale ->> 'businessDate', '')::date,
          (v_sale ->> 'occurredAt')::timestamptz, 'CLP',
          'discount',
          case
            when v_business_kind = 'sale' then -abs(v_client_discount)
            else abs(v_client_discount)
          end,
          'summary:discount',
          jsonb_build_object('source', 'TASK-088')
        );
      end if;

      if not exists (
        select 1
        from jsonb_array_elements(v_sale -> 'lines') line_item
        where line_item ->> 'lineType' = 'tax'
      ) and v_client_tax > 0 then
        insert into public.pos_revenue_ledger_entries (
          pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_device_id,
          staff_id, pos_session_id, business_date, occurred_at, currency,
          entry_type, amount_clp, client_entry_id, metadata_redacted
        ) values (
          v_sale_id, v_batch_id, p_shop_id, p_shop_device_id,
          p_staff_id, p_pos_session_id,
          nullif(v_sale ->> 'businessDate', '')::date,
          (v_sale ->> 'occurredAt')::timestamptz, 'CLP',
          'tax', case when v_business_kind = 'sale' then v_client_tax else -v_client_tax end,
          'summary:tax', jsonb_build_object('source', 'TASK-088')
        );
      end if;

      for v_payment in select value from jsonb_array_elements(v_sale -> 'payments')
      loop
        insert into public.pos_revenue_ledger_entries (
          pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_device_id,
          staff_id, pos_session_id, business_date, occurred_at, currency,
          entry_type, payment_method, amount_clp, client_entry_id,
          metadata_redacted
        ) values (
          v_sale_id, v_batch_id, p_shop_id, p_shop_device_id,
          p_staff_id, p_pos_session_id,
          nullif(v_sale ->> 'businessDate', '')::date,
          (v_sale ->> 'occurredAt')::timestamptz, 'CLP',
          case when v_business_kind = 'sale' then 'payment' else 'refund_payment' end,
          v_payment ->> 'method',
          (v_payment ->> 'amountClp')::bigint,
          'payment:' || (v_payment ->> 'clientPaymentId'),
          jsonb_build_object('source', 'TASK-088')
        );

        if (v_payment ->> 'changeClp')::bigint > 0 then
          insert into public.pos_revenue_ledger_entries (
            pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_device_id,
            staff_id, pos_session_id, business_date, occurred_at, currency,
            entry_type, payment_method, amount_clp, client_entry_id,
            metadata_redacted
          ) values (
            v_sale_id, v_batch_id, p_shop_id, p_shop_device_id,
            p_staff_id, p_pos_session_id,
            nullif(v_sale ->> 'businessDate', '')::date,
            (v_sale ->> 'occurredAt')::timestamptz, 'CLP',
            'change', v_payment ->> 'method',
            -abs((v_payment ->> 'changeClp')::bigint),
            'change:' || (v_payment ->> 'clientPaymentId'),
            jsonb_build_object('source', 'TASK-088')
          );
        end if;
      end loop;

      if v_business_kind = 'void' then
        insert into public.pos_revenue_ledger_entries (
          pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_device_id,
          staff_id, pos_session_id, business_date, occurred_at, currency,
          entry_type, amount_clp, client_entry_id, original_client_entry_id,
          metadata_redacted
        ) values (
          v_sale_id, v_batch_id, p_shop_id, p_shop_device_id,
          p_staff_id, p_pos_session_id,
          nullif(v_sale ->> 'businessDate', '')::date,
          (v_sale ->> 'occurredAt')::timestamptz, 'CLP',
          'void_marker', 0, 'void:' || v_client_sale_id,
          v_client_original_sale_id,
          jsonb_build_object('source', 'TASK-088')
        );
      end if;

      update public.pos_sales
         set stock_warning_count = v_stock_warning_count,
             stock_sync_status = case
               when v_stock_has_conflict then 'stock_conflict'
               when v_stock_warning_count > 0 then 'stock_warning'
               when v_stock_has_applied then 'applied'
               else 'not_applicable'
             end
       where pos_sale_id = v_sale_id;

      v_accepted_count := v_accepted_count + 1;
      v_result_sales := v_result_sales || jsonb_build_array(
        jsonb_build_object(
          'clientSaleId', v_client_sale_id,
          'posSaleId', v_sale_id,
          'status', 'accepted'
        )
      );
    end loop;

    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'batch', jsonb_build_object(
        'acceptedSaleCount', v_accepted_count,
        'clientBatchId', p_client_batch_id,
        'conflictCount', 0,
        'duplicateSaleCount', v_duplicate_count,
        'lineCount', v_line_count,
        'posSalesSyncBatchId', v_batch_id,
        'saleCount', jsonb_array_length(p_sales),
        'status', 'accepted'
      ),
      'sales', v_result_sales
    );
  exception
    when sqlstate 'P8801' then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    when sqlstate 'P8802' then
      return jsonb_build_object('ok', false, 'code', 'denied');
    when sqlstate 'P8803' or unique_violation then
      return jsonb_build_object('ok', false, 'code', 'conflict');
    when others then
      return jsonb_build_object('ok', false, 'code', 'db_failure');
  end;
end;
$$;

revoke all on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) from public;
revoke all on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) from anon;
revoke all on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) from authenticated;
grant execute on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
