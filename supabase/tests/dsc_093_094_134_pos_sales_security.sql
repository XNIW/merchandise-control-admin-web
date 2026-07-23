begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select set_config('request.jwt.claim.role', 'service_role', true);

select plan(38);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000093',
  'authenticated', 'authenticated', 'dsc093-owner@example.invalid',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000093',
  'DSC093',
  'DSC-093/094/134 security test shop',
  'active'
);

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_status, credential_version, must_change_credential,
  max_discount_percent
) values
  (
    '30000000-0000-4000-8000-000000000093',
    '10000000-0000-4000-8000-000000000093',
    'DSC093ADMIN', 'DSC POS manager', 'manager', 'active',
    'pin', '$scrypt-v1$pgTAP-fixture-not-a-real-credential', now(),
    'active', 1, false, 10
  ),
  (
    '30000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093',
    'DSC093CASH', 'DSC cashier', 'cashier', 'active',
    'pin', '$scrypt-v1$pgTAP-fixture-not-a-real-credential', now(),
    'active', 1, false, 10
  );

insert into public.shop_devices (
  shop_device_id, shop_id, device_identifier, device_type, display_name, status
) values
  (
    '40000000-0000-4000-8000-000000000093',
    '10000000-0000-4000-8000-000000000093',
    'DSC093-ADMIN-DEVICE', 'pos', 'DSC admin device', 'active'
  ),
  (
    '40000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093',
    'DSC093-CASH-DEVICE', 'pos', 'DSC cashier device', 'active'
  );

insert into public.pos_device_credentials (
  pos_device_credential_id, shop_id, shop_device_id, staff_id, token_hash,
  staff_credential_version, status, issued_at, expires_at
) values
  (
    '50000000-0000-4000-8000-000000000093',
    '10000000-0000-4000-8000-000000000093',
    '40000000-0000-4000-8000-000000000093',
    '30000000-0000-4000-8000-000000000093',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1, 'active', now() - interval '1 hour', now() + interval '1 day'
  ),
  (
    '50000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093',
    '40000000-0000-4000-8000-000000000094',
    '30000000-0000-4000-8000-000000000094',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1, 'active', now() - interval '1 hour', now() + interval '1 day'
  );

insert into public.pos_sessions (
  pos_session_id, shop_id, shop_device_id, staff_id,
  pos_device_credential_id, session_token_hash, staff_credential_version,
  status, issued_at, expires_at
) values
  (
    '60000000-0000-4000-8000-000000000093',
    '10000000-0000-4000-8000-000000000093',
    '40000000-0000-4000-8000-000000000093',
    '30000000-0000-4000-8000-000000000093',
    '50000000-0000-4000-8000-000000000093',
    'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    1, 'active', now() - interval '30 minutes', now() + interval '8 hours'
  ),
  (
    '60000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093',
    '40000000-0000-4000-8000-000000000094',
    '30000000-0000-4000-8000-000000000094',
    '50000000-0000-4000-8000-000000000094',
    'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    1, 'active', now() - interval '30 minutes', now() + interval '8 hours'
  );

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values
  ('10000000-0000-4000-8000-000000000093', 'manager', 'pos.sell', true),
  ('10000000-0000-4000-8000-000000000093', 'manager', 'pos.pay', true),
  ('10000000-0000-4000-8000-000000000093', 'manager', 'pos.refund', true),
  ('10000000-0000-4000-8000-000000000093', 'manager', 'pos.void', true),
  ('10000000-0000-4000-8000-000000000093', 'manager', 'pos.discount', true),
  ('10000000-0000-4000-8000-000000000093', 'cashier', 'pos.sell', true),
  ('10000000-0000-4000-8000-000000000093', 'cashier', 'pos.pay', true)
on conflict (shop_id, role_key, permission_key)
do update set enabled = excluded.enabled;

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name,
  retail_price, stock_quantity
) values
  (
    '20000000-0000-4000-8000-000000000093',
    '00000000-0000-4000-8000-000000000093',
    '10000000-0000-4000-8000-000000000093',
    'DSC093-P100', 'DSC product 100', 100, 100
  ),
  (
    '20000000-0000-4000-8000-000000000094',
    '00000000-0000-4000-8000-000000000093',
    '10000000-0000-4000-8000-000000000093',
    'DSC093-P200', 'DSC product 200', 200, 100
  );

