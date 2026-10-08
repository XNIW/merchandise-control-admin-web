-- TASK-054: additive, account-scoped address creation intents.
-- The v2 mutation and its validation/default behavior remain authoritative.
begin;

do $$
begin
  if current_user <> 'postgres'
    or to_regprocedure('public.customer_address_upsert_v2(uuid,bigint,jsonb)') is null
    or to_regprocedure('app_private.customer_address_payload_v2(public.customer_addresses)') is null then
    raise exception 'customer address v2 baseline and postgres deploy role required';
  end if;
end;
$$;

create table app_private.customer_address_create_intents_v3 (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  intent_id uuid not null,
  payload_sha256 bytea not null check (octet_length(payload_sha256) = 32),
  -- Deliberately not an address FK: deletion must retain a non-PII tombstone.
  address_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (owner_user_id, intent_id)
);
alter table app_private.customer_address_create_intents_v3 enable row level security;
alter table app_private.customer_address_create_intents_v3 force row level security;
revoke all on table app_private.customer_address_create_intents_v3
  from public, anon, authenticated, service_role;

create function app_private.customer_address_session_user_v3()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  begin
    v_session_id := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '28000', message = 'active customer session required';
  end;
  if v_user_id is null or v_session_id is null
    or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '28000', message = 'active customer session required';
  end if;
  -- Holding SHARE locks prevents revocation/deletion from racing the mutation
  -- after this authorization decision. No customer/admin profile is fabricated.
  perform 1
  from auth.sessions session
  join auth.users account on account.id = session.user_id
  where session.id = v_session_id and session.user_id = v_user_id
    and (session.not_after is null or session.not_after > clock_timestamp())
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false)
    and (account.banned_until is null or account.banned_until <= clock_timestamp())
  for share of session, account;
  if not found then
    raise exception using errcode = '28000', message = 'active customer session required';
  end if;
  return v_user_id;
end;
$$;
revoke all on function app_private.customer_address_session_user_v3()
  from public, anon, authenticated, service_role;

create function public.customer_address_create_v3(p_intent_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent app_private.customer_address_create_intents_v3%rowtype;
  v_address public.customer_addresses%rowtype;
  v_hash bytea;
  v_result jsonb;
begin
  -- Match v2's lock, including for distinct intents and default transitions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-address:' || v_user_id::text, 50050)
  );
  v_user_id := app_private.customer_address_session_user_v3();
  if p_intent_id is null or p_payload is null
    or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 16384 then
    return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'invalid');
  end if;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_payload::text, 'UTF8'));
  select intent.* into v_intent
  from app_private.customer_address_create_intents_v3 intent
  where intent.owner_user_id = v_user_id and intent.intent_id = p_intent_id;
  if found then
    if v_intent.payload_sha256 <> v_hash then
      return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'intent_conflict');
    end if;
    select address.* into v_address from public.customer_addresses address
    where address.user_id = v_user_id and address.id = v_intent.address_id;
    if not found then
      return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'deleted');
    end if;
    return jsonb_build_object(
      'apiVersion', 'customer-address.v3', 'status', 'ok',
      'address', app_private.customer_address_payload_v2(v_address),
      'serverTime', statement_timestamp()
    );
  end if;

  v_result := public.customer_address_upsert_v2(null, null, p_payload);
  if v_result->>'status' <> 'ok' then
    return jsonb_set(v_result, '{apiVersion}', '"customer-address.v3"'::jsonb);
  end if;
  insert into app_private.customer_address_create_intents_v3
    (owner_user_id, intent_id, payload_sha256, address_id)
  values (v_user_id, p_intent_id, v_hash, (v_result->'address'->>'id')::uuid);
  return jsonb_set(v_result, '{apiVersion}', '"customer-address.v3"'::jsonb);
exception when numeric_value_out_of_range or invalid_text_representation then
  -- Includes v2's boolean declaration cast and numeric precision overflow. The
  -- PL/pgSQL exception subtransaction rolls back default/address/ledger writes.
  return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'invalid');
end;
$$;

create function public.customer_address_create_reconcile_v3(p_intent_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_address_id uuid;
  v_address public.customer_addresses%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-address:' || v_user_id::text, 50050)
  );
  v_user_id := app_private.customer_address_session_user_v3();
  if p_intent_id is null then
    return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'invalid');
  end if;
  select intent.address_id into v_address_id
  from app_private.customer_address_create_intents_v3 intent
  where intent.owner_user_id = v_user_id and intent.intent_id = p_intent_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'not_found');
  end if;
  select address.* into v_address from public.customer_addresses address
  where address.user_id = v_user_id and address.id = v_address_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-address.v3', 'status', 'deleted');
  end if;
  return jsonb_build_object(
    'apiVersion', 'customer-address.v3', 'status', 'ok',
    'address', app_private.customer_address_payload_v2(v_address),
    'serverTime', statement_timestamp()
  );
end;
$$;

revoke all on function public.customer_address_create_v3(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_address_create_reconcile_v3(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_address_create_v3(uuid, jsonb) to authenticated;
grant execute on function public.customer_address_create_reconcile_v3(uuid) to authenticated;

comment on table app_private.customer_address_create_intents_v3 is
  'Account-scoped address creation receipts; hash/identifiers only, no duplicate address PII; retained after address deletion, removed with auth user.';
comment on function public.customer_address_create_v3(uuid, jsonb) is
  'Atomic create/replay of one account-scoped immutable intent. Same intent and different JSONB hash returns intent_conflict; deleted address is never recreated.';
comment on function public.customer_address_create_reconcile_v3(uuid) is
  'Reconcile an account-scoped address creation under the same transaction lock; returns current canonical address, not_found or deleted.';
commit;
