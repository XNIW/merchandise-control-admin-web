-- ASUS019 C1. Dedicated historical card ledger. Never writes native POS/stock/outbox.
create table public.payment_history_runtime (
 shop_id uuid primary key references public.shops(shop_id),
 dataset_id uuid not null default gen_random_uuid(), revision bigint not null default 0 check(revision>=0),
 writer_epoch bigint not null default 1 check(writer_epoch>0),
 writer_authority text not null default 'local' check(writer_authority in ('local','frozen','web')),
 minimum_client_version text, inventory_verified boolean not null default false,
 frozen_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), unique(shop_id,dataset_id)
);
create table public.payment_history_role_permissions (
 shop_id uuid not null references public.shops(shop_id),
 role_key text not null check(role_key in ('shop_manager','manager','pos_admin')),
 capability text not null check(capability in ('read','import','cancel','export','migrate')),
 enabled boolean not null default false, updated_at timestamptz not null default clock_timestamp(),
 primary key(shop_id,role_key,capability)
);
create table public.payment_history_uploads (
 upload_id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(shop_id),
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')), actor_id uuid not null,
 object_key text not null unique check(object_key ~ '^history/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
 file_name text not null check(length(file_name) between 1 and 256),
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 byte_length bigint not null check(byte_length between 1 and 20971520),
 state text not null default 'pending' check(state in ('pending','uploaded','verifying','verified','rejected','expired')),
 verification_token uuid,verification_fence bigint not null default 0,verification_expires_at timestamptz,verification_attempts integer not null default 0 check(verification_attempts between 0 and 3),
 created_at timestamptz not null default clock_timestamp(), verified_at timestamptz,
 unique(shop_id,upload_id),check(split_part(object_key,'/',2)=shop_id::text and split_part(object_key,'/',3)=upload_id::text),
 check(state<>'verified' or verified_at is not null)
);
create index payment_history_upload_actor_idx on public.payment_history_uploads(shop_id,actor_kind,actor_id,created_at desc);
create table public.payment_history_evidence (
 evidence_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 kind text not null check(kind in ('merchant_mapping','legacy_currency','modern_time','native_start','device_inventory','migration_reconcile','economic_correction')),
 verification_level text not null check(verification_level in ('unverified','operator_attested','provider_verified')),
 status text not null default 'draft' check(status in ('draft','verified','revoked')),
 policy_version text not null check(length(policy_version) between 1 and 160),
 reference text not null check(length(reference) between 1 and 2048),
 document_sha256 text check(document_sha256 ~ '^[0-9a-f]{64}$'),
 document_upload_id uuid, scope jsonb not null check(jsonb_typeof(scope)='object' and octet_length(scope::text)<=16384),
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')), actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), verified_at timestamptz, revoked_at timestamptz,
 unique(shop_id,evidence_id),foreign key(shop_id,document_upload_id) references public.payment_history_uploads(shop_id,upload_id),
 check(status<>'verified' or (verification_level<>'unverified' and verified_at is not null)),
 check(verification_level<>'provider_verified' or (document_sha256 is not null and document_upload_id is not null))
);
create table public.payment_history_merchants (
 merchant_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 provider text not null default 'getnet' check(provider='getnet'),label text not null check(length(label) between 1 and 256),
 evidence_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(shop_id,merchant_id),foreign key(shop_id,evidence_id) references public.payment_history_evidence(shop_id,evidence_id)
);
create table public.payment_history_merchant_aliases (
 alias_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 merchant_id uuid not null,alias_version text not null default 'getnet-merchant-alias-v1' check(alias_version='getnet-merchant-alias-v1'),
 alias_key text not null check(alias_key ~ '^[0-9a-f]{64}$'),
 source_identity jsonb not null check(jsonb_typeof(source_identity)='object' and octet_length(source_identity::text)<=8192),
 evidence_id uuid not null,active boolean not null default true,created_at timestamptz not null default clock_timestamp(),
 unique(shop_id,alias_id),foreign key(shop_id,merchant_id) references public.payment_history_merchants(shop_id,merchant_id),
 foreign key(shop_id,evidence_id) references public.payment_history_evidence(shop_id,evidence_id)
);
create unique index payment_history_alias_active_idx on public.payment_history_merchant_aliases(shop_id,alias_version,alias_key) where active;
create table public.payment_history_jobs (
 job_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')),actor_id uuid not null,
 actor_session_id uuid not null,actor_credential_version integer,
 request_key uuid not null,request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
 state text not null default 'queued' check(state in ('queued','analysing','review_ready','committing','committed','cancelled','failed')),
 parser_version text not null check(parser_version='getnet-ooxml-web-v1'),
 configuration jsonb not null check(jsonb_typeof(configuration)='object' and octet_length(configuration::text)<=32768),
 source_upload_ids uuid[] not null check(cardinality(source_upload_ids) between 1 and 10),
 lease_token uuid,lease_fence bigint not null default 0 check(lease_fence>=0),lease_expires_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 3),attempt_started_at timestamptz,
 processed_rows integer not null default 0 check(processed_rows between 0 and 100000),
 analysis_digest text check(analysis_digest ~ '^[0-9a-f]{64}$'),analysis_summary jsonb,analysis_merchants jsonb not null default '[]',diagnostics jsonb not null default '[]',
 reviewed_revision bigint,reviewed_writer_epoch bigint,review_digest text check(review_digest ~ '^[0-9a-f]{64}$'),
 reviewed_at timestamptz,error_code text,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(shop_id,job_id),unique(shop_id,actor_kind,actor_id,request_key),
 check((actor_kind='pos_staff_manager' and actor_credential_version>0) or (actor_kind='personal_account' and actor_credential_version is null))
);
create index payment_history_job_queue_idx on public.payment_history_jobs(state,lease_expires_at,created_at) where state in ('queued','analysing');
create table public.payment_history_staged_movements (
 shop_id uuid not null,job_id uuid not null,ordinal integer not null check(ordinal between 1 and 100000),
 source_upload_id uuid not null,source_row integer not null check(source_row>0),source_sheet text not null check(length(source_sheet)<=256),
 alias_key text not null check(alias_key ~ '^[0-9a-f]{64}$'),merchant_id uuid,
 identity_key text, economic_digest text not null check(economic_digest ~ '^[0-9a-f]{64}$'),
 transaction jsonb not null check(jsonb_typeof(transaction)='object' and octet_length(transaction::text)<=32768),economics jsonb not null,
 primary key(job_id,ordinal),foreign key(shop_id,job_id) references public.payment_history_jobs(shop_id,job_id),
 foreign key(shop_id,source_upload_id) references public.payment_history_uploads(shop_id,upload_id),
 foreign key(shop_id,merchant_id) references public.payment_history_merchants(shop_id,merchant_id)
);
create table public.payment_history_batches (
 batch_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),job_id uuid,
 origin text not null check(origin in ('web_import','local_migration')),
 state text not null default 'active' check(state in ('active','cancelled')),
 apply_operation_id uuid not null unique,created_revision bigint not null check(created_revision>0),cancelled_revision bigint,
 created_at timestamptz not null default clock_timestamp(),cancelled_at timestamptz,
 unique(shop_id,batch_id),foreign key(shop_id,job_id) references public.payment_history_jobs(shop_id,job_id),
 check((state='active' and cancelled_revision is null and cancelled_at is null) or (state='cancelled' and cancelled_revision is not null and cancelled_at is not null))
);
create table public.payment_history_movement_versions (
 movement_version_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 merchant_id uuid not null,provider text not null default 'getnet' check(provider='getnet'),
 external_namespace text not null check(external_namespace in ('getnet.legacy.transaction','getnet.financial.movement')),
 external_id text not null check(length(external_id) between 1 and 256 and position(chr(31) in external_id)=0),
 identity_key text not null check(identity_key ~ '^[0-9a-f]{64}$'),economic_digest text not null check(economic_digest ~ '^[0-9a-f]{64}$'),
 business_ticks bigint not null check(business_ticks between 0 and 3155378975999999999),business_date date not null,
 gross_clp bigint not null,commission_clp bigint,commission_vat_clp bigint,net_clp bigint,
 movement_kind text not null check(movement_kind in ('Sale','Cancellation')),
 transaction_state text not null check(transaction_state in ('ABONADO','CONFIRMADA')),
 transaction jsonb not null check(jsonb_typeof(transaction)='object' and octet_length(transaction::text)<=32768),
 owner_batch_id uuid not null,source_upload_id uuid,source_row integer,source_sheet text,
 active boolean not null default true,supersedes_version_id uuid,created_revision bigint not null check(created_revision>0),
 created_at timestamptz not null default clock_timestamp(),
 unique(shop_id,movement_version_id),foreign key(shop_id,merchant_id) references public.payment_history_merchants(shop_id,merchant_id),
 foreign key(shop_id,owner_batch_id) references public.payment_history_batches(shop_id,batch_id),
 foreign key(shop_id,source_upload_id) references public.payment_history_uploads(shop_id,upload_id),
 foreign key(shop_id,supersedes_version_id) references public.payment_history_movement_versions(shop_id,movement_version_id),
 check((movement_kind='Sale' and gross_clp>0) or (movement_kind='Cancellation' and gross_clp<0))
);
create unique index payment_history_movement_active_identity_idx on public.payment_history_movement_versions(shop_id,provider,merchant_id,external_namespace,external_id) where active;
create index payment_history_movement_report_idx on public.payment_history_movement_versions(shop_id,business_date,movement_version_id) where active;
create index payment_history_movement_owner_idx on public.payment_history_movement_versions(shop_id,owner_batch_id) where active;
create index payment_history_movement_identity_versions_idx on public.payment_history_movement_versions(shop_id,identity_key,created_revision desc);
create table public.payment_history_duplicate_observations (
 observation_id uuid primary key default gen_random_uuid(),shop_id uuid not null,batch_id uuid not null,
 movement_version_id uuid not null,source_upload_id uuid not null,source_sheet text not null,source_row integer not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(shop_id,batch_id) references public.payment_history_batches(shop_id,batch_id),
 foreign key(shop_id,movement_version_id) references public.payment_history_movement_versions(shop_id,movement_version_id),
 foreign key(shop_id,source_upload_id) references public.payment_history_uploads(shop_id,upload_id)
);
create table public.payment_history_receipts (
 operation_id uuid primary key,shop_id uuid not null references public.shops(shop_id),batch_id uuid not null,
 operation_kind text not null check(operation_kind in ('apply','cancel','migrate')),
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')),actor_id uuid not null,
 request_key uuid not null,request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
 receipt jsonb not null check(jsonb_typeof(receipt)='object' and octet_length(receipt::text)<=1048576),
 created_at timestamptz not null default clock_timestamp(),unique(shop_id,operation_id),
 unique(shop_id,actor_kind,actor_id,request_key),foreign key(shop_id,batch_id) references public.payment_history_batches(shop_id,batch_id)
);
create table public.payment_history_revisions (
 shop_id uuid not null references public.shops(shop_id),revision bigint not null check(revision>0),ordinal integer not null check(ordinal>0),
 movement_version_id uuid not null,operation_id uuid not null,change_kind text not null check(change_kind in ('upsert','tombstone')),
 created_at timestamptz not null default clock_timestamp(),primary key(shop_id,revision,ordinal),
 foreign key(shop_id,movement_version_id) references public.payment_history_movement_versions(shop_id,movement_version_id),
 foreign key(shop_id,operation_id) references public.payment_history_receipts(shop_id,operation_id) deferrable initially deferred
);