create or replace function pg_temp.dsc_line(
  p_client_line_id text,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_clp bigint,
  p_amount_clp bigint,
  p_stock_delta numeric,
  p_client_original_line_id text default null,
  p_line_type text default 'item'
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'clientLineId', p_client_line_id,
    'clientOriginalLineId', p_client_original_line_id,
    'lineType', p_line_type,
    'linePosition', 1,
    'productId', p_product_id,
    'quantity', p_quantity,
    'stockQuantityDelta', p_stock_delta,
    'unitAmountClp', p_unit_clp,
    'amountClp', p_amount_clp,
    'unitPrice', abs(p_unit_clp),
    'lineTotal', abs(p_amount_clp)
  );
$$;

create or replace function pg_temp.dsc_sale(
  p_client_sale_id text,
  p_kind text,
  p_original_sale_id text,
  p_lines jsonb,
  p_gross bigint,
  p_discount bigint,
  p_tax bigint,
  p_net bigint,
  p_payment_method text default 'cash'
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'clientSaleId', p_client_sale_id,
    'clientOriginalSaleId', p_original_sale_id,
    'idempotencyKey', p_client_sale_id,
    'payloadHash', 'sha256:' || repeat('e', 64),
    'businessKind', p_kind,
    'occurredAt', now(),
    'businessDate', current_date,
    'currency', 'CLP',
    'grossAmountClp', p_gross,
    'discountAmountClp', p_discount,
    'taxAmountClp', p_tax,
    'netAmountClp', p_net,
    'paidAmountClp', p_net,
    'changeAmountClp', 0,
    'subtotal', p_gross,
    'discountTotal', p_discount,
    'taxTotal', p_tax,
    'total', abs(p_net),
    'fiscalStatus', case when p_kind = 'void' then 'voided' else 'not_required' end,
    'lines', p_lines,
    'payments', jsonb_build_array(jsonb_build_object(
      'clientPaymentId', 'payment-' || p_client_sale_id,
      'method', p_payment_method,
      'amountClp', p_net,
      'changeClp', 0
    ))
  );
$$;

create or replace function pg_temp.dsc_apply(
  p_batch text,
  p_staff_id uuid,
  p_session_id uuid,
  p_sales jsonb
)
returns jsonb
language sql
as $$
  select public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000093',
    'DSC093',
    session_row.shop_device_id,
    p_staff_id,
    p_session_id,
    p_batch,
    p_batch,
    'sha256:' || repeat('f', 64),
    'pos-sales-ledger-v2',
    p_sales,
    jsonb_build_object('source', 'pgTAP')
  )
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_session_id;
$$;

select is(
  has_function_privilege(
    'service_role',
    'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ), true, 'service_role can execute the atomic RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ), false, 'authenticated cannot execute the atomic RPC'
);
select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid =
      'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the atomic RPC'
);

select is(
  (
    pg_temp.dsc_apply(
      'cashier-discount',
      '30000000-0000-4000-8000-000000000094',
      '60000000-0000-4000-8000-000000000094',
      jsonb_build_array(pg_temp.dsc_sale(
        'cashier-discount-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'cashier-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 10, 0, 90
      ))
    ) ->> 'code'
  ), 'denied', 'cashier discount denied'
);

update public.staff_role_permissions
set enabled = false
where shop_id = '10000000-0000-4000-8000-000000000093'
  and role_key = 'manager'
  and permission_key = 'pos.sell';
