-- TASK-094 - POS catalog import sync endpoint ledger
-- Additive server-side batch ledger for Win7POS supplier Excel catalog import sync.

begin;

create table if not exists public.pos_catalog_import_batches (
  pos_catalog_import_batch_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete restrict,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete restrict,
  staff_id uuid references public.staff_accounts(staff_id) on delete set null,
  pos_session_id uuid references public.pos_sessions(pos_session_id) on delete set null,
  client_import_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  schema_version text not null default 'pos-catalog-import-v1',
  source text not null default 'supplier_excel',
  status text not null default 'accepted',
  product_count integer not null default 0,
  accepted_item_count integer not null default 0,
  duplicate_item_count integer not null default 0,
  conflict_count integer not null default 0,
  metadata_redacted jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_catalog_import_batches_schema_check
    check (schema_version = 'pos-catalog-import-v1'),
  constraint pos_catalog_import_batches_source_check
    check (source = 'supplier_excel'),
  constraint pos_catalog_import_batches_status_check
    check (status in ('processing', 'accepted', 'duplicate', 'idempotent', 'failed')),
  constraint pos_catalog_import_batches_counts_check
    check (
      product_count >= 0 and
      accepted_item_count >= 0 and
      duplicate_item_count >= 0 and
      conflict_count >= 0
    ),
  constraint pos_catalog_import_batches_metadata_object_check
    check (jsonb_typeof(metadata_redacted) = 'object'),
  constraint pos_catalog_import_batches_shop_device_import_unique
    unique (shop_id, shop_device_id, client_import_id),
  constraint pos_catalog_import_batches_shop_device_idempotency_unique
    unique (shop_id, shop_device_id, idempotency_key)
);

create index if not exists pos_catalog_import_batches_shop_received_idx
  on public.pos_catalog_import_batches(shop_id, received_at desc);

create index if not exists pos_catalog_import_batches_device_received_idx
  on public.pos_catalog_import_batches(shop_device_id, received_at desc);

alter table public.pos_catalog_import_batches enable row level security;
alter table public.pos_catalog_import_batches force row level security;
revoke all on table public.pos_catalog_import_batches from public;
revoke all on table public.pos_catalog_import_batches from anon;
revoke all on table public.pos_catalog_import_batches from authenticated;
grant all on table public.pos_catalog_import_batches to service_role;

commit;
