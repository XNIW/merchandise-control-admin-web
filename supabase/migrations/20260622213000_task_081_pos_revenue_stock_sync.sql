-- TASK-081 - Win7POS sales revenue ledger and stock sync
-- Additive only: keeps TASK-041 POS sales foundation compatible while adding
-- signed CLP ledger rows for revenue, fiscal status, and stock movements.

begin;

alter table public.pos_sales
  add column if not exists source_schema_version text not null default 'pos-sales-v1',
  add column if not exists business_kind text not null default 'sale',
  add column if not exists original_pos_sale_id uuid references public.pos_sales(pos_sale_id),
  add column if not exists client_original_sale_id text,
  add column if not exists reversal_reason_redacted text,
  add column if not exists gross_amount_clp bigint,
  add column if not exists discount_amount_clp bigint,
  add column if not exists tax_amount_clp bigint not null default 0,
  add column if not exists net_amount_clp bigint,
  add column if not exists paid_amount_clp bigint,
  add column if not exists change_amount_clp bigint not null default 0,
  add column if not exists fiscal_status text not null default 'not_reported',
  add column if not exists fiscal_document_type text,
  add column if not exists fiscal_document_number_redacted text,
  add column if not exists fiscal_printed_at timestamptz,
  add column if not exists stock_sync_status text not null default 'not_applicable',
  add column if not exists stock_warning_count integer not null default 0;

alter table public.pos_sales
  add constraint pos_sales_task081_source_schema_check check (
    source_schema_version in ('pos-sales-v1', 'pos-sales-ledger-v2')
  ) not valid;

alter table public.pos_sales
  validate constraint pos_sales_task081_source_schema_check;

alter table public.pos_sales
  add constraint pos_sales_task081_business_kind_check check (
    business_kind in ('sale', 'refund', 'void')
  ) not valid;

alter table public.pos_sales
  validate constraint pos_sales_task081_business_kind_check;

alter table public.pos_sales
  add constraint pos_sales_task081_fiscal_status_check check (
    fiscal_status in (
      'not_reported',
      'printed_local_pdf',
      'not_printed_card_policy',
      'issued_external',
      'accepted_authority',
      'voided',
      'not_required'
    )
  ) not valid;

alter table public.pos_sales
  validate constraint pos_sales_task081_fiscal_status_check;

alter table public.pos_sales
  add constraint pos_sales_task081_stock_sync_status_check check (
    stock_sync_status in (
      'not_applicable',
      'applied',
      'partial',
      'stock_warning',
      'stock_conflict',
      'failed'
    )
  ) not valid;

alter table public.pos_sales
  validate constraint pos_sales_task081_stock_sync_status_check;

alter table public.pos_sales
  add constraint pos_sales_task081_stock_warning_count_check check (
    stock_warning_count >= 0
  ) not valid;

alter table public.pos_sales
  validate constraint pos_sales_task081_stock_warning_count_check;

create index if not exists pos_sales_task081_shop_business_date_idx
  on public.pos_sales(shop_id, business_date, occurred_at desc);

create index if not exists pos_sales_task081_shop_business_date_accepted_idx
  on public.pos_sales(shop_id, business_date desc, occurred_at desc)
  where status = 'accepted';

create index if not exists pos_sales_task081_shop_occurred_accepted_idx
  on public.pos_sales(shop_id, occurred_at desc)
  where status = 'accepted';

create index if not exists pos_sales_task081_shop_kind_date_idx
  on public.pos_sales(shop_id, business_kind, business_date);

create index if not exists pos_sales_task081_shop_fiscal_date_idx
  on public.pos_sales(shop_id, fiscal_status, business_date);

create index if not exists pos_sales_task081_shop_device_occurred_idx
  on public.pos_sales(shop_id, shop_device_id, occurred_at desc);

create index if not exists pos_sales_task081_shop_staff_occurred_idx
  on public.pos_sales(shop_id, staff_id, occurred_at desc);