-- RLS is mandatory even on server-only staging tables. No browser write grants.
do $$declare name text;begin
 foreach name in array array['runtime','role_permissions','uploads','evidence','merchants','merchant_aliases','jobs','staged_movements','batches','movement_versions','duplicate_observations','receipts','revisions'] loop
  execute format('alter table public.payment_history_%I enable row level security',name);
  execute format('revoke all on public.payment_history_%I from public,anon,authenticated,service_role',name);
 end loop;
end;$$;

create function app_private.payment_history_profile_can_v1(p_shop_id uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_capability in ('read','import','cancel','export','migrate') and auth.uid() is not null
 and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from auth.sessions ses where ses.id::text=auth.jwt()->>'session_id' and ses.user_id=auth.uid()
   and (ses.not_after is null or ses.not_after>clock_timestamp()))
 and exists(select 1 from public.shops s join public.shop_members m on m.shop_id=s.shop_id join public.profiles pr on pr.profile_id=m.profile_id and pr.profile_status='active' and pr.disabled_at is null
  where s.shop_id=p_shop_id and s.shop_status='active' and m.profile_id=auth.uid() and m.membership_status='active'
  and (m.role_key='shop_owner' or (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g
    where g.shop_id=p_shop_id and g.role_key='shop_manager' and g.capability=p_capability and g.enabled))));
$$;
revoke all on function app_private.payment_history_profile_can_v1(uuid,text) from public,anon,service_role;
grant execute on function app_private.payment_history_profile_can_v1(uuid,text) to authenticated;

create function app_private.payment_history_staff_can_v1(p_shop_id uuid,p_staff_id uuid,p_capability text)
returns boolean language sql volatile security definer set search_path='' as $$
 select p_capability in ('read','import','cancel','export','migrate') and exists(
  select 1 from public.staff_accounts a where a.shop_id=p_shop_id and a.staff_id=p_staff_id
  and a.status='active' and a.role_key in ('manager','pos_admin')
  and coalesce((select g.enabled from public.payment_history_role_permissions g where g.shop_id=p_shop_id and g.role_key=a.role_key and g.capability=p_capability),
    exists(select 1 from public.staff_role_permissions g where g.shop_id=p_shop_id and g.role_key=a.role_key and g.permission_key='shop_admin.full_access' and g.enabled))
 );
$$;
revoke all on function app_private.payment_history_staff_can_v1(uuid,uuid,text) from public,anon,authenticated,service_role;

create function app_private.payment_history_demand_actor_v1(p_shop_id uuid,p_capability text,p_staff_id uuid,
 p_staff_web_session_id uuid,p_session_token_hash text,p_credential_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_session uuid;v_deadline timestamptz;v_role text;v_enabled boolean;
begin
 if p_capability is null or p_capability not in ('read','import','cancel','export','migrate') then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform 1 from public.shops where shop_id=p_shop_id and shop_status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 if p_staff_id is not null then
  if coalesce(auth.role(),'')<>'service_role' or p_session_token_hash is null or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
   or p_staff_web_session_id is null or coalesce(p_credential_version,0)<1
   or not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version,null)
   or not app_private.payment_history_staff_can_v1(p_shop_id,p_staff_id,p_capability) then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  select role_key into v_role from public.staff_accounts where staff_id=p_staff_id and shop_id=p_shop_id;
  perform pg_advisory_xact_lock(hashtextextended('payment-history-role:'||p_shop_id::text||':'||v_role,0));
  select enabled into v_enabled from public.payment_history_role_permissions
   where shop_id=p_shop_id and role_key=v_role and capability=p_capability for share;
  if found then
   if not v_enabled then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  else
   perform 1 from public.staff_role_permissions where shop_id=p_shop_id and role_key=v_role and permission_key='shop_admin.full_access' and enabled for share;
   if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  end if;
  perform set_config('app.payment_history_publish_deadline',current_setting('app.staff_web_publish_deadline'),true);
  return jsonb_build_object('kind','pos_staff_manager','id',p_staff_id,'session_id',p_staff_web_session_id,'credential_version',p_credential_version);
 end if;
 if p_staff_web_session_id is not null or p_session_token_hash is not null or p_credential_version is not null
  or coalesce(auth.role(),'')<>'authenticated' or not app_private.payment_history_profile_can_v1(p_shop_id,p_capability)
  or coalesce(auth.jwt()->>'exp','') !~ '^[0-9]{1,12}$' then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 select m.role_key into v_role from public.shop_members m where m.shop_id=p_shop_id and m.profile_id=auth.uid() and m.membership_status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform 1 from public.profiles where profile_id=auth.uid() and profile_status='active' and disabled_at is null for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 if v_role='shop_manager' then perform 1 from public.payment_history_role_permissions where shop_id=p_shop_id and role_key='shop_manager' and capability=p_capability and enabled for share;
  if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;end if;
 select ses.id,least(coalesce(ses.not_after,'infinity'),to_timestamp((auth.jwt()->>'exp')::bigint)) into v_session,v_deadline
  from auth.sessions ses where ses.id::text=auth.jwt()->>'session_id' and ses.user_id=auth.uid() for share;
 if not found or v_deadline<=clock_timestamp() then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform set_config('app.payment_history_publish_deadline',v_deadline::text,true);
 return jsonb_build_object('kind','personal_account','id',auth.uid(),'session_id',v_session,'credential_version',null);