select is(
  (
    pg_temp.dsc_apply(
      'disabled-sell',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'disabled-sell-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'disabled-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ), 'denied', 'disabled role permission denied'
);
update public.staff_role_permissions
set enabled = true
where shop_id = '10000000-0000-4000-8000-000000000093'
  and role_key = 'manager'
  and permission_key = 'pos.sell';

select is(
  (
    pg_temp.dsc_apply(
      'within-cap',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'within-cap-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'within-cap-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 10, 0, 90
      ))
    ) ->> 'code'
  ), 'success', 'discount within cap accepted'
);
select is(
  (
    pg_temp.dsc_apply(
      'over-cap',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'over-cap-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'over-cap-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 15, 0, 85
      ))
    ) ->> 'code'
  ), 'denied', 'discount over cap denied'
);
insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000093',
  'manager', 'pos.discount_over_limit', true
);
select is(
  (
    pg_temp.dsc_apply(
      'over-limit-authorized',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'over-limit-authorized-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'over-limit-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 15, 0, 85
      ))
    ) ->> 'code'
  ), 'success', 'over-limit permission accepted'
);

select is(
  (
    pg_temp.dsc_apply(
      'catalog-mismatch',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'catalog-mismatch-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'catalog-mismatch-line', '20000000-0000-4000-8000-000000000093',
          1, 99, 99, -1
        )), 99, 0, 0, 99
      ))
    ) ->> 'code'
  ), 'validation_failed', 'catalog price mismatch denied'
);

select is(
  (
    pg_temp.dsc_apply(
      'payment-change-mismatch',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(
        jsonb_set(
          pg_temp.dsc_sale(
            'payment-change-mismatch-sale', 'sale', null,
            jsonb_build_array(pg_temp.dsc_line(
              'payment-change-mismatch-line',
              '20000000-0000-4000-8000-000000000093',
              1, 100, 100, -1
            )), 100, 0, 0, 100
          ),
          '{changeAmountClp}',
          '7'::jsonb
        )
      )
    ) ->> 'code'
  ),
  'validation_failed',
  'payment header and ledger change mismatch denied before sinks'
);

-- Original sale with discount/tax: each half reversal must derive 10/5/-95.
insert into public.pos_sales_sync_batches (
  pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id, staff_id,
  pos_session_id, client_batch_id, idempotency_key, payload_hash,
  sale_count, line_count, status
) values (
  '70000000-0000-4000-8000-000000000093',
  '10000000-0000-4000-8000-000000000093', 'DSC093',
  '40000000-0000-4000-8000-000000000093',
  '30000000-0000-4000-8000-000000000093',
  '60000000-0000-4000-8000-000000000093',
  'original-batch', 'original-batch',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  1, 1, 'accepted'
);
insert into public.pos_sales (
  pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id,
  staff_id, pos_session_id, client_sale_id, idempotency_key, payload_hash,
  occurred_at, business_date, subtotal, discount_total, tax_total, total,
  status, source_schema_version, business_kind, gross_amount_clp,
  discount_amount_clp, tax_amount_clp, net_amount_clp, paid_amount_clp,
  fiscal_status
) values (
  '80000000-0000-4000-8000-000000000093',
  '70000000-0000-4000-8000-000000000093',
  '10000000-0000-4000-8000-000000000093', 'DSC093',
  '40000000-0000-4000-8000-000000000093',
  '30000000-0000-4000-8000-000000000093',
  '60000000-0000-4000-8000-000000000093',
  'original-sale', 'original-sale',
  'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  now() - interval '1 day', current_date - 1, 200, 20, 10, 190,
  'accepted', 'pos-sales-ledger-v2', 'sale', 200, 20, 10, 190, 190,
  'not_required'
);
insert into public.pos_sale_lines (
  pos_sale_line_id, pos_sale_id, pos_sales_sync_batch_id, shop_id,
  client_line_id, line_position, product_id, quantity, unit_price, line_total,
  line_type, unit_amount_clp, amount_clp, stock_quantity_delta
) values (
  '90000000-0000-4000-8000-000000000093',
  '80000000-0000-4000-8000-000000000093',
  '70000000-0000-4000-8000-000000000093',
  '10000000-0000-4000-8000-000000000093',
  'original-line', 1, '20000000-0000-4000-8000-000000000093',
  2, 100, 200, 'item', 100, 200, -2
);