alter table public.pos_sale_lines
  add column if not exists line_type text not null default 'item',
  add column if not exists local_product_id text,
  add column if not exists unit_amount_clp bigint,
  add column if not exists amount_clp bigint,
  add column if not exists stock_quantity_delta numeric(12,3) not null default 0,
  add column if not exists stock_sync_status text not null default 'not_applicable',
  add column if not exists stock_issue_code text;

alter table public.pos_sale_lines
  add constraint pos_sale_lines_task081_line_type_check check (
    line_type in ('item', 'discount', 'tax', 'adjustment')
  ) not valid;

alter table public.pos_sale_lines
  validate constraint pos_sale_lines_task081_line_type_check;

alter table public.pos_sale_lines
  add constraint pos_sale_lines_task081_stock_sync_status_check check (
    stock_sync_status in (
      'not_applicable',
      'applied',
      'unresolved_product',
      'stock_conflict',
      'failed'
    )
  ) not valid;

alter table public.pos_sale_lines
  validate constraint pos_sale_lines_task081_stock_sync_status_check;

create index if not exists pos_sale_lines_task081_local_product_idx
  on public.pos_sale_lines(shop_id, local_product_id)
  where local_product_id is not null;

create table if not exists public.pos_revenue_ledger_entries (
  pos_revenue_ledger_entry_id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references public.pos_sales(pos_sale_id) on delete restrict,
  pos_sales_sync_batch_id uuid not null references public.pos_sales_sync_batches(pos_sales_sync_batch_id) on delete restrict,
  shop_id uuid not null references public.shops(shop_id) on delete restrict,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete restrict,
  staff_id uuid references public.staff_accounts(staff_id) on delete set null,
  pos_session_id uuid references public.pos_sessions(pos_session_id) on delete set null,
  business_date date,
  occurred_at timestamptz not null,
  currency text not null default 'CLP',
  entry_type text not null,
  payment_method text,
  amount_clp bigint not null,
  quantity numeric(12,3),
  client_entry_id text not null,
  line_position integer,
  product_id uuid references public.inventory_products(id) on delete set null,
  local_product_id text,
  item_number text,
  barcode text,
  product_name text,
  original_client_entry_id text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_revenue_ledger_entries_currency_check check (currency = 'CLP'),
  constraint pos_revenue_ledger_entries_entry_type_check check (
    entry_type in (
      'item',
      'discount',
      'tax',
      'payment',
      'change',
      'refund_item',
      'refund_payment',
      'void_marker'
    )
  ),
  constraint pos_revenue_ledger_entries_payment_method_check check (
    payment_method is null or payment_method in ('cash', 'card', 'transfer', 'other')
  ),
  constraint pos_revenue_ledger_entries_client_entry_id_len check (
    length(client_entry_id) between 1 and 200
  ),
  constraint pos_revenue_ledger_entries_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  ),
  constraint pos_revenue_ledger_entries_sale_entry_unique unique (
    pos_sale_id,
    client_entry_id
  )
);

create index if not exists pos_revenue_ledger_entries_shop_date_idx
  on public.pos_revenue_ledger_entries(shop_id, business_date, occurred_at desc);

create index if not exists pos_revenue_ledger_entries_shop_type_date_idx
  on public.pos_revenue_ledger_entries(shop_id, entry_type, business_date);

create index if not exists pos_revenue_ledger_entries_sale_idx
  on public.pos_revenue_ledger_entries(pos_sale_id);

create index if not exists pos_revenue_ledger_entries_batch_idx
  on public.pos_revenue_ledger_entries(pos_sales_sync_batch_id);

create index if not exists pos_revenue_ledger_entries_payment_idx
  on public.pos_revenue_ledger_entries(shop_id, payment_method, business_date)
  where payment_method is not null;

alter table public.pos_revenue_ledger_entries enable row level security;
alter table public.pos_revenue_ledger_entries force row level security;
revoke all on table public.pos_revenue_ledger_entries from public;
revoke all on table public.pos_revenue_ledger_entries from anon;
revoke all on table public.pos_revenue_ledger_entries from authenticated;
grant all on table public.pos_revenue_ledger_entries to service_role;