end;$$;
revoke all on function app_private.payment_history_demand_actor_v1(uuid,text,uuid,uuid,text,integer) from public,anon,authenticated,service_role;

create function app_private.payment_history_publishable_v1()
returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(nullif(current_setting('app.payment_history_publish_deadline',true),'')::timestamptz>clock_timestamp(),false);
$$;
revoke all on function app_private.payment_history_publishable_v1() from public,anon,authenticated,service_role;

do $$declare name text;begin
 foreach name in array array['runtime','merchants','merchant_aliases','batches','movement_versions','receipts','revisions'] loop
  execute format('grant select on public.payment_history_%I to authenticated',name);
  execute format('create policy payment_history_scoped_read on public.payment_history_%I for select to authenticated using (app_private.payment_history_profile_can_v1(shop_id,''read''))',name);
 end loop;
end;$$;

create function app_private.payment_history_immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='payment_history_immutable_record';end;$$;
revoke all on function app_private.payment_history_immutable_v1() from public,anon,authenticated,service_role;
create trigger payment_history_receipt_immutable before update or delete on public.payment_history_receipts for each row execute function app_private.payment_history_immutable_v1();
create trigger payment_history_revision_immutable before update or delete on public.payment_history_revisions for each row execute function app_private.payment_history_immutable_v1();
create trigger payment_history_duplicate_immutable before update or delete on public.payment_history_duplicate_observations for each row execute function app_private.payment_history_immutable_v1();

create function app_private.payment_history_facts_immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='55000',message='payment_history_immutable_record';end if;
 if tg_table_name='payment_history_movement_versions' then
  if old.active and not new.active and (to_jsonb(new)-'active')=(to_jsonb(old)-'active') then return new;end if;
 elsif tg_table_name='payment_history_evidence' then
  if (to_jsonb(new)-array['status','verified_at','revoked_at'])=(to_jsonb(old)-array['status','verified_at','revoked_at']) then return new;end if;
 elsif tg_table_name='payment_history_uploads' then
  if (to_jsonb(new)-array['state','verified_at','verification_token','verification_fence','verification_expires_at','verification_attempts'])=(to_jsonb(old)-array['state','verified_at','verification_token','verification_fence','verification_expires_at','verification_attempts']) then return new;end if;
 end if;
 raise exception using errcode='55000',message='payment_history_immutable_record';
end;$$;
revoke all on function app_private.payment_history_facts_immutable_v1() from public,anon,authenticated,service_role;
create trigger payment_history_movement_facts_immutable before update or delete on public.payment_history_movement_versions for each row execute function app_private.payment_history_facts_immutable_v1();
create trigger payment_history_evidence_facts_immutable before update or delete on public.payment_history_evidence for each row execute function app_private.payment_history_facts_immutable_v1();
create trigger payment_history_upload_facts_immutable before update or delete on public.payment_history_uploads for each row execute function app_private.payment_history_facts_immutable_v1();

-- Shared canonical hashes match the net48 UTF-16 length-prefixed protocol.
create function app_private.payment_history_field_hash_v1(p_fields text[]) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(coalesce(string_agg(
   coalesce((select sum(case when ascii(substr(coalesce(f,''),n,1))>65535 then 2 else 1 end)
      from generate_series(1,length(coalesce(f,''))) n),0)::text||':'||coalesce(f,''),'' order by ord),''),'UTF8'),'sha256'),'hex')
 from unnest(p_fields) with ordinality x(f,ord);
$$;
revoke all on function app_private.payment_history_field_hash_v1(text[]) from public,anon,authenticated,service_role;
create function app_private.payment_history_ticks_v1(p_value text) returns bigint
language plpgsql immutable set search_path='' as $$
declare d date;v bigint;begin
 if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,7})?Z?$' then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
 d:=substr(p_value,1,10)::date;
 if extract(year from d) not between 1 and 9999 or substr(p_value,12,2)::integer>23 or substr(p_value,15,2)::integer>59 or substr(p_value,18,2)::integer>59 then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
 v:=(d-date '0001-01-01')::bigint*864000000000+substr(p_value,12,2)::bigint*36000000000+substr(p_value,15,2)::bigint*600000000+substr(p_value,18,2)::bigint*10000000;
 if substr(p_value,20,1)='.' then v:=v+rpad(rtrim(substr(p_value,21),'Z'),7,'0')::bigint;end if;
 return v;
end;$$;
revoke all on function app_private.payment_history_ticks_v1(text) from public,anon,authenticated,service_role;

create function app_private.payment_history_economics_v1(p_transaction jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb;g bigint;c bigint;t bigint;n bigint;k text;s text;begin
 if jsonb_typeof(p_transaction) is distinct from 'object' or p_transaction->>'provider' is distinct from 'getnet' or p_transaction->>'currency' is distinct from 'CLP'
  or p_transaction->>'parserVersion' is distinct from 'getnet-ooxml-web-v1' or coalesce(p_transaction->>'externalNamespace','') not in ('getnet.legacy.transaction','getnet.financial.movement')
  or length(coalesce(p_transaction->>'externalId','')) not between 1 and 256 or (p_transaction->>'externalId') ~ '[[:cntrl:]]'
  or coalesce(p_transaction->>'profile','') not in ('GetnetLegacy','GetnetModern') then raise exception using errcode='22023',message='payment_history_transaction_invalid';end if;
 foreach k in array array['grossClp','commissionClp','commissionVatClp','netClp'] loop
  if p_transaction->>k is not null and (jsonb_typeof(p_transaction->k)<>'string' or (p_transaction->>k) !~ '^(0|-?[1-9][0-9]*)$') then raise exception using errcode='22023',message='payment_history_amount_invalid';end if;
 end loop;
 g:=(p_transaction->>'grossClp')::bigint;c:=(p_transaction->>'commissionClp')::bigint;t:=(p_transaction->>'commissionVatClp')::bigint;n:=(p_transaction->>'netClp')::bigint;
 k:=p_transaction->>'movementKind';s:=upper(trim(p_transaction->>'transactionStatus'));
 if g is null or k is null or not ((k='Sale' and g>0) or (k='Cancellation' and g<0)) or s is null or s not in ('ABONADO','CONFIRMADA')
  or (p_transaction->>'profile'='GetnetLegacy' and (k<>'Sale' or c is null or c<0 or n is null or t is not null or n::numeric<>g::numeric-c::numeric))
  or (p_transaction->>'profile'='GetnetModern' and ((g>0 and (c>0 or t>0)) or (g<0 and (c<0 or t<0))
   or (n is not null and c is not null and t is not null and n::numeric<>g::numeric+c::numeric+t::numeric)))
  then raise exception using errcode='22023',message='payment_history_economics_invalid';end if;
 v:=jsonb_build_object('businessTicks',app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}')::text,
  'grossClp',g::text,'commissionClp',c::text,'commissionVatClp',t::text,'netClp',n::text,'movementKind',k,'transactionState',s);
 return v;
end;$$;
revoke all on function app_private.payment_history_economics_v1(jsonb) from public,anon,authenticated,service_role;
create function app_private.payment_history_economic_digest_v1(p_economics jsonb) returns text language sql immutable set search_path='' as $$
 select app_private.payment_history_field_hash_v1(array['historical-economics-v1',p_economics->>'businessTicks',p_economics->>'grossClp',coalesce(p_economics->>'commissionClp','null'),coalesce(p_economics->>'commissionVatClp','null'),coalesce(p_economics->>'netClp','null'),p_economics->>'movementKind',p_economics->>'transactionState']);
$$;
revoke all on function app_private.payment_history_economic_digest_v1(jsonb) from public,anon,authenticated,service_role;
create function app_private.payment_history_conflict_v1(a jsonb,b jsonb) returns boolean language sql immutable set search_path='' as $$
 select a->>'businessTicks' is distinct from b->>'businessTicks' or a->>'grossClp' is distinct from b->>'grossClp'
 or a->>'movementKind' is distinct from b->>'movementKind' or a->>'transactionState' is distinct from b->>'transactionState'
 or exists(select 1 from unnest(array['commissionClp','commissionVatClp','netClp']) k where a->>k is not null and b->>k is not null and a->>k<>b->>k);