select is(
  (
    pg_temp.dsc_apply(
      'duplicate-original-lines',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'duplicate-original-lines-sale', 'refund', 'original-sale',
        jsonb_build_array(
          pg_temp.dsc_line(
            'duplicate-refund-1', '20000000-0000-4000-8000-000000000093',
            1, 100, -100, 1, 'original-line'
          ),
          pg_temp.dsc_line(
            'duplicate-refund-2', '20000000-0000-4000-8000-000000000093',
            1, 100, -100, 1, 'original-line'
          ) || jsonb_build_object('linePosition', 2)
        ), 200, 20, 10, -190
      ))
    ) ->> 'code'
  ), 'validation_failed', 'duplicate lines same original denied'
);

select is(
  (
    pg_temp.dsc_apply(
      'refund-economics-mismatch',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'refund-economics-mismatch-sale', 'refund', 'original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'refund-economics-line', '20000000-0000-4000-8000-000000000093',
          1, 100, -100, 1, 'original-line'
        )), 100, 0, 0, -100
      ))
    ) ->> 'code'
  ), 'validation_failed', 'legacy Win gross-only reversal payload rejected'
);

select is(
  (
    pg_temp.dsc_apply(
      'first-refund',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'first-refund-sale', 'refund', 'original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'first-refund-line', '20000000-0000-4000-8000-000000000093',
          1, 100, -100, 1, 'original-line'
        )), 100, 10, 5, -95
      ))
    ) ->> 'code'
  ), 'success', 'corrected Win item-only proportional reversal accepted'
);
select ok(
  exists (
    select 1
    from public.pos_sales reversal
    join public.pos_sale_lines reversal_line
      on reversal_line.pos_sale_id = reversal.pos_sale_id
    where reversal.client_sale_id = 'first-refund-sale'
      and reversal.business_kind = 'refund'
      and reversal.client_original_sale_id = 'original-sale'
      and reversal.gross_amount_clp = 100
      and reversal.discount_amount_clp = 10
      and reversal.tax_amount_clp = 5
      and reversal.net_amount_clp = -95
      and reversal_line.line_type = 'item'
      and reversal_line.original_pos_sale_line_id =
        '90000000-0000-4000-8000-000000000093'
    group by reversal.pos_sale_id
    having count(*) = 1
  ),
  'corrected Win reversal persists one bound item and proportional headers'
);
select is(
  (
    select sum(entry.amount_clp)::bigint
    from public.pos_revenue_ledger_entries entry
    join public.pos_sales sale
      on sale.pos_sale_id = entry.pos_sale_id
    where sale.client_sale_id = 'first-refund-sale'
      and entry.entry_type in ('refund_item', 'discount', 'tax')
  ),
  -95::bigint,
  'corrected Win reversal ledger matches proportional net'
);
select is(
  (
    pg_temp.dsc_apply(
      'second-over-refund',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'second-over-refund-sale', 'refund', 'original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'second-over-refund-line', '20000000-0000-4000-8000-000000000093',
          2, 100, -200, 2, 'original-line'
        )), 200, 10, 5, -195
      ))
    ) ->> 'code'
  ), 'validation_failed', 'cumulative second refund denied'
);

-- Historical unbound fixture consumes one of two units.
insert into public.pos_sales_sync_batches (
  pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id, staff_id,
  pos_session_id, client_batch_id, idempotency_key, payload_hash,
  sale_count, line_count, status
) values
  (
    '70000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093', 'DSC093',
    '40000000-0000-4000-8000-000000000093',
    '30000000-0000-4000-8000-000000000093',
    '60000000-0000-4000-8000-000000000093',
    'historical-original-batch', 'historical-original-batch',
    'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    1, 1, 'accepted'
  ),
  (
    '70000000-0000-4000-8000-000000000095',
    '10000000-0000-4000-8000-000000000093', 'DSC093',
    '40000000-0000-4000-8000-000000000093',
    '30000000-0000-4000-8000-000000000093',
    '60000000-0000-4000-8000-000000000093',
    'historical-refund-batch', 'historical-refund-batch',
    'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    1, 1, 'accepted'
  );