create table if not exists public.pos_sale_stock_movements (
  pos_sale_stock_movement_id uuid primary key default gen_random_uuid(),
  movement_key text not null unique,
  pos_sale_id uuid not null references public.pos_sales(pos_sale_id) on delete restrict,
  pos_sale_line_id uuid references public.pos_sale_lines(pos_sale_line_id) on delete restrict,
  shop_id uuid not null references public.shops(shop_id) on delete restrict,
  product_id uuid references public.inventory_products(id) on delete set null,
  movement_kind text not null,
  quantity_delta numeric(12,3) not null,
  status text not null,
  issue_code text,
  stock_before numeric(12,3),
  stock_after numeric(12,3),
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_sale_stock_movements_kind_check check (
    movement_kind in (
      'sale_decrement',
      'refund_increment',
      'void_reverse',
      'no_stock',
      'unresolved_product',
      'stock_conflict'
    )
  ),
  constraint pos_sale_stock_movements_status_check check (
    status in (
      'applied',
      'not_applicable',
      'unresolved_product',
      'stock_conflict',
      'failed'
    )
  ),
  constraint pos_sale_stock_movements_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  )
);

create index if not exists pos_sale_stock_movements_shop_status_idx
  on public.pos_sale_stock_movements(shop_id, status, created_at desc);

create index if not exists pos_sale_stock_movements_sale_idx
  on public.pos_sale_stock_movements(pos_sale_id);

create index if not exists pos_sale_stock_movements_line_idx
  on public.pos_sale_stock_movements(pos_sale_line_id)
  where pos_sale_line_id is not null;

create index if not exists pos_sale_stock_movements_product_idx
  on public.pos_sale_stock_movements(product_id, created_at desc)
  where product_id is not null;

create index if not exists shop_devices_task081_pos_live_idx
  on public.shop_devices(shop_id, device_type, updated_at desc);

create index if not exists pos_device_credentials_task081_shop_updated_idx
  on public.pos_device_credentials(shop_id, updated_at desc);

create index if not exists pos_sessions_task081_shop_updated_idx
  on public.pos_sessions(shop_id, updated_at desc);

create index if not exists audit_logs_task081_pos_shop_created_idx
  on public.audit_logs(shop_id, created_at desc)
  where scope = 'shop' and event_key like 'pos.%';

alter table public.pos_sale_stock_movements enable row level security;
alter table public.pos_sale_stock_movements force row level security;
revoke all on table public.pos_sale_stock_movements from public;
revoke all on table public.pos_sale_stock_movements from anon;
revoke all on table public.pos_sale_stock_movements from authenticated;
grant all on table public.pos_sale_stock_movements to service_role;

create or replace function public.prevent_pos_revenue_ledger_entries_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'pos_revenue_ledger_entries is append-only';
end;
$$;

revoke all on function public.prevent_pos_revenue_ledger_entries_mutation() from public;
revoke all on function public.prevent_pos_revenue_ledger_entries_mutation() from anon;
revoke all on function public.prevent_pos_revenue_ledger_entries_mutation() from authenticated;

drop trigger if exists pos_revenue_ledger_entries_no_update_delete
  on public.pos_revenue_ledger_entries;
create trigger pos_revenue_ledger_entries_no_update_delete
before update or delete on public.pos_revenue_ledger_entries
for each row execute function public.prevent_pos_revenue_ledger_entries_mutation();

create or replace function public.prevent_pos_sale_stock_movements_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'pos_sale_stock_movements is append-only';
end;
$$;

revoke all on function public.prevent_pos_sale_stock_movements_mutation() from public;
revoke all on function public.prevent_pos_sale_stock_movements_mutation() from anon;
revoke all on function public.prevent_pos_sale_stock_movements_mutation() from authenticated;

drop trigger if exists pos_sale_stock_movements_no_update_delete
  on public.pos_sale_stock_movements;
create trigger pos_sale_stock_movements_no_update_delete
before update or delete on public.pos_sale_stock_movements
for each row execute function public.prevent_pos_sale_stock_movements_mutation();

