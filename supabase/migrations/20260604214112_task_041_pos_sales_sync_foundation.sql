-- TASK-041: POS Sales Sync foundation.
-- Additive only. Runtime endpoint stores synthetic/POS-provided sale payloads
-- with DB-level idempotency and redacted audit metadata. No fake revenue data,
-- no dashboard aggregation, and no client/browser service-role usage.

begin;

create table if not exists public.pos_sales_sync_batches (
  pos_sales_sync_batch_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_code text not null,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete restrict,
  staff_id uuid not null references public.staff_accounts(staff_id) on delete restrict,
  pos_session_id uuid not null references public.pos_sessions(pos_session_id) on delete restrict,
  client_batch_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  sale_count integer not null default 0,
  line_count integer not null default 0,
  status text not null default 'accepted',
  conflict_count integer not null default 0,
  received_at timestamptz not null default now(),
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_sales_sync_batches_client_batch_id_len check (
    length(client_batch_id) between 1 and 160
  ),
  constraint pos_sales_sync_batches_idempotency_key_len check (
    length(idempotency_key) between 1 and 200
  ),
  constraint pos_sales_sync_batches_payload_hash_format check (
    payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint pos_sales_sync_batches_sale_count_range check (
    sale_count >= 0 and sale_count <= 500
  ),
  constraint pos_sales_sync_batches_line_count_range check (
    line_count >= 0 and line_count <= 5000
  ),
  constraint pos_sales_sync_batches_status_check check (
    status in ('accepted', 'duplicate', 'conflict', 'rejected')
  ),
  constraint pos_sales_sync_batches_conflict_count_range check (
    conflict_count >= 0
  ),
  constraint pos_sales_sync_batches_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  ),
  constraint pos_sales_sync_batches_client_batch_unique unique (
    shop_id,
    shop_device_id,
    client_batch_id
  ),
  constraint pos_sales_sync_batches_idempotency_unique unique (
    shop_id,
    shop_device_id,
    idempotency_key
  )
);

create index if not exists pos_sales_sync_batches_shop_created_idx
  on public.pos_sales_sync_batches(shop_id, created_at desc);

create index if not exists pos_sales_sync_batches_shop_code_created_idx
  on public.pos_sales_sync_batches(shop_code, created_at desc);

create index if not exists pos_sales_sync_batches_device_created_idx
  on public.pos_sales_sync_batches(shop_device_id, created_at desc);

create index if not exists pos_sales_sync_batches_staff_created_idx
  on public.pos_sales_sync_batches(staff_id, created_at desc);

alter table public.pos_sales_sync_batches enable row level security;
alter table public.pos_sales_sync_batches force row level security;
revoke all on table public.pos_sales_sync_batches from public;
revoke all on table public.pos_sales_sync_batches from anon;
revoke all on table public.pos_sales_sync_batches from authenticated;
grant all on table public.pos_sales_sync_batches to service_role;

create table if not exists public.pos_sales (
  pos_sale_id uuid primary key default gen_random_uuid(),
  pos_sales_sync_batch_id uuid not null references public.pos_sales_sync_batches(pos_sales_sync_batch_id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_code text not null,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete restrict,
  staff_id uuid not null references public.staff_accounts(staff_id) on delete restrict,
  pos_session_id uuid not null references public.pos_sessions(pos_session_id) on delete restrict,
  client_sale_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  sale_number text,
  occurred_at timestamptz not null,
  business_date date,
  currency text not null default 'CLP',
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null,
  status text not null default 'accepted',
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_sales_client_sale_id_len check (
    length(client_sale_id) between 1 and 160
  ),
  constraint pos_sales_idempotency_key_len check (
    length(idempotency_key) between 1 and 200
  ),
  constraint pos_sales_payload_hash_format check (
    payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint pos_sales_currency_shape_check check (
    currency ~ '^[A-Z]{3}$'
  ),
  constraint pos_sales_amounts_non_negative_check check (
    subtotal >= 0 and discount_total >= 0 and tax_total >= 0 and total >= 0
  ),
  constraint pos_sales_status_check check (
    status in ('accepted', 'duplicate', 'conflict', 'rejected')
  ),
  constraint pos_sales_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  ),
  constraint pos_sales_client_sale_unique unique (
    shop_id,
    shop_device_id,
    client_sale_id
  ),
  constraint pos_sales_idempotency_unique unique (
    shop_id,
    shop_device_id,
    idempotency_key
  )
);

create index if not exists pos_sales_batch_idx
  on public.pos_sales(pos_sales_sync_batch_id);

create index if not exists pos_sales_shop_created_idx
  on public.pos_sales(shop_id, created_at desc);

create index if not exists pos_sales_shop_code_created_idx
  on public.pos_sales(shop_code, created_at desc);

create index if not exists pos_sales_device_created_idx
  on public.pos_sales(shop_device_id, created_at desc);

create index if not exists pos_sales_staff_created_idx
  on public.pos_sales(staff_id, created_at desc);

create index if not exists pos_sales_client_sale_idx
  on public.pos_sales(client_sale_id);

create index if not exists pos_sales_idempotency_idx
  on public.pos_sales(idempotency_key);

create index if not exists pos_sales_occurred_at_idx
  on public.pos_sales(occurred_at desc);

alter table public.pos_sales enable row level security;
alter table public.pos_sales force row level security;
revoke all on table public.pos_sales from public;
revoke all on table public.pos_sales from anon;
revoke all on table public.pos_sales from authenticated;
grant all on table public.pos_sales to service_role;

create table if not exists public.pos_sale_lines (
  pos_sale_line_id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references public.pos_sales(pos_sale_id) on delete cascade,
  pos_sales_sync_batch_id uuid not null references public.pos_sales_sync_batches(pos_sales_sync_batch_id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  client_line_id text not null,
  line_position integer not null,
  product_id uuid references public.inventory_products(id) on delete set null,
  item_number text,
  barcode text,
  product_name text,
  quantity numeric(12, 3) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_sale_lines_client_line_id_len check (
    length(client_line_id) between 1 and 160
  ),
  constraint pos_sale_lines_position_positive check (
    line_position >= 1
  ),
  constraint pos_sale_lines_amounts_check check (
    quantity > 0 and unit_price >= 0 and line_total >= 0
  ),
  constraint pos_sale_lines_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  ),
  constraint pos_sale_lines_client_line_unique unique (
    pos_sale_id,
    client_line_id
  ),
  constraint pos_sale_lines_position_unique unique (
    pos_sale_id,
    line_position
  )
);

create index if not exists pos_sale_lines_sale_idx
  on public.pos_sale_lines(pos_sale_id);

create index if not exists pos_sale_lines_batch_idx
  on public.pos_sale_lines(pos_sales_sync_batch_id);

create index if not exists pos_sale_lines_shop_idx
  on public.pos_sale_lines(shop_id);

create index if not exists pos_sale_lines_product_idx
  on public.pos_sale_lines(product_id)
  where product_id is not null;

create index if not exists pos_sale_lines_barcode_idx
  on public.pos_sale_lines(barcode)
  where barcode is not null;

alter table public.pos_sale_lines enable row level security;
alter table public.pos_sale_lines force row level security;
revoke all on table public.pos_sale_lines from public;
revoke all on table public.pos_sale_lines from anon;
revoke all on table public.pos_sale_lines from authenticated;
grant all on table public.pos_sale_lines to service_role;

notify pgrst, 'reload schema';

commit;