insert into public.pos_sales (
  pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id,
  staff_id, pos_session_id, client_sale_id, idempotency_key, payload_hash,
  occurred_at, business_date, subtotal, discount_total, tax_total, total,
  status, source_schema_version, business_kind, original_pos_sale_id,
  client_original_sale_id, gross_amount_clp, discount_amount_clp,
  tax_amount_clp, net_amount_clp, paid_amount_clp, fiscal_status
) values
  (
    '80000000-0000-4000-8000-000000000094',
    '70000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093', 'DSC093',
    '40000000-0000-4000-8000-000000000093',
    '30000000-0000-4000-8000-000000000093',
    '60000000-0000-4000-8000-000000000093',
    'historical-original-sale', 'historical-original-sale',
    'sha256:5555555555555555555555555555555555555555555555555555555555555555',
    now() - interval '2 days', current_date - 2, 400, 0, 0, 400,
    'accepted', 'pos-sales-ledger-v2', 'sale', null, null,
    400, 0, 0, 400, 400, 'not_required'
  ),
  (
    '80000000-0000-4000-8000-000000000095',
    '70000000-0000-4000-8000-000000000095',
    '10000000-0000-4000-8000-000000000093', 'DSC093',
    '40000000-0000-4000-8000-000000000093',
    '30000000-0000-4000-8000-000000000093',
    '60000000-0000-4000-8000-000000000093',
    'historical-refund-sale', 'historical-refund-sale',
    'sha256:6666666666666666666666666666666666666666666666666666666666666666',
    now() - interval '1 day', current_date - 1, 200, 0, 0, 200,
    'accepted', 'pos-sales-ledger-v2', 'refund',
    '80000000-0000-4000-8000-000000000094', 'historical-original-sale',
    200, 0, 0, -200, -200, 'not_required'
  );
insert into public.pos_sale_lines (
  pos_sale_line_id, pos_sale_id, pos_sales_sync_batch_id, shop_id,
  client_line_id, line_position, product_id, quantity, unit_price, line_total,
  line_type, unit_amount_clp, amount_clp, stock_quantity_delta,
  original_pos_sale_line_id
) values
  (
    '90000000-0000-4000-8000-000000000094',
    '80000000-0000-4000-8000-000000000094',
    '70000000-0000-4000-8000-000000000094',
    '10000000-0000-4000-8000-000000000093',
    'historical-original-line', 1,
    '20000000-0000-4000-8000-000000000094',
    2, 200, 400, 'item', 200, 400, -2, null
  ),
  (
    '90000000-0000-4000-8000-000000000095',
    '80000000-0000-4000-8000-000000000095',
    '70000000-0000-4000-8000-000000000095',
    '10000000-0000-4000-8000-000000000093',
    'historical-unbound-refund-line', 1,
    '20000000-0000-4000-8000-000000000094',
    1, 200, 200, 'item', 200, -200, 1, null
  );
select is(
  (
    pg_temp.dsc_apply(
      'historical-over-refund',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'historical-over-refund-sale', 'refund', 'historical-original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'historical-over-refund-line',
          '20000000-0000-4000-8000-000000000094',
          2, 200, -400, 2, 'historical-original-line'
        )), 400, 0, 0, -400
      ))
    ) ->> 'code'
  ), 'validation_failed', 'historical unbound reversal consumes residual'
);

-- Ambiguous historical unbound rows fail closed (static fixture mutation).
insert into public.pos_sale_lines (
  pos_sale_line_id, pos_sale_id, pos_sales_sync_batch_id, shop_id,
  client_line_id, line_position, product_id, quantity, unit_price, line_total,
  line_type, unit_amount_clp, amount_clp, stock_quantity_delta
) values (
  '90000000-0000-4000-8000-000000000096',
  '80000000-0000-4000-8000-000000000094',
  '70000000-0000-4000-8000-000000000094',
  '10000000-0000-4000-8000-000000000093',
  'historical-original-line-duplicate', 2,
  '20000000-0000-4000-8000-000000000094',
  1, 200, 200, 'item', 200, 200, -1
);
select is(
  (
    pg_temp.dsc_apply(
      'historical-ambiguous',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'historical-ambiguous-sale', 'refund', 'historical-original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'historical-ambiguous-line',
          '20000000-0000-4000-8000-000000000094',
          1, 200, -200, 1, 'historical-original-line'
        )), 200, 0, 0, -200
      ))
    ) ->> 'code'
  ), 'validation_failed', 'historical unbound ambiguity denied'
);