create or replace view public.pos_revenue_daily_summary_v as
with sale_revenue as (
  select
    ledger.shop_id,
    ledger.business_date,
    ledger.pos_sale_id,
    max(sales.business_kind) as business_kind,
    max(sales.fiscal_status) as fiscal_status,
    max(sales.stock_warning_count) as stock_warning_count,
    coalesce(sum(ledger.amount_clp) filter (
      where ledger.entry_type in ('item', 'tax', 'discount', 'refund_item')
    ), 0)::bigint as net_revenue_clp,
    coalesce(sum(ledger.amount_clp) filter (where ledger.entry_type = 'item'), 0)::bigint as gross_sales_clp,
    coalesce(sum(ledger.amount_clp) filter (where ledger.entry_type = 'discount'), 0)::bigint as discounts_clp,
    coalesce(sum(ledger.amount_clp) filter (where ledger.entry_type = 'refund_item'), 0)::bigint as refunds_clp
  from public.pos_revenue_ledger_entries ledger
  join public.pos_sales sales on sales.pos_sale_id = ledger.pos_sale_id
  group by ledger.shop_id, ledger.business_date, ledger.pos_sale_id
),
payment_totals as (
  select
    shop_id,
    business_date,
    coalesce(sum(amount_clp) filter (where entry_type in ('payment', 'refund_payment') and payment_method = 'cash'), 0)::bigint as cash_received_clp,
    coalesce(sum(amount_clp) filter (where entry_type in ('payment', 'refund_payment') and payment_method = 'card'), 0)::bigint as card_received_clp,
    coalesce(sum(amount_clp) filter (where entry_type in ('payment', 'refund_payment') and payment_method = 'transfer'), 0)::bigint as transfer_received_clp,
    coalesce(sum(amount_clp) filter (where entry_type in ('payment', 'refund_payment') and payment_method = 'other'), 0)::bigint as other_received_clp,
    coalesce(abs(sum(amount_clp) filter (where entry_type = 'change')), 0)::bigint as change_given_clp,
    max(created_at) as latest_ledger_at
  from public.pos_revenue_ledger_entries
  group by shop_id, business_date
)
select
  sale_revenue.shop_id,
  sale_revenue.business_date,
  coalesce(sum(sale_revenue.net_revenue_clp), 0)::bigint as net_revenue_clp,
  coalesce(sum(sale_revenue.net_revenue_clp) filter (
    where sale_revenue.fiscal_status in ('printed_local_pdf', 'issued_external', 'accepted_authority', 'not_required')
  ), 0)::bigint as documented_revenue_clp,
  coalesce(sum(sale_revenue.net_revenue_clp) filter (
    where sale_revenue.fiscal_status not in ('printed_local_pdf', 'issued_external', 'accepted_authority', 'not_required')
  ), 0)::bigint as verification_revenue_clp,
  coalesce(sum(sale_revenue.gross_sales_clp), 0)::bigint as gross_sales_clp,
  coalesce(sum(sale_revenue.discounts_clp), 0)::bigint as discounts_clp,
  coalesce(sum(sale_revenue.refunds_clp), 0)::bigint as refunds_clp,
  coalesce(max(payment_totals.cash_received_clp), 0)::bigint as cash_received_clp,
  coalesce(max(payment_totals.card_received_clp), 0)::bigint as card_received_clp,
  coalesce(max(payment_totals.transfer_received_clp), 0)::bigint as transfer_received_clp,
  coalesce(max(payment_totals.other_received_clp), 0)::bigint as other_received_clp,
  coalesce(max(payment_totals.change_given_clp), 0)::bigint as change_given_clp,
  count(*) filter (where sale_revenue.business_kind = 'sale')::integer as sale_count,
  count(*) filter (where sale_revenue.business_kind = 'refund')::integer as refund_count,
  count(*) filter (where sale_revenue.business_kind = 'void')::integer as void_count,
  count(*)::integer as transaction_count,
  coalesce(sum(sale_revenue.stock_warning_count), 0)::integer as stock_warning_count,
  max(payment_totals.latest_ledger_at) as latest_ledger_at
