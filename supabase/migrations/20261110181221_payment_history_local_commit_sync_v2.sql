-- ASUS019 incremental publication. Additive; the qualified archive migration
-- and v1 snapshot/delta history are preserved. This file is not rollout-ready
-- until admission, delivery and the isolated replay gates below are complete.

create table public.payment_history_local_writer_contexts (
 shop_id uuid not null references public.shops(shop_id),
 shop_device_id uuid not null references public.shop_devices(shop_device_id),
 local_dataset_id text not null check(length(local_dataset_id) between 1 and 256),
 restore_lineage_id uuid not null,
 restore_epoch bigint not null check(restore_epoch>=0),
 local_revision bigint not null check(local_revision>=0),
 source_snapshot_id uuid,
 evidence_reference text not null check(length(evidence_reference) between 1 and 2048),
 verified_at timestamptz not null default clock_timestamp(),
 primary key(shop_id,shop_device_id),
 foreign key(shop_id,source_snapshot_id) references public.payment_history_source_snapshots(shop_id,snapshot_id)
);

create table public.payment_history_local_publications (
 operation_id uuid primary key,
 shop_id uuid not null references public.shops(shop_id),
 shop_device_id uuid not null references public.shop_devices(shop_device_id),
 server_dataset_id uuid not null,
 local_dataset_id text not null check(length(local_dataset_id) between 1 and 256),
 restore_lineage_id uuid not null,
 restore_epoch bigint not null check(restore_epoch>=0),
 writer_epoch bigint not null check(writer_epoch>0),
 operation_kind text not null check(operation_kind in('Apply','Undo')),
 request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
 content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),
 protocol_version integer not null check(protocol_version=2),
 base_revision bigint not null check(base_revision>=0),
 page_count integer not null check(page_count between 1 and 20000),
 staged_pages integer not null default 0 check(staged_pages between 0 and 20000),
 staged_bytes bigint not null default 0 check(staged_bytes between 0 and 268435456),
 state text not null default 'preparing' check(state in('preparing','authorized','committed','reconcile_required','aborted')),
 grant_id uuid unique,
 authorization_staff_id uuid references public.staff_accounts(staff_id),
 authorization_credential_version integer,
 issued_at timestamptz,expires_at timestamptz,
 local_sequence bigint check(local_sequence>0),
 local_revision bigint check(local_revision>=0),
 local_batch_id text check(length(local_batch_id) between 1 and 256),
 local_receipt_json text,
 server_receipt jsonb,
 created_at timestamptz not null default clock_timestamp(),
 unique(shop_id,operation_id),
 unique(shop_id,shop_device_id,local_dataset_id,restore_epoch,local_sequence),
 check((grant_id is null and issued_at is null and expires_at is null)
    or (grant_id is not null and authorization_staff_id is not null and authorization_credential_version>0
        and expires_at>issued_at and expires_at<=issued_at+interval '60 seconds')),
 check((state='committed' and server_receipt is not null and local_receipt_json is not null and local_sequence is not null)
    or (state<>'committed' and server_receipt is null))
);
create index payment_history_local_publication_pending_idx
 on public.payment_history_local_publications(shop_id,shop_device_id,state,created_at)
 where state in('preparing','authorized','reconcile_required');

create table public.payment_history_local_publication_pages (
 shop_id uuid not null,
 operation_id uuid not null,
 ordinal integer not null check(ordinal between 1 and 20000),
 page_json text not null check(octet_length(page_json) between 2 and 262144),
 page_sha256 text not null check(page_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(operation_id,ordinal),
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id)
);

-- The map represents canonical source identities from a specific admitted
-- operation, not a second movement ledger or a native sale ID assignment.
create table public.payment_history_local_publication_map (
 shop_id uuid not null,
 operation_id uuid not null,
 source_ordinal integer not null check(source_ordinal between 1 and 100000),
 movement_version_id uuid not null,
 owned boolean not null,
 primary key(operation_id,source_ordinal),
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id),
 foreign key(shop_id,movement_version_id) references public.payment_history_movement_versions(shop_id,movement_version_id)
);

