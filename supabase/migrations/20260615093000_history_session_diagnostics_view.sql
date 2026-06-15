-- History session list diagnostics without transferring full JSON payloads.
-- The view is read-only and security-invoker so shared_sheet_sessions RLS stays
-- authoritative for authenticated Admin Console reads.

create or replace view public.shared_sheet_session_diagnostics
with (security_invoker = true) as
with base as (
  select
    s.remote_id,
    s.shop_id,
    s.owner_user_id,
    s.display_name,
    s.supplier,
    s.category,
    s."timestamp",
    s.updated_at,
    s.deleted_at,
    s.payload_version,
    s.is_manual_entry,
    case
      when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data)
      else 0
    end as data_rows,
    case
      when jsonb_typeof(s.data) = 'array' then greatest(jsonb_array_length(s.data) - 1, 0)
      else 0
    end as item_rows,
    case
      when jsonb_typeof(s.data) = 'array'
        and jsonb_array_length(s.data) > 0
        and jsonb_typeof(s.data -> 0) = 'array'
      then jsonb_array_length(s.data -> 0)
      else 0
    end as column_count,
    s.session_overlay,
    pg_column_size(s.session_overlay) as overlay_bytes
  from public.shared_sheet_sessions s
),
overlay_fields as (
  select
    b.*,
    case
      when b.session_overlay is not null
        and jsonb_typeof(b.session_overlay) = 'object'
        and jsonb_typeof(b.session_overlay -> 'overlay_schema') = 'number'
      then (b.session_overlay ->> 'overlay_schema')::integer
      else null
    end as overlay_schema,
    case
      when b.session_overlay is not null
        and jsonb_typeof(b.session_overlay) = 'object'
        and jsonb_typeof(b.session_overlay -> 'editable') = 'array'
      then jsonb_array_length(b.session_overlay -> 'editable')
      else 0
    end as editable_rows,
    case
      when b.session_overlay is not null
        and jsonb_typeof(b.session_overlay) = 'object'
        and jsonb_typeof(b.session_overlay -> 'complete') = 'array'
      then jsonb_array_length(b.session_overlay -> 'complete')
      else 0
    end as complete_rows
  from base b
),
complete_counts as (
  select
    o.*,
    case
      when o.session_overlay is not null
        and jsonb_typeof(o.session_overlay) = 'object'
        and jsonb_typeof(o.session_overlay -> 'complete') = 'array'
      then (
        select count(*)::integer
        from jsonb_array_elements(o.session_overlay -> 'complete') with ordinality as flags(value, position)
        where flags.position > 1 and flags.value = 'true'::jsonb
      )
      else 0
    end as raw_complete_count
  from overlay_fields o
),
status as (
  select
    c.*,
    case
      when c.payload_version < 2 then 'legacy_v1'
      when c.session_overlay is null then 'missing'
      when c.overlay_bytes > 524288 then 'too_large'
      when jsonb_typeof(c.session_overlay) <> 'object'
        or c.overlay_schema is null
        or jsonb_typeof(c.session_overlay -> 'editable') <> 'array'
        or jsonb_typeof(c.session_overlay -> 'complete') <> 'array'
        or (
          jsonb_typeof(c.session_overlay -> 'editable') = 'array'
          and exists (
          select 1
          from jsonb_array_elements(c.session_overlay -> 'editable') as editable(row_value)
          where jsonb_typeof(editable.row_value) <> 'array'
          )
        )
        or (
          jsonb_typeof(c.session_overlay -> 'complete') = 'array'
          and exists (
          select 1
          from jsonb_array_elements(c.session_overlay -> 'complete') as complete(flag_value)
          where jsonb_typeof(complete.flag_value) <> 'boolean'
          )
        )
      then 'invalid_shape'
      when c.overlay_schema <> 1 then 'schema_unsupported'
      when c.editable_rows <> c.data_rows or c.complete_rows <> c.data_rows then 'invalid_shape'
      else 'ok'
    end as overlay_status
  from complete_counts c
)
select
  remote_id,
  shop_id,
  owner_user_id,
  display_name,
  supplier,
  category,
  "timestamp",
  updated_at,
  deleted_at,
  payload_version,
  is_manual_entry,
  data_rows,
  item_rows,
  column_count,
  overlay_status,
  case when overlay_status in ('ok', 'schema_unsupported') then overlay_schema else null end as overlay_schema,
  coalesce(overlay_bytes, 0) as overlay_bytes,
  case when overlay_status = 'ok' then editable_rows else 0 end as editable_rows,
  case when overlay_status = 'ok' then complete_rows else 0 end as complete_rows,
  case when overlay_status = 'ok' then raw_complete_count else 0 end as complete_count,
  case
    when overlay_status = 'ok' then greatest(item_rows - raw_complete_count, 0)
    else item_rows
  end as missing_count,
  case
    when data_rows = 0 then '0 rows'
    when data_rows = 1 then '1 row; 0 item rows'
    else data_rows || ' rows; ' || item_rows || ' item rows; ' || column_count || ' columns'
  end as data_summary,
  case
    when payload_version < 2 then 'Legacy payload v1'
    when session_overlay is null then 'No overlay'
    else overlay_status || '; schema=' || coalesce(overlay_schema::text, 'n/a') || '; bytes=' || coalesce(overlay_bytes, 0)
  end as overlay_summary
from status;

grant select on public.shared_sheet_session_diagnostics to authenticated;