from sale_revenue
left join payment_totals
  on payment_totals.shop_id = sale_revenue.shop_id
 and payment_totals.business_date is not distinct from sale_revenue.business_date
group by sale_revenue.shop_id, sale_revenue.business_date;

create or replace view public.pos_revenue_monthly_summary_v as
select
  shop_id,
  date_trunc('month', business_date)::date as month_start,
  coalesce(sum(net_revenue_clp), 0)::bigint as net_revenue_clp,
  coalesce(sum(documented_revenue_clp), 0)::bigint as documented_revenue_clp,
  coalesce(sum(verification_revenue_clp), 0)::bigint as verification_revenue_clp,
  coalesce(sum(gross_sales_clp), 0)::bigint as gross_sales_clp,
  coalesce(sum(discounts_clp), 0)::bigint as discounts_clp,
  coalesce(sum(refunds_clp), 0)::bigint as refunds_clp,
  coalesce(sum(cash_received_clp), 0)::bigint as cash_received_clp,
  coalesce(sum(card_received_clp), 0)::bigint as card_received_clp,
  coalesce(sum(transfer_received_clp), 0)::bigint as transfer_received_clp,
  coalesce(sum(other_received_clp), 0)::bigint as other_received_clp,
  coalesce(sum(change_given_clp), 0)::bigint as change_given_clp,
  coalesce(sum(sale_count), 0)::integer as sale_count,
  coalesce(sum(refund_count), 0)::integer as refund_count,
  coalesce(sum(void_count), 0)::integer as void_count,
  coalesce(sum(transaction_count), 0)::integer as transaction_count,
  coalesce(sum(stock_warning_count), 0)::integer as stock_warning_count,
  max(latest_ledger_at) as latest_ledger_at
from public.pos_revenue_daily_summary_v
where business_date is not null
group by shop_id, date_trunc('month', business_date)::date;

revoke all on table public.pos_revenue_daily_summary_v from public;
revoke all on table public.pos_revenue_daily_summary_v from anon;
revoke all on table public.pos_revenue_daily_summary_v from authenticated;
grant select on table public.pos_revenue_daily_summary_v to service_role;

revoke all on table public.pos_revenue_monthly_summary_v from public;
revoke all on table public.pos_revenue_monthly_summary_v from anon;
revoke all on table public.pos_revenue_monthly_summary_v from authenticated;
grant select on table public.pos_revenue_monthly_summary_v to service_role;