update public.shop_devices
set status = 'revoked', revoked_at = now()
where shop_device_id = '40000000-0000-4000-8000-000000000093';
select is(
  (
    pg_temp.dsc_apply(
      'revoked-device',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'revoked-device-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'revoked-device-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ), 'denied', 'revoked device denied'
);
update public.shop_devices
set status = 'active', revoked_at = null
where shop_device_id = '40000000-0000-4000-8000-000000000093';
update public.pos_device_credentials
set status = 'active', revoked_at = null, revoked_reason = null
where pos_device_credential_id = '50000000-0000-4000-8000-000000000093';
update public.pos_sessions
set status = 'active', revoked_at = null, revoked_reason = null,
    expires_at = now() + interval '8 hours'
where pos_session_id = '60000000-0000-4000-8000-000000000093';

update public.pos_device_credentials
set status = 'revoked', revoked_at = now()
where pos_device_credential_id = '50000000-0000-4000-8000-000000000093';
select is(
  (
    pg_temp.dsc_apply(
      'revoked-credential',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'revoked-credential-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'revoked-credential-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ), 'denied', 'revoked credential denied'
);
update public.pos_device_credentials
set status = 'active', revoked_at = null, revoked_reason = null
where pos_device_credential_id = '50000000-0000-4000-8000-000000000093';

update public.staff_accounts
set session_invalidated_at = now()
where staff_id = '30000000-0000-4000-8000-000000000093';
select is(
  (
    pg_temp.dsc_apply(
      'invalidated-session',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'invalidated-session-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'invalidated-session-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ), 'denied', 'session invalidation denied'
);
update public.staff_accounts
set session_invalidated_at = null
where staff_id = '30000000-0000-4000-8000-000000000093';

create temporary table dsc_sink_before as
select
  (select count(*) from public.pos_sales_sync_batches) as batches,
  (select count(*) from public.pos_sales) as sales,
  (select count(*) from public.pos_sale_lines) as lines,
  (select count(*) from public.pos_revenue_ledger_entries) as ledger,
  (select count(*) from public.pos_sale_stock_movements) as movements,
  (select stock_quantity from public.inventory_products
    where id = '20000000-0000-4000-8000-000000000093') as stock;
select is(
  (
    pg_temp.dsc_apply(
      'sink-failure',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(jsonb_set(
        pg_temp.dsc_sale(
          'sink-failure-sale', 'sale', null,
          jsonb_build_array(pg_temp.dsc_line(
            'sink-failure-line', '20000000-0000-4000-8000-000000000093',
            1, 100, 100, -1
          )), 100, 0, 0, 100
        ),
        '{fiscalStatus}',
        '"invalid_sink_status"'::jsonb
      ))
    ) ->> 'code'
  ), 'db_failure', 'sink constraint failure returns db_failure'
);
select ok(
  (
    select before.batches = (select count(*) from public.pos_sales_sync_batches)
      and before.sales = (select count(*) from public.pos_sales)
      and before.lines = (select count(*) from public.pos_sale_lines)
      and before.ledger = (select count(*) from public.pos_revenue_ledger_entries)
      and before.movements = (select count(*) from public.pos_sale_stock_movements)
      and before.stock = (
        select stock_quantity from public.inventory_products
        where id = '20000000-0000-4000-8000-000000000093'
      )
    from dsc_sink_before before
  ),
  'failed batch rolls back every sink'
);

select is(
  (
    pg_temp.dsc_apply(
      'within-cap',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'within-cap-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'within-cap-line', '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 10, 0, 90
      ))
    ) -> 'batch' ->> 'status'
  ), 'duplicate', 'idempotent retry is duplicate'
);

create temporary table task137_pos_sink_before as
select
  (select count(*) from public.pos_sales_sync_batches) as batches,
  (select count(*) from public.pos_sales) as sales,
  (select count(*) from public.pos_sale_lines) as lines,
  (select count(*) from public.pos_revenue_ledger_entries) as ledger,
  (select count(*) from public.pos_sale_stock_movements) as movements,
  (select stock_quantity from public.inventory_products
    where id = '20000000-0000-4000-8000-000000000093') as stock;

select is(
  (
    pg_temp.dsc_apply(
      'task137-mixed-sale',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(
        jsonb_set(
          pg_temp.dsc_sale(
            'task137-mixed-sale-row', 'sale', null,
            jsonb_build_array(pg_temp.dsc_line(
              'task137-mixed-sale-line',
              '20000000-0000-4000-8000-000000000093',
              1, 100, 100, -1
            )), 100, 0, 0, 100
          ),
          '{payments}',
          jsonb_build_array(
            jsonb_build_object(
              'clientPaymentId', 'task137-mixed-sale-cash',
              'method', 'cash',
              'amountClp', -900,
              'changeClp', 0
            ),
            jsonb_build_object(
              'clientPaymentId', 'task137-mixed-sale-card',
              'method', 'card',
              'amountClp', 1000,
              'changeClp', 0
            )
          )
        )
      )
    ) ->> 'code'
  ),
  'validation_failed',
  'TASK-137 sale with mixed-sign tenders is denied before sinks'
);

select is(
  (
    pg_temp.dsc_apply(
      'task137-positive-refund',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              pg_temp.dsc_sale(
                'task137-positive-refund-row', 'refund', 'original-sale',
                jsonb_build_array(pg_temp.dsc_line(
                  'task137-positive-refund-line',
                  '20000000-0000-4000-8000-000000000093',
                  1, 100, -100, 1, 'original-line'
                )), 100, 10, 5, -95
              ),
              '{paidAmountClp}',
              '100'::jsonb
            ),
            '{changeAmountClp}',
            '195'::jsonb
          ),
          '{payments}',
          jsonb_build_array(jsonb_build_object(
            'clientPaymentId', 'task137-positive-refund-cash',
            'method', 'cash',
            'amountClp', 100,
            'changeClp', 195
          ))
        )
      )
    ) ->> 'code'
  ),
  'validation_failed',
  'TASK-137 refund cannot use positive tender and compensating change'
);