$$;
revoke all on function app_private.payment_history_conflict_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Proof lookup only uses persisted, versioned, non-revoked evidence. Free text in a
-- job is never promoted to provider verification. Periods are half-open 100ns ticks.
create function app_private.payment_history_proof_covers_v1(p_shop uuid,p_ids uuid[],p_kind text,p_merchant uuid,p_hash text,p_transaction jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id=any(p_ids)
 and e.kind=p_kind and e.status='verified' and e.verification_level<>'unverified'
 and e.scope->>'merchant_id'=p_merchant::text and e.scope->'file_sha256' ? p_hash
 and coalesce(e.scope->>'from_ticks','') ~ '^[0-9]{1,19}$' and coalesce(e.scope->>'to_ticks','') ~ '^[0-9]{1,19}$'
 and (case when p_kind='modern_time' then app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,rawTimestamp}')
   else app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}') end) >= (e.scope->>'from_ticks')::bigint
 and (case when p_kind='modern_time' then app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,rawTimestamp}')
   else app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}') end) < (e.scope->>'to_ticks')::bigint
 and (p_kind<>'modern_time' or (e.verification_level='provider_verified' and e.document_sha256 is not null
   and e.policy_version=p_transaction#>>'{timestamp,policyVersion}' and e.scope->>'interpretation'=p_transaction#>>'{timestamp,interpretation}'
   and exists(select 1 from public.payment_history_uploads u where u.shop_id=p_shop and u.upload_id=e.document_upload_id and u.state='verified' and u.file_sha256=e.document_sha256)))
 and (p_kind<>'native_start' or (coalesce(e.scope->>'native_start_ticks','') ~ '^[0-9]{1,19}$'
   and app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}')<(e.scope->>'native_start_ticks')::bigint)));
$$;
revoke all on function app_private.payment_history_proof_covers_v1(uuid,uuid[],text,uuid,text,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_job_actor_current_v1(j public.payment_history_jobs) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.actor_kind='pos_staff_manager' then exists(
 select 1 from public.staff_web_sessions s join public.staff_accounts a on a.shop_id=s.shop_id and a.staff_id=s.staff_id
 join public.shops sh on sh.shop_id=s.shop_id where sh.shop_status='active' and s.shop_id=j.shop_id and s.staff_id=j.actor_id
 and s.staff_web_session_id=j.actor_session_id and s.status='active' and s.revoked_at is null and s.expires_at>clock_timestamp()
 and app_private.staff_web_runtime_lease_is_valid_v1(j.shop_id,j.actor_id,j.actor_session_id,s.session_token_hash,j.actor_credential_version,null)
 and s.staff_credential_version=j.actor_credential_version and a.credential_version=j.actor_credential_version
 and a.status='active' and a.credential_status='active' and not a.must_change_credential and a.credential_expires_at>clock_timestamp()
 and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'import')) else exists(
 select 1 from auth.sessions s join public.shop_members m on m.profile_id=s.user_id and m.shop_id=j.shop_id
 join public.shops sh on sh.shop_id=m.shop_id where sh.shop_status='active' and s.id=j.actor_session_id and s.user_id=j.actor_id
 and (s.not_after is null or s.not_after>clock_timestamp()) and m.membership_status='active'
 and (m.role_key='shop_owner' or (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g
 where g.shop_id=j.shop_id and g.role_key=m.role_key and g.capability='import' and g.enabled)))) end;
$$;
revoke all on function app_private.payment_history_job_actor_current_v1(public.payment_history_jobs) from public,anon,authenticated,service_role;