create table public.payment_history_local_drain_set (
 shop_id uuid not null,
 frozen_writer_epoch bigint not null check(frozen_writer_epoch>0),
 operation_id uuid not null,
 grant_id uuid not null,
 content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),
 primary key(shop_id,frozen_writer_epoch,operation_id),
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id)
);

do $$declare name text;begin
 foreach name in array array['local_writer_contexts','local_publications','local_publication_pages','local_publication_map','local_drain_set'] loop
  execute format('alter table public.payment_history_%I enable row level security',name);
  execute format('revoke all on public.payment_history_%I from public,anon,authenticated,service_role',name);
 end loop;
end;$$;

create function app_private.payment_history_local_publication_immutable_v2() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='payment_history_local_publication_pages' and tg_op='DELETE'
    and not exists(select 1 from public.payment_history_local_publications p where p.operation_id=old.operation_id and p.grant_id is not null) then
  -- Incomplete, never-authorized staging may be garbage-collected. An issued
  -- decision and its content remain permanent until reconciled, even after TTL.
  return old;
 end if;
 raise exception using errcode='55000',message='payment_history_local_publication_immutable';
end;$$;
revoke all on function app_private.payment_history_local_publication_immutable_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_page_immutable before update or delete on public.payment_history_local_publication_pages
 for each row execute function app_private.payment_history_local_publication_immutable_v2();
create trigger payment_history_local_map_immutable before update or delete on public.payment_history_local_publication_map
 for each row execute function app_private.payment_history_local_publication_immutable_v2();
create trigger payment_history_local_drain_immutable before update or delete on public.payment_history_local_drain_set
 for each row execute function app_private.payment_history_local_publication_immutable_v2();

create function app_private.payment_history_local_identity_guard_v2() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.state in('committed','aborted')
  or row(new.operation_id,new.shop_id,new.shop_device_id,new.server_dataset_id,new.local_dataset_id,new.restore_lineage_id,new.restore_epoch,new.writer_epoch,new.operation_kind,new.request_fingerprint,new.content_digest,new.protocol_version,new.base_revision,new.page_count)
     is distinct from row(old.operation_id,old.shop_id,old.shop_device_id,old.server_dataset_id,old.local_dataset_id,old.restore_lineage_id,old.restore_epoch,old.writer_epoch,old.operation_kind,old.request_fingerprint,old.content_digest,old.protocol_version,old.base_revision,old.page_count)
  or old.grant_id is not null and row(new.grant_id,new.authorization_staff_id,new.authorization_credential_version,new.issued_at,new.expires_at)
     is distinct from row(old.grant_id,old.authorization_staff_id,old.authorization_credential_version,old.issued_at,old.expires_at)
  or new.staged_pages<old.staged_pages or new.staged_bytes<old.staged_bytes then
  raise exception using errcode='55000',message='payment_history_local_publication_immutable';
 end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_identity_guard_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_identity_guard before update or delete on public.payment_history_local_publications
 for each row execute function app_private.payment_history_local_identity_guard_v2();

create function app_private.payment_history_local_cutover_fence_v2() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.writer_authority='web' and old.writer_authority<>'web' and exists(
  select 1 from public.payment_history_local_publications p where p.shop_id=new.shop_id and p.grant_id is not null and p.state not in('committed','aborted')) then
  raise exception using errcode='40001',message='payment_history_local_publications_not_drained';
 end if;
 if new.writer_authority='frozen' and old.writer_authority='local' then
  insert into public.payment_history_local_drain_set(shop_id,frozen_writer_epoch,operation_id,grant_id,content_digest)
   select new.shop_id,new.writer_epoch,p.operation_id,p.grant_id,p.content_digest
   from public.payment_history_local_publications p
   where p.shop_id=new.shop_id and p.writer_epoch=old.writer_epoch and p.grant_id is not null and p.state not in('committed','aborted');
 end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_cutover_fence_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_cutover_fence before update on public.payment_history_runtime
 for each row execute function app_private.payment_history_local_cutover_fence_v2();