create or replace function public.pos_apply_sale_stock_movement(
  p_shop_id uuid,
  p_pos_sale_id uuid,
  p_pos_sale_line_id uuid,
  p_product_id uuid,
  p_movement_key text,
  p_quantity_delta numeric,
  p_movement_kind text,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns table(
  status text,
  issue_code text,
  stock_before numeric,
  stock_after numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.pos_sale_stock_movements%rowtype;
  product_row record;
  next_stock numeric(12,3);
  movement_status text;
  movement_issue text;
begin
  if coalesce(trim(p_movement_key), '') = '' then
    raise exception 'movement_key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_movement_key, 0));

  select *
    into existing_row
  from public.pos_sale_stock_movements
  where movement_key = p_movement_key;

  if found then
    status := existing_row.status;
    issue_code := existing_row.issue_code;
    stock_before := existing_row.stock_before;
    stock_after := existing_row.stock_after;
    return next;
    return;
  end if;

  if p_quantity_delta = 0 or p_movement_kind = 'no_stock' then
    insert into public.pos_sale_stock_movements (
      movement_key,
      pos_sale_id,
      pos_sale_line_id,
      shop_id,
      product_id,
      movement_kind,
      quantity_delta,
      status,
      issue_code,
      metadata_redacted
    ) values (
      p_movement_key,
      p_pos_sale_id,
      p_pos_sale_line_id,
      p_shop_id,
      p_product_id,
      'no_stock',
      p_quantity_delta,
      'not_applicable',
      null,
      coalesce(p_metadata_redacted, '{}'::jsonb)
    );

    status := 'not_applicable';
    issue_code := null;
    stock_before := null;
    stock_after := null;
    return next;
    return;
  end if;

  if p_product_id is null then
    insert into public.pos_sale_stock_movements (
      movement_key,
      pos_sale_id,
      pos_sale_line_id,
      shop_id,
      product_id,
      movement_kind,
      quantity_delta,
      status,
      issue_code,
      metadata_redacted
    ) values (
      p_movement_key,
      p_pos_sale_id,
      p_pos_sale_line_id,
      p_shop_id,
      null,
      'unresolved_product',
      p_quantity_delta,
      'unresolved_product',
      'missing_product_id',
      coalesce(p_metadata_redacted, '{}'::jsonb)
    );

    status := 'unresolved_product';
    issue_code := 'missing_product_id';
    stock_before := null;
    stock_after := null;
    return next;
    return;
  end if;

  select product.id, product.stock_quantity
    into product_row
  from public.inventory_products product
  where product.id = p_product_id
    and product.deleted_at is null
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
    insert into public.pos_sale_stock_movements (
      movement_key,
      pos_sale_id,
      pos_sale_line_id,
      shop_id,
      product_id,
      movement_kind,
      quantity_delta,
      status,
      issue_code,
      metadata_redacted
    ) values (
      p_movement_key,
      p_pos_sale_id,
      p_pos_sale_line_id,
      p_shop_id,
      p_product_id,
      'unresolved_product',
      p_quantity_delta,
      'unresolved_product',
      'product_not_found_or_out_of_scope',
      coalesce(p_metadata_redacted, '{}'::jsonb)
    );

    status := 'unresolved_product';
    issue_code := 'product_not_found_or_out_of_scope';
    stock_before := null;
    stock_after := null;
    return next;
    return;
  end if;

  stock_before := coalesce(product_row.stock_quantity, 0)::numeric(12,3);
  next_stock := (stock_before + p_quantity_delta)::numeric(12,3);

  if p_quantity_delta < 0 and next_stock < 0 then
    insert into public.pos_sale_stock_movements (
      movement_key,
      pos_sale_id,
      pos_sale_line_id,
      shop_id,
      product_id,
      movement_kind,
      quantity_delta,
      status,
      issue_code,
      stock_before,
      stock_after,
      metadata_redacted
    ) values (
      p_movement_key,
      p_pos_sale_id,
      p_pos_sale_line_id,
      p_shop_id,
      p_product_id,
      'stock_conflict',
      p_quantity_delta,
      'stock_conflict',
      'negative_stock_blocked',
      stock_before,
      stock_before,
      coalesce(p_metadata_redacted, '{}'::jsonb)
    );

    status := 'stock_conflict';
    issue_code := 'negative_stock_blocked';
    stock_after := stock_before;
    return next;
    return;
  end if;

  update public.inventory_products
     set stock_quantity = next_stock,
         updated_at = now()
   where id = p_product_id;

  movement_status := 'applied';
  movement_issue := null;

  insert into public.pos_sale_stock_movements (
    movement_key,
    pos_sale_id,
    pos_sale_line_id,
    shop_id,
    product_id,
    movement_kind,
    quantity_delta,
    status,
    issue_code,
    stock_before,
    stock_after,
    metadata_redacted
  ) values (
    p_movement_key,
    p_pos_sale_id,
    p_pos_sale_line_id,
    p_shop_id,
    p_product_id,
    p_movement_kind,
    p_quantity_delta,
    movement_status,
    movement_issue,
    stock_before,
    next_stock,
    coalesce(p_metadata_redacted, '{}'::jsonb)
  );

  status := movement_status;
  issue_code := movement_issue;
  stock_after := next_stock;
  return next;
end;
$$;

revoke all on function public.pos_apply_sale_stock_movement(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  jsonb
) from public;
revoke all on function public.pos_apply_sale_stock_movement(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  jsonb
) from anon;
revoke all on function public.pos_apply_sale_stock_movement(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  jsonb
) from authenticated;
grant execute on function public.pos_apply_sale_stock_movement(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