-- Dedicated worker boundary: no commit operation and no commercial/outbox writes.
create function public.payment_history_worker_v1(p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j public.payment_history_jobs;u public.payment_history_uploads;r jsonb;t jsonb;e jsonb;v_count integer;v_ordinal integer;v_hash text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='payment_history_worker_denied';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8388608 then raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 if p_operation='claim_upload' then
  update public.payment_history_uploads set state='rejected',verification_token=null,verification_expires_at=null where state='verifying' and verification_expires_at<clock_timestamp() and verification_attempts>=3;
  select * into u from public.payment_history_uploads where (state='uploaded' or (state='verifying' and verification_expires_at<clock_timestamp())) and verification_attempts<3 order by created_at,upload_id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'upload',null);end if;
  update public.payment_history_uploads set state='verifying',verification_token=gen_random_uuid(),verification_fence=verification_fence+1,verification_attempts=verification_attempts+1,verification_expires_at=clock_timestamp()+interval '120 seconds' where upload_id=u.upload_id returning * into u;
  return jsonb_build_object('ok',true,'upload',jsonb_build_object('upload_id',u.upload_id,'shop_id',u.shop_id,'object_key',u.object_key,'file_name',u.file_name,'file_sha256',u.file_sha256,'byte_length',u.byte_length::text,'verification_token',u.verification_token,'verification_fence',u.verification_fence::text));
 elsif p_operation in ('verify_upload','reject_upload') then
  select * into u from public.payment_history_uploads where upload_id=(p_payload->>'upload_id')::uuid for update;
  if not found or u.state<>'verifying' or u.verification_token is distinct from (p_payload->>'verification_token')::uuid or u.verification_fence is distinct from (p_payload->>'verification_fence')::bigint
   or u.verification_expires_at<=clock_timestamp() then raise exception using errcode='40001',message='payment_history_upload_fence_stale';end if;
  if p_operation='reject_upload' then
   update public.payment_history_uploads set state=case when p_payload->>'retry'='true' and verification_attempts<3 then 'uploaded' else 'rejected' end,verification_token=null,verification_expires_at=null where upload_id=u.upload_id;
  else
   if u.file_sha256 is distinct from p_payload->>'sha256' or u.byte_length is distinct from (p_payload->>'byte_length')::bigint or u.object_key is distinct from p_payload->>'object_key' then raise exception using errcode='22023',message='payment_history_upload_mismatch';end if;
   update public.payment_history_uploads set state='verified',verified_at=clock_timestamp(),verification_token=null,verification_expires_at=null where upload_id=u.upload_id;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_operation='claim' then
  update public.payment_history_jobs set state='failed',error_code='history_attempts_exhausted',lease_token=null,lease_expires_at=null
   where state='analysing' and lease_expires_at<clock_timestamp() and attempts>=3;
  select * into j from public.payment_history_jobs where (state='queued' or (state='analysing' and lease_expires_at<clock_timestamp()))
   and attempts<3 order by created_at,job_id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'job',null);end if;
  if not app_private.payment_history_job_actor_current_v1(j) then
   update public.payment_history_jobs set state='failed',error_code='history_actor_revoked',lease_token=null,lease_expires_at=null where job_id=j.job_id;
   return jsonb_build_object('ok',true,'job',null);
  end if;
  delete from public.payment_history_staged_movements where job_id=j.job_id;
  update public.payment_history_jobs set state='analysing',attempts=attempts+1,attempt_started_at=clock_timestamp(),lease_token=gen_random_uuid(),lease_fence=lease_fence+1,
   lease_expires_at=clock_timestamp()+interval '120 seconds',processed_rows=0,analysis_digest=null,analysis_summary=null,diagnostics='[]',updated_at=clock_timestamp()
   where job_id=j.job_id returning * into j;
  return jsonb_build_object('ok',true,'job',jsonb_build_object('job_id',j.job_id,'shop_id',j.shop_id,'lease_token',j.lease_token,'lease_fence',j.lease_fence::text,
   'configuration',j.configuration,'uploads',(select jsonb_agg(jsonb_build_object('upload_id',x.upload_id,'object_key',x.object_key,'file_name',x.file_name,'file_sha256',x.file_sha256,'byte_length',x.byte_length::text) order by array_position(j.source_upload_ids,x.upload_id))
   from public.payment_history_uploads x where x.shop_id=j.shop_id and x.upload_id=any(j.source_upload_ids) and x.state='verified')));
 end if;
 select * into j from public.payment_history_jobs where job_id=(p_payload->>'job_id')::uuid for update;
 if not found or j.state<>'analysing' or j.lease_token is distinct from (p_payload->>'lease_token')::uuid
  or j.lease_fence is distinct from (p_payload->>'lease_fence')::bigint or j.lease_expires_at<=clock_timestamp()
  or j.attempt_started_at<clock_timestamp()-interval '30 minutes' then raise exception using errcode='40001',message='payment_history_worker_fence_stale';end if;
 if not app_private.payment_history_job_actor_current_v1(j) then raise exception using errcode='42501',message='payment_history_actor_revoked';end if;
 if p_operation='stage' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 200 then raise exception using errcode='22023',message='payment_history_chunk_limit';end if;
  v_ordinal:=j.processed_rows;
  for r in select value from jsonb_array_elements(p_payload->'rows') loop
   v_ordinal:=v_ordinal+1;
   if v_ordinal>100000 or (r->>'ordinal')::integer is distinct from v_ordinal then raise exception using errcode='22023',message='payment_history_stage_sequence';end if;
   t:=r->'transaction';e:=app_private.payment_history_economics_v1(t);
   select * into u from public.payment_history_uploads where shop_id=j.shop_id and upload_id=(r->>'upload_id')::uuid and upload_id=any(j.source_upload_ids) and state='verified';
   if not found or u.file_sha256 is distinct from t#>>'{source,fileSha256}' or coalesce(t#>>'{source,rowNumber}','') !~ '^[1-9][0-9]{0,6}$'
    or length(coalesce(t#>>'{source,sheetName}','')) not between 1 and 256 then raise exception using errcode='22023',message='payment_history_stage_source';end if;
   v_hash:=app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',t#>>'{merchant,local}',t#>>'{merchant,seller}',t#>>'{merchant,sellerId}',t#>>'{merchant,localNumber}',t#>>'{merchant,rut}']);
   insert into public.payment_history_staged_movements(shop_id,job_id,ordinal,source_upload_id,source_row,source_sheet,alias_key,economic_digest,transaction,economics)
    values(j.shop_id,j.job_id,v_ordinal,u.upload_id,(t#>>'{source,rowNumber}')::integer,t#>>'{source,sheetName}',v_hash,app_private.payment_history_economic_digest_v1(e),t,e);
  end loop;
  update public.payment_history_jobs set processed_rows=v_ordinal,lease_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where job_id=j.job_id;
 elsif p_operation='heartbeat' then
  update public.payment_history_jobs set lease_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where job_id=j.job_id;
 elsif p_operation='finish' then
  if coalesce(p_payload->>'analysis_digest','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_payload->'summary') is distinct from 'object'
   or octet_length((p_payload->'summary')::text)>32768 or jsonb_typeof(p_payload->'diagnostics') is distinct from 'array'
   or octet_length((p_payload->'diagnostics')::text)>262144 or (p_payload#>>'{summary,accepted}')::integer is distinct from j.processed_rows
   or (p_payload ? 'merchants' and (jsonb_typeof(p_payload->'merchants')<>'array' or jsonb_array_length(p_payload->'merchants')>200 or octet_length((p_payload->'merchants')::text)>262144))
   then raise exception using errcode='22023',message='payment_history_analysis_invalid';end if;
  update public.payment_history_jobs set state='review_ready',analysis_digest=p_payload->>'analysis_digest',analysis_summary=p_payload->'summary',
   analysis_merchants=coalesce(p_payload->'merchants',(select coalesce(jsonb_agg(x),'[]') from(select distinct alias_key,transaction->'merchant' source_identity from public.payment_history_staged_movements where job_id=j.job_id)x)),
   diagnostics=p_payload->'diagnostics',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=j.job_id;
 elsif p_operation='fail' then
  if coalesce(p_payload->>'code','') !~ '^getnet_[a-z_]{1,90}$|^history_[a-z_]{1,90}$' then raise exception using errcode='22023',message='payment_history_error_code_invalid';end if;
  update public.payment_history_jobs set state='failed',error_code=p_payload->>'code',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=j.job_id;
 else raise exception using errcode='22023',message='payment_history_worker_operation_invalid';end if;
 return jsonb_build_object('ok',true,'processed_rows',case when p_operation='stage' then v_ordinal else j.processed_rows end);
end;$$;
revoke all on function public.payment_history_worker_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_worker_v1(text,jsonb) to service_role;

create function app_private.payment_history_review_rows_v1(p_job uuid)
returns table(ordinal integer,merchant_id uuid,identity_key text,previous_version_id uuid,decision text,code text)
language sql volatile security definer set search_path='' as $$
 with job as materialized (select j.*,r.revision,r.writer_epoch from public.payment_history_jobs j join public.payment_history_runtime r using(shop_id) where j.job_id=p_job),
 proofs as materialized(select array(select jsonb_array_elements_text(coalesce(configuration->'evidence_ids','[]'))::uuid) ids from job),
 base as materialized (
 select s.*,a.merchant_id canonical_merchant_id,e.status alias_evidence_status,e.verification_level alias_evidence_level,
  encode(extensions.digest(convert_to(s.shop_id::text||chr(31)||'getnet'||chr(31)||a.merchant_id::text||chr(31)||(s.transaction->>'externalNamespace')||chr(31)||(s.transaction->>'externalId'),'UTF8'),'sha256'),'hex') global_key,
  row_number() over(partition by a.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId' order by s.ordinal) identity_ordinal,
  min((s.transaction#>>'{timestamp,businessDateTime}')::date) over() first_date
 from public.payment_history_staged_movements s join job j on j.job_id=s.job_id
 left join public.payment_history_merchant_aliases a on a.shop_id=s.shop_id and a.alias_key=s.alias_key and a.active
 left join public.payment_history_evidence e on e.shop_id=a.shop_id and e.evidence_id=a.evidence_id and e.kind='merchant_mapping'
 ), collisions as materialized (
 select b.global_key from base b where b.global_key is not null group by b.global_key having
 count(distinct b.economics->>'businessTicks')>1 or count(distinct b.economics->>'grossClp')>1 or count(distinct b.economics->>'movementKind')>1 or count(distinct b.economics->>'transactionState')>1
 or count(distinct b.economics->>'commissionClp')>1 or count(distinct b.economics->>'commissionVatClp')>1 or count(distinct b.economics->>'netClp')>1
 ), classified as (
 select b.ordinal,b.canonical_merchant_id,b.global_key,coalesce(active.movement_version_id,previous.movement_version_id) previous_id,
 case
 when b.canonical_merchant_id is null or b.alias_evidence_status is distinct from 'verified' or b.alias_evidence_level is null or b.alias_evidence_level='unverified' then 'history_merchant_unverified'
 when not exists(select 1 from public.payment_history_uploads u,job j where u.shop_id=b.shop_id and u.upload_id=b.source_upload_id and u.upload_id=any(j.source_upload_ids) and u.state='verified' and u.file_sha256=b.transaction#>>'{source,fileSha256}') then 'history_upload_unverified'
 when not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'native_start',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_native_start_unverified'
 when exists(select 1 from public.pos_sales n where n.shop_id=b.shop_id and n.status='accepted' and n.business_date<= (b.transaction#>>'{timestamp,businessDateTime}')::date) then 'history_native_overlap'
 when b.transaction->>'profile'='GetnetModern' and not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'modern_time',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_provider_time_unverified'
 when b.transaction->>'profile'='GetnetLegacy' and not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'legacy_currency',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_currency_unverified'
 when collision.global_key is not null or (active.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(active.transaction))) then 'history_active_economics_conflict'
 when active.movement_version_id is not null or b.identity_ordinal>1 then 'history_duplicate'
 when previous.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(previous.transaction))
 and not exists(select 1 from job j,jsonb_array_elements(coalesce(j.configuration->'corrections','[]')) approval
  join public.payment_history_evidence e on e.evidence_id=(approval->>'evidence_id')::uuid
  where e.shop_id=b.shop_id and e.kind='economic_correction' and e.status='verified' and e.verification_level<>'unverified'
  and approval @> jsonb_build_object('identity_key',b.global_key,'previous_version_id',previous.movement_version_id,'previous_digest',previous.economic_digest,
    'proposed_digest',b.economic_digest,'analysis_digest',j.analysis_digest,'revision',j.revision::text,'writer_epoch',j.writer_epoch::text,
    'source_upload_id',b.source_upload_id,'source_row',b.source_row,'source_sheet',b.source_sheet)) then 'history_inactive_correction_unapproved'
 else 'history_new' end reason
 from base b cross join proofs p
 left join collisions collision on collision.global_key=b.global_key
 left join public.payment_history_movement_versions active on active.shop_id=b.shop_id and active.identity_key=b.global_key and active.active
 left join lateral(select v.* from public.payment_history_movement_versions v where v.shop_id=b.shop_id and v.identity_key=b.global_key and not v.active order by v.created_revision desc,v.movement_version_id desc limit 1) previous on true
 ) select c.ordinal,c.canonical_merchant_id,c.global_key,c.previous_id,
 case c.reason when 'history_new' then 'new' when 'history_duplicate' then 'duplicate' when 'history_active_economics_conflict' then 'conflict' else 'blocked' end,c.reason from classified c;
$$;
revoke all on function app_private.payment_history_review_rows_v1(uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_review_v1(p_job uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with rows as materialized(select * from app_private.payment_history_review_rows_v1(p_job)),
 summary as (select count(*) total,count(*) filter(where decision='new') new_count,count(*) filter(where decision='duplicate') duplicate_count,
  count(*) filter(where decision='conflict') conflicts,count(*) filter(where decision='blocked') blocked,
  coalesce(sum((s.economics->>'grossClp')::numeric) filter(where r.decision='new'),0)::bigint::text new_gross_clp,
  coalesce(sum((s.economics->>'netClp')::numeric) filter(where r.decision='new'),0)::bigint::text known_new_net_clp,
  count(*) filter(where r.decision='new' and s.economics->>'netClp' is not null) known_new_net_count
  from rows r join public.payment_history_staged_movements s on s.job_id=p_job and s.ordinal=r.ordinal)
 select jsonb_build_object('shop_id',j.shop_id,'dataset_id',r.dataset_id,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text,
 'writer_ready',r.writer_authority='web' and r.inventory_verified,'summary',to_jsonb(s),
 'can_commit',s.total>0 and s.blocked=0 and s.conflicts=0 and r.writer_authority='web' and r.inventory_verified,
 'reasons',coalesce((select jsonb_agg(x.code) from(select distinct code from rows where decision in ('blocked','conflict') order by code limit 20)x),'[]'),
 'review_digest',encode(extensions.digest(convert_to(jsonb_build_object('job',j.job_id,'analysis',j.analysis_digest,'configuration',j.configuration,
 'actor',jsonb_build_object('kind',j.actor_kind,'id',j.actor_id,'session_id',j.actor_session_id,'credential_version',j.actor_credential_version),
 'revision',r.revision::text,'epoch',r.writer_epoch::text,'authority',r.writer_authority,'inventory',r.inventory_verified,'summary',to_jsonb(s),
 'decisions',(select encode(extensions.digest(convert_to(coalesce(string_agg(ordinal::text||':'||coalesce(merchant_id::text,'')||':'||coalesce(identity_key,'')||':'||coalesce(previous_version_id::text,'')||':'||code,'|' order by ordinal),''),'UTF8'),'sha256'),'hex') from rows),
 'proofs',(select coalesce(jsonb_agg(jsonb_build_object('id',e.evidence_id,'status',e.status,'level',e.verification_level,'scope',e.scope) order by e.evidence_id),'[]') from public.payment_history_evidence e where e.shop_id=j.shop_id))::text,'UTF8'),'sha256'),'hex'))
 from public.payment_history_jobs j join public.payment_history_runtime r using(shop_id) cross join summary s where j.job_id=p_job;
$$;
revoke all on function app_private.payment_history_review_v1(uuid) from public,anon,authenticated,service_role;

create table public.payment_history_events(
 event_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 actor_kind text not null,actor_id uuid not null,operation text not null,subject_id uuid,created_at timestamptz not null default clock_timestamp()
);
alter table public.payment_history_events enable row level security;
revoke all on public.payment_history_events from public,anon,authenticated,service_role;
create trigger payment_history_event_immutable before update or delete on public.payment_history_events for each row execute function app_private.payment_history_immutable_v1();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-history-sources','payment-history-sources',false,20971520,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/pdf','image/png','image/jpeg']);

create function public.payment_history_request_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;cap text;result jsonb;r public.payment_history_runtime;j public.payment_history_jobs;b public.payment_history_batches;
 receipt public.payment_history_receipts;u public.payment_history_uploads;e public.payment_history_evidence;
 v_request uuid;v_digest text;v_id uuid;v_batch uuid;v_operation uuid;v_review jsonb;v_ids uuid[];v_revision bigint;v_count integer;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 cap:=case when p_operation in ('capabilities','read','status','receipt','upload_status','metadata') then 'read' when p_operation in ('upload_create','upload_ready','start','configure','review','commit','evidence','merchant') then 'import'
  when p_operation in ('cancel_job','resume_job') then 'import' when p_operation='cancel_batch' then 'cancel' when p_operation='export' then 'export' when p_operation='permissions' then 'migrate' end;
 a:=app_private.payment_history_demand_actor_v1(p_shop_id,cap,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 -- Same actor/request-key is serialized across both jobs and receipts.
 if p_operation in ('start','commit','cancel_batch') then
  v_request:=(p_payload->>'request_key')::uuid;
  if v_request is null then raise exception using errcode='22023',message='payment_history_request_key_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-history-request:'||p_shop_id::text||':'||(a->>'kind')||':'||(a->>'id')||':'||v_request::text,0));
  v_digest:=encode(extensions.digest(convert_to(p_operation||':'||p_payload::text,'UTF8'),'sha256'),'hex');
  select * into receipt from public.payment_history_receipts where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=v_request;
  if found then
   if receipt.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
   return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',receipt.receipt);
  end if;
 end if;
 if p_operation='capabilities' then
  result:=jsonb_build_object('capabilities',(select jsonb_object_agg(c,case when a->>'kind'='pos_staff_manager' then app_private.payment_history_staff_can_v1(p_shop_id,(a->>'id')::uuid,c) else app_private.payment_history_profile_can_v1(p_shop_id,c) end) from unnest(array['read','import','cancel','export','migrate']) c),
   'runtime',(select jsonb_build_object('dataset_id',dataset_id,'revision',revision::text,'writer_epoch',writer_epoch::text,'writer_authority',writer_authority,'inventory_verified',inventory_verified) from public.payment_history_runtime where shop_id=p_shop_id));
 elsif p_operation='metadata' then
  result:=jsonb_build_object('merchants',(select coalesce(jsonb_agg(x),'[]') from(select merchant_id,label,evidence_id from public.payment_history_merchants where shop_id=p_shop_id order by merchant_id limit 201)x),
   'aliases',(select coalesce(jsonb_agg(x),'[]') from(select alias_key,merchant_id,evidence_id from public.payment_history_merchant_aliases where shop_id=p_shop_id and active order by alias_key limit 201)x),
   'evidence',(select coalesce(jsonb_agg(x),'[]') from(select evidence_id,kind,verification_level,policy_version,reference,scope from public.payment_history_evidence where shop_id=p_shop_id and status='verified' and kind in ('merchant_mapping','legacy_currency','native_start','modern_time','economic_correction') order by evidence_id limit 201)x));
 elsif p_operation='upload_create' then
  if coalesce(p_payload->>'sha256','') !~ '^[0-9a-f]{64}$' or length(coalesce(p_payload->>'file_name','')) not between 1 and 256 or (p_payload->>'byte_length')::bigint not between 1 and 20971520
   or coalesce(p_payload->>'file_name','') !~* '\.(xlsx|pdf|png|jpg|jpeg)$' then raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
  if (select count(*) from public.payment_history_uploads where shop_id=p_shop_id and actor_id=(a->>'id')::uuid and state='pending' and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception using errcode='54000',message='payment_history_upload_backpressure';end if;
  v_id:=gen_random_uuid();
  insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length)
   values(v_id,p_shop_id,a->>'kind',(a->>'id')::uuid,'history/'||p_shop_id::text||'/'||v_id::text,p_payload->>'file_name',p_payload->>'sha256',(p_payload->>'byte_length')::bigint) returning * into u;
  result:=jsonb_build_object('upload_id',u.upload_id,'object_key',u.object_key);
 elsif p_operation in ('upload_ready','upload_status') then
  select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'upload_id')::uuid and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid for update;
  if not found then raise exception using errcode='42501',message='payment_history_upload_actor_mismatch';end if;
  if p_operation='upload_ready' and u.state='pending' then update public.payment_history_uploads set state='uploaded' where upload_id=u.upload_id;u.state:='uploaded';end if;
  result:=jsonb_build_object('upload_id',u.upload_id,'state',u.state,'file_name',u.file_name,'sha256',u.file_sha256,'byte_length',u.byte_length::text);
 elsif p_operation='start' then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=v_request;
  if found then
   if j.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  else
   if jsonb_typeof(p_payload->'upload_ids') is distinct from 'array' or jsonb_array_length(p_payload->'upload_ids') not between 1 and 10 or jsonb_typeof(p_payload->'configuration') is distinct from 'object'
    or octet_length((p_payload->'configuration')::text)>32768 then raise exception using errcode='22023',message='payment_history_job_invalid';end if;
   v_ids:=array(select jsonb_array_elements_text(p_payload->'upload_ids')::uuid);
   if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x) or cardinality(v_ids)<>(select count(*) from public.payment_history_uploads where shop_id=p_shop_id and upload_id=any(v_ids) and state='verified' and file_name ~* '\.xlsx$' and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid)
    or (select sum(byte_length) from public.payment_history_uploads where upload_id=any(v_ids))>104857600 then raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-queue:'||p_shop_id::text,0));
   if (select count(*) from public.payment_history_jobs where shop_id=p_shop_id and state in ('queued','analysing','review_ready'))>=5 then raise exception using errcode='54000',message='payment_history_job_backpressure';end if;
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   insert into public.payment_history_jobs(shop_id,actor_kind,actor_id,actor_session_id,actor_credential_version,request_key,request_digest,parser_version,configuration,source_upload_ids)
    values(p_shop_id,a->>'kind',(a->>'id')::uuid,(a->>'session_id')::uuid,(a->>'credential_version')::integer,v_request,v_digest,'getnet-ooxml-web-v1',p_payload->'configuration',v_ids) returning * into j;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  end if;
 elsif p_operation in ('status','configure','review','commit','cancel_job','resume_job') then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and job_id=(p_payload->>'job_id')::uuid for update;
  if not found or j.actor_kind<>a->>'kind' or j.actor_id<>(a->>'id')::uuid or (p_operation<>'resume_job' and (j.actor_session_id<>(a->>'session_id')::uuid
   or j.actor_credential_version is distinct from (a->>'credential_version')::integer)) then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
  if p_operation='status' then
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state,'processed_rows',j.processed_rows,'summary',j.analysis_summary,'diagnostics',j.diagnostics,'error_code',j.error_code,
    'merchants',j.analysis_merchants);
  elsif p_operation='resume_job' then
   if j.state not in ('queued','analysing','review_ready') then raise exception using errcode='55000',message='payment_history_job_not_resumable';end if;
   update public.payment_history_jobs set actor_session_id=(a->>'session_id')::uuid,actor_credential_version=(a->>'credential_version')::integer,
    state=case when state='analysing' then 'queued' else state end,lease_token=null,lease_expires_at=null,lease_fence=lease_fence+1,review_digest=null,reviewed_at=null where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state',case when j.state='analysing' then 'queued' else j.state end);
  elsif p_operation='cancel_job' then
   if j.state in ('committing','committed') then raise exception using errcode='55000',message='payment_history_commit_already_started';end if;
   update public.payment_history_jobs set state='cancelled',lease_token=null,lease_expires_at=null,review_digest=null,updated_at=clock_timestamp() where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state','cancelled');
  elsif p_operation='configure' then
   if j.state<>'review_ready' or jsonb_typeof(p_payload->'evidence_ids') is distinct from 'array' or jsonb_array_length(p_payload->'evidence_ids')>200
    or jsonb_typeof(coalesce(p_payload->'corrections','[]'))<>'array' or jsonb_array_length(coalesce(p_payload->'corrections','[]'))>200 then raise exception using errcode='22023',message='payment_history_review_configuration_invalid';end if;
   v_ids:=array(select jsonb_array_elements_text(p_payload->'evidence_ids')::uuid);
   if cardinality(v_ids)<>(select count(*) from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=any(v_ids) and status='verified') then raise exception using errcode='22023',message='payment_history_evidence_invalid';end if;
   update public.payment_history_jobs set configuration=configuration||jsonb_build_object('evidence_ids',p_payload->'evidence_ids','corrections',coalesce(p_payload->'corrections','[]')),review_digest=null,reviewed_at=null where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  else
   if j.state<>'review_ready' then raise exception using errcode='55000',message='payment_history_review_not_ready';end if;
   select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
   -- Freeze evidence and aliases while the content-bound decision is published.
   perform 1 from public.payment_history_evidence where shop_id=p_shop_id order by evidence_id for share;
   perform 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and active order by alias_id for share;
   -- demand_actor holds this shop FOR SHARE. Native pos_sales_sync_apply_v1
   -- takes the same shop FOR UPDATE before inserting sales: overlap checking
   -- is serialized per shop, without a global lock on the POS sales table.
   v_review:=app_private.payment_history_review_v1(j.job_id);
   if p_operation='review' then
    update public.payment_history_jobs set reviewed_revision=r.revision,reviewed_writer_epoch=r.writer_epoch,review_digest=v_review->>'review_digest',reviewed_at=clock_timestamp() where job_id=j.job_id;
    result:=v_review;
   else
    if coalesce(v_review->>'can_commit','false')<>'true' or j.review_digest is null or j.review_digest is distinct from p_payload->>'review_digest'
     or j.review_digest is distinct from v_review->>'review_digest' or j.reviewed_revision is distinct from r.revision or j.reviewed_writer_epoch is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_review_stale_or_blocked';end if;
    v_batch:=gen_random_uuid();v_operation:=gen_random_uuid();v_revision:=r.revision+1;
    insert into public.payment_history_batches(batch_id,shop_id,job_id,origin,apply_operation_id,created_revision) values(v_batch,p_shop_id,j.job_id,'web_import',v_operation,v_revision);
    -- One canonical version per identity. Duplicates retain their existing owner.
    insert into public.payment_history_movement_versions(shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,
      gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_upload_id,source_row,source_sheet,supersedes_version_id,created_revision)
     select p_shop_id,d.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId',d.identity_key,s.economic_digest,(s.economics->>'businessTicks')::bigint,(s.transaction#>>'{timestamp,businessDateTime}')::date,
      (s.economics->>'grossClp')::bigint,(s.economics->>'commissionClp')::bigint,(s.economics->>'commissionVatClp')::bigint,(s.economics->>'netClp')::bigint,s.economics->>'movementKind',s.economics->>'transactionState',s.transaction,v_batch,s.source_upload_id,s.source_row,s.source_sheet,d.previous_version_id,v_revision
     from app_private.payment_history_review_rows_v1(j.job_id) d join public.payment_history_staged_movements s on s.job_id=j.job_id and s.ordinal=d.ordinal where d.decision='new';
    insert into public.payment_history_duplicate_observations(shop_id,batch_id,movement_version_id,source_upload_id,source_sheet,source_row)
     select p_shop_id,v_batch,v.movement_version_id,s.source_upload_id,s.source_sheet,s.source_row
      from app_private.payment_history_review_rows_v1(j.job_id) d join public.payment_history_staged_movements s on s.job_id=j.job_id and s.ordinal=d.ordinal
      join public.payment_history_movement_versions v on v.shop_id=p_shop_id and v.identity_key=d.identity_key and v.active
      where d.decision='duplicate' and not (v.owner_batch_id=v_batch and v.source_upload_id=s.source_upload_id and v.source_sheet=s.source_sheet and v.source_row=s.source_row);
    result:=jsonb_build_object('operation_id',v_operation,'batch_id',v_batch,'kind','apply','dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,'summary',v_review->'summary');
    insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt) values(v_operation,p_shop_id,v_batch,'apply',a->>'kind',(a->>'id')::uuid,v_request,v_digest,result);
    insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
     select p_shop_id,v_revision,row_number() over(order by movement_version_id)::integer,movement_version_id,v_operation,'upsert' from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=v_batch;
    update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
    update public.payment_history_jobs set state='committed',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=j.job_id;
   end if;
  end if;
 elsif p_operation='cancel_batch' then
  select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
  if not found or r.writer_authority<>'web' or not r.inventory_verified or (p_payload->>'revision')::bigint is distinct from r.revision or (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_writer_not_ready';end if;
  select * into b from public.payment_history_batches where shop_id=p_shop_id and batch_id=(p_payload->>'batch_id')::uuid for update;
  if not found or b.state<>'active' then raise exception using errcode='55000',message='payment_history_batch_not_active';end if;
  v_operation:=gen_random_uuid();v_revision:=r.revision+1;
  select count(*) into v_count from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  result:=jsonb_build_object('operation_id',v_operation,'batch_id',b.batch_id,'kind','cancel','dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,'deactivated',v_count);
  insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt) values(v_operation,p_shop_id,b.batch_id,'cancel',a->>'kind',(a->>'id')::uuid,v_request,v_digest,result);
  insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
   select p_shop_id,v_revision,row_number() over(order by movement_version_id)::integer,movement_version_id,v_operation,'tombstone' from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  update public.payment_history_movement_versions set active=false where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  update public.payment_history_batches set state='cancelled',cancelled_revision=v_revision,cancelled_at=clock_timestamp() where batch_id=b.batch_id;
  update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
 elsif p_operation in ('read','export') then
  v_count:=coalesce((p_payload->>'limit')::integer,50);
  if v_count not between 1 and 200 then raise exception using errcode='22023',message='payment_history_page_limit';end if;
  select * into r from public.payment_history_runtime where shop_id=p_shop_id;
  if p_payload ? 'revision' and (p_payload->>'revision')::bigint is distinct from r.revision then raise exception using errcode='40001',message='payment_history_revision_changed';end if;
  result:=jsonb_build_object('configured',found,'coverage','observed_records_only','dataset_id',r.dataset_id,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,
   'rows',(select coalesce(jsonb_agg(x order by x.movement_version_id),'[]') from(select movement_version_id,merchant_id,owner_batch_id,active,business_ticks::text,gross_clp::text,commission_clp::text,commission_vat_clp::text,net_clp::text,movement_kind,transaction_state,created_revision::text from public.payment_history_movement_versions
    where shop_id=p_shop_id and movement_version_id>coalesce((p_payload->>'after')::uuid,'00000000-0000-0000-0000-000000000000') order by movement_version_id limit v_count)x),
   'batches',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select batch_id,origin,state,created_revision::text,cancelled_revision::text,created_at from public.payment_history_batches where shop_id=p_shop_id order by created_at desc limit 50)x));
 elsif p_operation='receipt' then
  select * into receipt from public.payment_history_receipts where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=(p_payload->>'request_key')::uuid;
  result:=jsonb_build_object('receipt',case when found then receipt.receipt else null end);
 else
  -- Legal-owner grants and provider verification remain protected. Operational
  -- import actors may attest currency, mapping and actual first-use evidence.
  if (p_operation='permissions' or (p_operation='evidence' and (p_payload->>'kind'='modern_time' or p_payload->>'level'='provider_verified' or p_payload->>'action'='revoke')))
   and (a->>'kind'<>'personal_account' or not exists(select 1 from public.shop_members where shop_id=p_shop_id and profile_id=(a->>'id')::uuid and role_key='shop_owner' and membership_status='active')) then raise exception using errcode='42501',message='payment_history_owner_required';end if;
  if p_operation='permissions' then
   if coalesce(p_payload->>'role','') not in ('shop_manager','manager','pos_admin') or coalesce(p_payload->>'capability','') not in ('read','import','cancel','export','migrate') or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception using errcode='22023',message='payment_history_permission_invalid';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-role:'||p_shop_id::text||':'||(p_payload->>'role'),0));
   insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values(p_shop_id,p_payload->>'role',p_payload->>'capability',(p_payload->>'enabled')::boolean)
    on conflict(shop_id,role_key,capability) do update set enabled=excluded.enabled,updated_at=clock_timestamp();result:=jsonb_build_object('saved',true);
  elsif p_operation='evidence' then
   if p_payload->>'action'='revoke' then
    update public.payment_history_evidence set status='revoked',revoked_at=clock_timestamp() where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid and status<>'revoked' returning * into e;
    if not found then raise exception using errcode='22023',message='payment_history_evidence_not_found';end if;
   else
    if coalesce(p_payload->>'kind','') not in ('merchant_mapping','legacy_currency','native_start','modern_time','economic_correction')
     or jsonb_typeof(p_payload->'scope') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload->'scope') k where k not in ('merchant_id','alias_key','file_sha256','from_ticks','to_ticks','native_start_ticks','interpretation'))
     or jsonb_typeof(p_payload#>'{scope,file_sha256}') is distinct from 'array' or jsonb_array_length(p_payload#>'{scope,file_sha256}') not between 1 and 10
     or exists(select 1 from jsonb_array_elements_text(p_payload#>'{scope,file_sha256}') h where h !~ '^[0-9a-f]{64}$')
     or coalesce(p_payload#>>'{scope,from_ticks}','') !~ '^[0-9]{1,19}$' or coalesce(p_payload#>>'{scope,to_ticks}','') !~ '^[0-9]{1,19}$'
     or (p_payload#>>'{scope,from_ticks}')::bigint>=(p_payload#>>'{scope,to_ticks}')::bigint then raise exception using errcode='22023',message='payment_history_evidence_scope_invalid';end if;
    if p_payload->>'level'='provider_verified' then
     select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'document_upload_id')::uuid and state='verified' for share;
     if not found or u.file_sha256 is distinct from p_payload->>'document_sha256' then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
    end if;
    if p_payload->>'kind'='modern_time' and p_payload->>'level' is distinct from 'provider_verified' then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
    insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,document_sha256,document_upload_id,scope,actor_kind,actor_id,verified_at)
     values(p_shop_id,p_payload->>'kind',p_payload->>'level','verified',p_payload->>'version',p_payload->>'reference',p_payload->>'document_sha256',(p_payload->>'document_upload_id')::uuid,p_payload->'scope',a->>'kind',(a->>'id')::uuid,clock_timestamp()) returning * into e;
   end if;
   v_id:=e.evidence_id;result:=jsonb_build_object('evidence_id',e.evidence_id,'status',e.status);
  elsif p_operation='merchant' then
   select * into e from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid and kind='merchant_mapping' and status='verified' and verification_level<>'unverified' for share;
   if not found then raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
   v_id:=coalesce((p_payload->>'merchant_id')::uuid,gen_random_uuid());
   if not exists(select 1 from public.payment_history_merchants where shop_id=p_shop_id and merchant_id=v_id) then
    insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values(v_id,p_shop_id,p_payload->>'label',e.evidence_id);
   end if;
   if e.scope->>'merchant_id' is distinct from v_id::text then raise exception using errcode='22023',message='payment_history_merchant_evidence_scope';end if;
   v_digest:=app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',p_payload#>>'{source_identity,local}',p_payload#>>'{source_identity,seller}',p_payload#>>'{source_identity,sellerId}',p_payload#>>'{source_identity,localNumber}',p_payload#>>'{source_identity,rut}']);
   if e.scope->>'alias_key' is distinct from v_digest then raise exception using errcode='22023',message='payment_history_merchant_evidence_scope';end if;
   if exists(select 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and alias_key=v_digest and active and merchant_id<>v_id) then raise exception using errcode='23505',message='payment_history_alias_collision';end if;
   insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id) values(p_shop_id,v_id,v_digest,p_payload->'source_identity',e.evidence_id)
    on conflict(shop_id,alias_version,alias_key) where active do nothing;
   result:=jsonb_build_object('merchant_id',v_id,'alias_key',v_digest);
  else raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 end if;
 if p_operation not in ('read','export','capabilities','status','receipt','metadata','upload_status') then
  insert into public.payment_history_events(shop_id,actor_kind,actor_id,operation,subject_id) values(p_shop_id,a->>'kind',(a->>'id')::uuid,p_operation,coalesce(v_id,j.job_id,b.batch_id));
 end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',result);
end;$$;
revoke all on function public.payment_history_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;