-- Exact commercial clock conversion; no PostgreSQL microsecond rounding of
-- the original .NET 100ns business ticks and no session-time-zone conversion.
create function app_private.payment_history_clock_from_ticks_v2(p_ticks text) returns text
language plpgsql immutable set search_path='' as $$
declare n bigint;d date;s bigint;begin
 if p_ticks is null or p_ticks !~ '^(0|[1-9][0-9]*)$' then raise exception using errcode='22023',message='payment_history_ticks_invalid';end if;
 n:=p_ticks::bigint;if n<0 or n>3155378975999999999 then raise exception using errcode='22023',message='payment_history_ticks_invalid';end if;
 d:=date '0001-01-01'+(n/864000000000)::integer;s:=(n%864000000000)/10000000;
 return to_char(d,'YYYY-MM-DD')||'T'||lpad((s/3600)::text,2,'0')||':'||lpad(((s%3600)/60)::text,2,'0')||':'||lpad((s%60)::text,2,'0')||'.'||lpad((n%10000000)::text,7,'0');
end;$$;
revoke all on function app_private.payment_history_clock_from_ticks_v2(text) from public,anon,authenticated,service_role;

-- Reuses the existing economics/proof/identity contracts. These are normalized
-- POS facts, not another OOXML parser and never an instruction to replay sales.
create function app_private.payment_history_local_transaction_v2(f jsonb,p_source_hash text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text;t jsonb;clock text;utc_clock text;raw_ticks bigint;utc_ticks bigint;business_ticks bigint;
 minutes integer;parts text[];hours integer;offset_minute integer;v_ms bigint;begin
 if jsonb_typeof(f) is distinct from 'object' or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$'
  or coalesce(f->>'profile','') not in('GetnetLegacy','GetnetModern') or length(coalesce(f->>'time_policy_version','')) not between 1 and 160
  or length(coalesce(f->>'time_evidence_reference',''))>2048 or length(coalesce(f->>'source_sheet',''))>256
  or coalesce(f->>'source_row','') !~ '^[1-9][0-9]*$' or (f->>'source_row')::bigint>1048576
  or coalesce(f->>'card_subtype','') not in('Unknown','Debit','Credit','Prepaid') then raise exception using errcode='22023',message='payment_history_transaction_invalid';end if;
 foreach k in array array['gross_clp','fee_clp','fee_vat_clp','net_clp','business_ticks','offset_minutes','occurred_at_utc_ms'] loop
  if f->>k is not null and (jsonb_typeof(f->k)<>'string' or (f->>k) !~ '^(0|-?[1-9][0-9]*)$') then raise exception using errcode='22023',message='payment_history_amount_invalid';end if;
 end loop;
 business_ticks:=(f->>'business_ticks')::bigint;clock:=app_private.payment_history_clock_from_ticks_v2(f->>'business_ticks');
 if f->>'profile'='GetnetLegacy' then
  if f->>'offset_minutes' is not null or f->>'occurred_at_utc_ms' is not null or f->>'time_interpretation' is distinct from 'Unresolved'
   or f->>'external_namespace' is distinct from 'getnet.legacy.transaction' then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  -- Excel serial/date-system cell metadata was not retained by the legacy
  -- ledger. Keep its attested clock/raw value; never promote it to provider proof.
 else
  if f->>'external_namespace' is distinct from 'getnet.financial.movement' or coalesce(f->>'time_interpretation','') not in('IsoUtc','ExportedLocal')
   or coalesce(f->>'timestamp_raw','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,7})?Z$'
   or f->>'offset_minutes' is null or f->>'occurred_at_utc_ms' is null then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  parts:=regexp_match(btrim(f->>'offset_raw'),'^([+-]?)([0-9]{1,2})(:([0-9]{2}))?$');
  if parts is null then raise exception using errcode='22023',message='payment_history_offset_invalid';end if;
  hours:=parts[2]::integer;offset_minute:=coalesce(parts[4],'0')::integer;
  if hours>14 or offset_minute>59 or hours=14 and offset_minute<>0 then raise exception using errcode='22023',message='payment_history_offset_invalid';end if;
  minutes:=(case when parts[1]='-' then -1 else 1 end)*(hours*60+offset_minute);
  if minutes is distinct from (f->>'offset_minutes')::integer then raise exception using errcode='22023',message='payment_history_offset_invalid';end if;
  raw_ticks:=app_private.payment_history_ticks_v1(f->>'timestamp_raw');
  utc_ticks:=case when f->>'time_interpretation'='IsoUtc' then raw_ticks else raw_ticks-minutes::bigint*600000000 end;
  if business_ticks is distinct from case when f->>'time_interpretation'='IsoUtc' then raw_ticks+minutes::bigint*600000000 else raw_ticks end then
   raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  v_ms:=floor((utc_ticks::numeric-621355968000000000)/10000)::bigint;
  if v_ms is distinct from (f->>'occurred_at_utc_ms')::bigint then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  utc_clock:=app_private.payment_history_clock_from_ticks_v2(utc_ticks::text)||'Z';
 end if;
 t:=jsonb_build_object('source',jsonb_build_object('fileId',f->>'source_file_id','fileSha256',p_source_hash,'sheetName',f->>'source_sheet','rowNumber',(f->>'source_row')::integer),
  'profile',f->>'profile','profileVersion',case when f->>'profile'='GetnetLegacy' then 'getnet-legacy-v1' else 'getnet-modern-v1' end,
  'parserVersion','history-pos-normalized-v2','provider','getnet','currency','CLP','paymentMethod','card','externalNamespace',f->>'external_namespace','externalId',f->>'external_id',
  'paymentId',f->>'payment_id','authorizationCode',f->>'authorization_code',
  'merchant',jsonb_build_object('local',f->>'merchant_local','seller',f->>'merchant_seller','sellerId',f->>'merchant_seller_id','localNumber',f->>'merchant_local_number','rut',f->>'merchant_rut','hasEvidence',true),
  'timestamp',jsonb_build_object('rawTimestamp',f->>'timestamp_raw','rawOffset',f->>'offset_raw','offsetMinutes',minutes,'businessDateTime',clock,'occurredAtUtc',utc_clock,
   'interpretation',f->>'time_interpretation','policyVersion',f->>'time_policy_version','evidenceReference',f->>'time_evidence_reference','needsEvidence',false),
  'movementKind',f->>'movement_kind','transactionStatus',upper(trim(f->>'transaction_state')),'sourceTransactionStatus',f->>'transaction_state','settlementStatus',f->>'settlement_state',
  'grossClp',f->>'gross_clp','commissionClp',f->>'fee_clp','commissionVatClp',f->>'fee_vat_clp','netClp',f->>'net_clp','cardSubtype',f->>'card_subtype',
  'originalCardType',f->>'original_card_type','originalPrepaid',f->>'original_prepaid','terminal',f->>'terminal','rawSettlementDate',f->>'settlement_date_raw','originalCashierId',null);
 -- The v1 helper's parser marker belongs to its input adapter. Reuse its exact
 -- monetary validation while retaining the actual v2 provenance in the ledger.
 perform app_private.payment_history_economics_v1(t||jsonb_build_object('parserVersion','getnet-ooxml-web-v1'));
 if app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',f->>'merchant_local',f->>'merchant_seller',f->>'merchant_seller_id',f->>'merchant_local_number',f->>'merchant_rut']) is distinct from f->>'alias_key' then
  raise exception using errcode='22023',message='payment_history_merchant_alias_invalid';end if;
 return t;
end;$$;
revoke all on function app_private.payment_history_local_transaction_v2(jsonb,text) from public,anon,authenticated,service_role;