select is(
  (
    pg_temp.dsc_apply(
      'task137-mixed-void',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(
        jsonb_set(
          pg_temp.dsc_sale(
            'task137-mixed-void-row', 'void', 'original-sale',
            jsonb_build_array(pg_temp.dsc_line(
              'task137-mixed-void-line',
              '20000000-0000-4000-8000-000000000093',
              1, 100, -100, 1, 'original-line'
            )), 100, 10, 5, -95
          ),
          '{payments}',
          jsonb_build_array(
            jsonb_build_object(
              'clientPaymentId', 'task137-mixed-void-cash',
              'method', 'cash',
              'amountClp', -100,
              'changeClp', 0
            ),
            jsonb_build_object(
              'clientPaymentId', 'task137-mixed-void-card',
              'method', 'card',
              'amountClp', 5,
              'changeClp', 0
            )
          )
        )
      )
    ) ->> 'code'
  ),
  'validation_failed',
  'TASK-137 void with a positive tender component is denied before sinks'
);

update public.staff_role_permissions
set enabled = false
where shop_id = '10000000-0000-4000-8000-000000000093'
  and role_key = 'manager'
  and permission_key = 'pos.pay';
select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-disabled',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-disabled-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-disabled-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ),
  'denied',
  'TASK-137 disabled pos.pay permission denies a valid sale'
);

select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-disabled-refund',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-disabled-refund-row', 'refund', 'original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-disabled-refund-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, -100, 1, 'original-line'
        )), 100, 10, 5, -95
      ))
    ) ->> 'code'
  ),
  'denied',
  'TASK-137 disabled pos.pay permission denies a direction-valid refund'
);

select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-disabled-void',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-disabled-void-row', 'void', 'original-sale',
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-disabled-void-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, -100, 1, 'original-line'
        )), 100, 10, 5, -95
      ))
    ) ->> 'code'
  ),
  'denied',
  'TASK-137 disabled pos.pay permission denies a direction-valid void'
);

delete from public.staff_role_permissions
where shop_id = '10000000-0000-4000-8000-000000000093'
  and role_key = 'manager'
  and permission_key = 'pos.pay';
select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-missing',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-missing-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-missing-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ),
  'denied',
  'TASK-137 missing pos.pay permission fails closed'
);

select ok(
  (
    select before.batches = (select count(*) from public.pos_sales_sync_batches)
      and before.sales = (select count(*) from public.pos_sales)
      and before.lines = (select count(*) from public.pos_sale_lines)
      and before.ledger = (select count(*) from public.pos_revenue_ledger_entries)
      and before.movements = (select count(*) from public.pos_sale_stock_movements)
      and before.stock = (
        select stock_quantity from public.inventory_products
        where id = '20000000-0000-4000-8000-000000000093'
      )
    from task137_pos_sink_before before
  ),
  'TASK-137 direction and payment-permission denials leave every sink unchanged'
);

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000093',
  'manager',
  'pos.pay',
  true
);
select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-enabled',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-enabled-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-enabled-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ),
  'success',
  'TASK-137 enabled operation and pos.pay permissions accept the sale'
);

select is(
  (
    select count(*)
    from public.pos_revenue_ledger_entries entry
    join public.pos_sales sale
      on sale.pos_sale_id = entry.pos_sale_id
    where sale.client_sale_id = 'task137-pay-enabled-sale'
      and entry.entry_type = 'payment'
      and entry.amount_clp = 100
  ),
  1::bigint,
  'TASK-137 accepted sale writes exactly one positive payment ledger entry'
);

update public.staff_role_permissions
set enabled = false
where shop_id = '10000000-0000-4000-8000-000000000093'
  and role_key = 'manager'
  and permission_key = 'pos.pay';
select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-enabled',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-enabled-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-enabled-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) ->> 'code'
  ),
  'denied',
  'TASK-137 revoked pos.pay denies replay before idempotency lookup'
);

update public.staff_role_permissions
set enabled = true
where shop_id = '10000000-0000-4000-8000-000000000093'
  and role_key = 'manager'
  and permission_key = 'pos.pay';
select is(
  (
    pg_temp.dsc_apply(
      'task137-pay-enabled',
      '30000000-0000-4000-8000-000000000093',
      '60000000-0000-4000-8000-000000000093',
      jsonb_build_array(pg_temp.dsc_sale(
        'task137-pay-enabled-sale', 'sale', null,
        jsonb_build_array(pg_temp.dsc_line(
          'task137-pay-enabled-line',
          '20000000-0000-4000-8000-000000000093',
          1, 100, 100, -1
        )), 100, 0, 0, 100
      ))
    ) -> 'batch' ->> 'status'
  ),
  'duplicate',
  'TASK-137 re-enabled pos.pay permits an idempotent duplicate replay'
);

-- Structural only: a single pgTAP connection cannot prove concurrent blocking.
-- Runtime concurrency belongs in an integration harness with two DB sessions.
select ok(
  (
    select
      strpos(
        source.wrapper_definition,
        'for update of session_row, staff, device, credential, shop'
      ) > 0
      and strpos(
        source.wrapper_definition,
        'task140_pos_sales_sync_apply_v1_task137'
      ) > strpos(
        source.wrapper_definition,
        'for update of session_row, staff, device, credential, shop'
      )
      and strpos(
        source.delegate_definition,
        'perform pg_advisory_xact_lock('
      ) > 0
    from (
      select
        pg_get_functiondef(
          'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)'::regprocedure
        ) as wrapper_definition,
        pg_get_functiondef(
          'public.task140_pos_sales_sync_apply_v1_task137(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)'::regprocedure
        ) as delegate_definition
    ) source
  ),
  'structural source contract wrapper auth locks precede delegated advisory lock'
);
select ok(
  not exists (
    select 1
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000093'
      and role_key = 'cashier'
      and permission_key = 'pos.discount_over_limit'
  ),
  'over-limit permission is not auto-granted'
);

select * from finish();
rollback;
